import "./ui/theme.js";
import DOMPurify from "dompurify";
import {
    initAuth,
    requireAuthentication,
    getAuthToken,
    handleUnauthorized,
} from "./auth.js";
import { getAuthHeaders } from "./language/language-service.js";
import { Judge0Error } from "./api.js";
import * as monaco from "./editor/monaco.js";
import { createEditor, setFontSizeForEditors } from "./editor/editor-manager.js";
import { createLayoutManager } from "./layout/layout-manager.js";
import { createStatusUI } from "./ui/status-bar.js";
import { createErrorModal } from "./ui/error-modal.js";
import { registerKeyboardShortcuts } from "./ui/keyboard-shortcuts.js";
import { debounce } from "./state/persistence.js";
import {
    fetchDailyChallenges,
    submitSolution,
    submitSolutionStream,
} from "./challenges/challenge-api.js";
import { languageLabel, editorModeFor } from "./challenges/language-labels.js";
import {
    getChallengeLanguages,
    getStartingCode,
    normalizeTestCases,
    normalizeSubmitResponse,
    parseCustomArgs,
} from "./challenges/challenge-model.js";
import { formatCustomResult, formatSubmissionVerdict } from "./challenges/challenge-results.js";
import {
    loadChallengeDraft,
    saveChallengeDraft,
    clearChallengeDraft,
} from "./challenges/challenge-drafts.js";
import { createChallengeView } from "./challenges/challenge-view.js";

const DRAFT_DEBOUNCE_MS = 700;

const errorModal = createErrorModal();
let layoutManager;
let sourceEditor;
let customInputEditor;
let outputEditor;
let statusUI;
let view;
let fontSize = 13;

let challenges = [];
let challenge = null;
let testCases = [];
let languageKeys = [];
let currentLanguageKey = null;
let applyingState = false;
let isSubmitting = false;
let hasLoaded = false;

let $selectLanguage;
let $selectChallenge;
let $runTestsBtn;
let $runCustomBtn;
let $resetBtn;

function authHeaders() {
    return getAuthHeaders(getAuthToken());
}

function isUnauthorized(error) {
    return error instanceof Judge0Error && error.status === 401;
}

function showApiError(title, error) {
    if (isUnauthorized(error)) {
        handleUnauthorized();
        return;
    }
    const status = error instanceof Judge0Error ? error.status : 0;
    const statusText =
        error instanceof Judge0Error ? error.statusText : String(error?.message || error);
    const body = error instanceof Judge0Error ? error.body : null;
    let detail = body?.error || (body ? JSON.stringify(body, null, 4) : "");
    if (status === 404 && title.startsWith("Submission")) {
        detail +=
            "\n\nThe backend may not implement POST /challenges/{id}/submit yet " +
            "(see docs/challenge-submit-contract.md).";
    }
    errorModal.showError(
        `${title}: ${statusText} (${status})`,
        `<pre>${DOMPurify.sanitize(detail.trim())}</pre>`,
    );
}

function setLoadingMessage(message) {
    const panel = document.getElementById("skwtr-challenge-panel");
    panel.innerHTML = "";
    const node = document.createElement("div");
    node.className = "skwtr-challenge-placeholder";
    node.textContent = message;
    panel.appendChild(node);
}

function setControlsEnabled(enabled) {
    $selectLanguage.prop("disabled", !enabled);
    $runTestsBtn.prop("disabled", !enabled || testCases.length === 0);
    $runCustomBtn.prop("disabled", !enabled);
    $resetBtn.prop("disabled", !enabled);
}

// --- Language / source handling -------------------------------------------

function applyEditorMode(key) {
    if (!sourceEditor) return;
    monaco.editor.setModelLanguage(sourceEditor.getModel(), editorModeFor(key));
}

// Semantic UI watches the underlying <select> with a MutationObserver and
// rebuilds its menu asynchronously, so mark the chosen option as `selected`
// up front instead of calling `set selected` (the menu item does not exist yet).
function populateLanguageDropdown(selectedKey) {
    $selectLanguage.empty();
    languageKeys.forEach((key) => {
        const option = new Option(languageLabel(key), key);
        option.selected = key === selectedKey;
        $selectLanguage.append(option);
    });
}

function saveCurrentDraft() {
    if (!challenge || !currentLanguageKey || !sourceEditor) return;
    const code = sourceEditor.getValue();
    const starter = getStartingCode(challenge, currentLanguageKey);
    if (code === starter) {
        clearChallengeDraft(challenge.id, currentLanguageKey);
    } else {
        saveChallengeDraft(challenge.id, currentLanguageKey, code);
    }
    statusUI.setSaveStatus("saved");
}

const scheduleDraftSave = debounce(saveCurrentDraft, DRAFT_DEBOUNCE_MS);

function onSourceChanged() {
    if (applyingState) return;
    statusUI.setSaveStatus("unsaved");
    scheduleDraftSave();
}

function loadSourceForLanguage(key, { preferDraft = true } = {}) {
    if (!key || !challenge) return;
    const draft = preferDraft ? loadChallengeDraft(challenge.id, key) : null;
    const code = draft ?? getStartingCode(challenge, key);
    applyingState = true;
    sourceEditor.setValue(code);
    applyEditorMode(key);
    applyingState = false;
    currentLanguageKey = key;
    statusUI.setSaveStatus("saved");
}

function onLanguageChanged() {
    const key = $selectLanguage.val();
    if (!key || key === currentLanguageKey) return;
    saveCurrentDraft();
    loadSourceForLanguage(key);
    view.resetResults();
}

function resetToStartingCode() {
    if (!currentLanguageKey || !challenge) return;
    if (!window.confirm("Replace your code with the challenge's starting code?")) return;
    clearChallengeDraft(challenge.id, currentLanguageKey);
    loadSourceForLanguage(currentLanguageKey, { preferDraft: false });
    view.resetResults();
}

// --- Challenge loading -----------------------------------------------------

function populateChallengeDropdown(selectedId) {
    const $item = $("#skwtr-challenge-select-item");
    $selectChallenge.empty();
    if (challenges.length <= 1) {
        $item.addClass("judge0-hidden");
        return;
    }
    challenges.forEach((item) => {
        const option = new Option(item.title || `Challenge #${item.id}`, item.id);
        option.selected = item.id === selectedId;
        $selectChallenge.append(option);
    });
    $item.removeClass("judge0-hidden");
}

function selectChallenge(next) {
    if (challenge && currentLanguageKey) saveCurrentDraft();
    challenge = next;
    testCases = normalizeTestCases(challenge.test_cases);
    currentLanguageKey = null;

    view.renderDescription(challenge);
    view.renderTests(testCases);

    languageKeys = getChallengeLanguages(challenge);
    const preferred =
        languageKeys.find((key) => getStartingCode(challenge, key)) || languageKeys[0] || null;
    populateLanguageDropdown(preferred);
    if (preferred) loadSourceForLanguage(preferred);

    const sample = testCases.find((testCase) => Array.isArray(testCase.input));
    applyingState = true;
    customInputEditor.setValue(sample ? JSON.stringify(sample.input) : "[]");
    outputEditor.setValue("");
    applyingState = false;
    statusUI.setExecutionStatus("");
    document.title = `${challenge.title || "Challenge"} · SKWTR IDE`;
    setControlsEnabled(Boolean(preferred));
    if (!preferred) {
        errorModal.showError(
            "No languages",
            "This challenge does not list any supported languages.",
        );
    }
}

async function loadChallenges() {
    if (!getAuthToken()) return;
    setLoadingMessage("Loading today's challenge…");
    setControlsEnabled(false);

    try {
        challenges = await fetchDailyChallenges(authHeaders());
    } catch (err) {
        if (isUnauthorized(err)) {
            handleUnauthorized();
            return;
        }
        if (err instanceof Judge0Error && err.status === 404) {
            setLoadingMessage("There is no challenge available today. Check back tomorrow!");
            return;
        }
        setLoadingMessage("Failed to load the daily challenge.");
        showApiError("Error loading challenge", err);
        return;
    }

    if (!challenges.length) {
        setLoadingMessage("There is no challenge available today. Check back tomorrow!");
        return;
    }

    hasLoaded = true;
    const requestedId = new URLSearchParams(window.location.search).get("challenge");
    const initial =
        challenges.find((item) => String(item.id) === requestedId) || challenges[0];
    populateChallengeDropdown(initial.id);
    selectChallenge(initial);
}

// --- Submitting ------------------------------------------------------------

function activateTab(id) {
    const item = layoutManager?.layout.root.getItemsById(id)[0];
    if (item) item.parent.header.parent.setActiveContentItem(item);
}

function beginSubmit(button) {
    isSubmitting = true;
    button.addClass("loading");
    $runTestsBtn.prop("disabled", true);
    $runCustomBtn.prop("disabled", true);
    view.setRunning(true);
}

function endSubmit(button) {
    isSubmitting = false;
    button.removeClass("loading");
    $runTestsBtn.prop("disabled", testCases.length === 0);
    $runCustomBtn.prop("disabled", false);
    view.setRunning(false);
}

function ensureSubmittable() {
    if (isSubmitting || !challenge) return false;
    if (!currentLanguageKey) {
        errorModal.showError("Error", "Select a language first.");
        return false;
    }
    if (sourceEditor.getValue().trim() === "") {
        errorModal.showError("Error", "Source code can't be empty!");
        return false;
    }
    return true;
}

function formatRunStats(response, startedAt) {
    const tat = Math.round(performance.now() - startedAt);
    const time = response.time == null ? "-" : `${response.time}s`;
    const memory = response.memory == null ? "-" : `${response.memory}KB`;
    return `${time}, ${memory} (TAT: ${tat}ms)`;
}

async function runTests() {
    if (!ensureSubmittable() || !testCases.length) return;
    saveCurrentDraft();
    beginSubmit($runTestsBtn);
    view.setAllRunning();
    activateTab("tests");
    statusUI.setExecutionStatus("Submitting…");

    const startedAt = performance.now();
    const streamedResults = new Map();
    let streamTotal = testCases.length;
    try {
        await submitSolutionStream(
            challenge.id,
            { language: currentLanguageKey, sourceCode: sourceEditor.getValue() },
            {
                start(event) {
                    streamTotal = Number.isInteger(event?.total) ? event.total : testCases.length;
                    statusUI.setExecutionStatus(`Running 0/${streamTotal} test cases…`);
                },
                result(rawResult) {
                    const fallbackIndex = streamedResults.size;
                    const index = Number.isInteger(rawResult?.index)
                        ? rawResult.index
                        : fallbackIndex;
                    const localCase = testCases.find((testCase) => testCase.index === index) || {
                        index,
                        hidden: Boolean(rawResult?.hidden),
                    };
                    const response = normalizeSubmitResponse(
                        { results: [{ ...rawResult, index }] },
                        [localCase],
                    );
                    const result = response.results[0];
                    streamedResults.set(index, result);
                    const completed = streamedResults.size;
                    const passed = [...streamedResults.values()]
                        .filter((item) => item.passed === true).length;
                    view.renderStreamResult(result, {
                        completed,
                        total: streamTotal,
                        passed,
                    });
                    statusUI.setExecutionStatus(
                        `Running ${completed}/${streamTotal} test cases…`,
                    );
                },
                done(raw) {
                    const response = normalizeSubmitResponse(raw, testCases);
                    view.renderResults(response);

                    if (response.solved && !challenge.solved) {
                        challenge.solved = true;
                        view.setSolved(true);
                    }

                    const verdict = formatSubmissionVerdict(response);
                    statusUI.setExecutionStatus(
                        `${verdict}, ${formatRunStats(response, startedAt)}`,
                    );
                },
            },
            authHeaders(),
        );
    } catch (err) {
        view.stopStreaming(streamedResults.size, streamTotal);
        statusUI.setExecutionStatus("");
        showApiError("Submission failed", err);
    } finally {
        endSubmit($runTestsBtn);
    }
}


async function runCustom() {
    if (!ensureSubmittable()) return;
    let args;
    try {
        args = parseCustomArgs(customInputEditor.getValue());
    } catch (err) {
        errorModal.showError("Invalid input", DOMPurify.sanitize(err.message));
        activateTab("custom");
        return;
    }

    saveCurrentDraft();
    beginSubmit($runCustomBtn);
    outputEditor.setValue("");
    activateTab("output");
    statusUI.setExecutionStatus("Running…");

    const startedAt = performance.now();
    try {
        const raw = await submitSolution(
            challenge.id,
            {
                language: currentLanguageKey,
                sourceCode: sourceEditor.getValue(),
                testCases: [{ input: args }],
            },
            authHeaders(),
        );
        const response = normalizeSubmitResponse(
            raw,
            [{ index: 0, hidden: false, input: args }],
            { isOverride: true },
        );
        outputEditor.setValue(formatCustomResult(response, challenge.function_name, args));
        statusUI.setExecutionStatus(
            `${formatSubmissionVerdict(response)}, ${formatRunStats(response, startedAt)}`,
        );
    } catch (err) {
        statusUI.setExecutionStatus("");
        showApiError("Submission failed", err);
    } finally {
        endSubmit($runCustomBtn);
    }
}

// --- Layout ----------------------------------------------------------------

function createChallengeLayoutConfig() {
    return {
        settings: { showPopoutIcon: false, reorderEnabled: true },
        content: [
            {
                type: "row",
                content: [
                    {
                        type: "component",
                        width: 36,
                        componentName: "challenge",
                        id: "challenge",
                        title: "Challenge",
                        isClosable: false,
                    },
                    {
                        type: "column",
                        width: 64,
                        content: [
                            {
                                type: "component",
                                height: 62,
                                componentName: "source",
                                id: "source",
                                title: "Solution",
                                isClosable: false,
                            },
                            {
                                type: "stack",
                                height: 38,
                                content: [
                                    {
                                        type: "component",
                                        componentName: "tests",
                                        id: "tests",
                                        title: "Test Cases",
                                        isClosable: false,
                                    },
                                    {
                                        type: "component",
                                        componentName: "custom",
                                        id: "custom",
                                        title: "Custom Input",
                                        isClosable: false,
                                    },
                                    {
                                        type: "component",
                                        componentName: "output",
                                        id: "output",
                                        title: "Output",
                                        isClosable: false,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

function registerComponents(layout) {
    layout.registerComponent("challenge", function (container) {
        container.getElement()[0].appendChild(document.getElementById("skwtr-challenge-panel"));
    });
    layout.registerComponent("tests", function (container) {
        container.getElement()[0].appendChild(document.getElementById("skwtr-tests-panel"));
    });
    layout.registerComponent("source", function (container) {
        sourceEditor = createEditor(container.getElement()[0], {
            language: "plaintext",
            readOnly: false,
            minimap: true,
        });
        sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runTests);
        sourceEditor.onDidChangeModelContent(onSourceChanged);
    });
    layout.registerComponent("custom", function (container) {
        // JSON highlighting via the JavaScript grammar; the JSON language
        // service is deliberately excluded from the Monaco bundle.
        customInputEditor = createEditor(container.getElement()[0], {
            language: "javascript",
            readOnly: false,
            minimap: false,
            placeholder: "Arguments as a JSON array, e.g. [15]",
        });
        customInputEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCustom);
    });
    layout.registerComponent("output", function (container) {
        outputEditor = createEditor(container.getElement()[0], {
            language: "plaintext",
            readOnly: true,
            minimap: false,
            placeholder: "Run with custom input to see the returned value here",
        });
    });
}

function refreshSiteContentHeight() {
    const navigationHeight = document.getElementById("judge0-site-navigation").offsetHeight;
    const siteContent = document.getElementById("judge0-site-content");
    siteContent.style.height = `${window.innerHeight}px`;
    siteContent.style.paddingTop = `${navigationHeight}px`;
}

function refreshLayoutSize() {
    refreshSiteContentHeight();
    layoutManager?.updateSize();
}

function editors() {
    return [sourceEditor, customInputEditor, outputEditor];
}

// --- Boot ------------------------------------------------------------------

window.addEventListener("resize", refreshLayoutSize);

document.addEventListener("DOMContentLoaded", function () {
    initAuth();
    requireAuthentication();
    $(".ui.selection.dropdown").dropdown();
    $("[data-content]").popup({ lastResort: "left center" });
    refreshSiteContentHeight();

    $selectLanguage = $("#select-language");
    $selectChallenge = $("#skwtr-challenge-select");
    $runTestsBtn = $("#skwtr-run-tests-btn");
    $runCustomBtn = $("#skwtr-run-custom-btn");
    $resetBtn = $("#skwtr-reset-code-btn");

    statusUI = createStatusUI({
        saveStatusElement: document.getElementById("judge0-save-status"),
        executionStatusElement: document.getElementById("judge0-status-line"),
    });
    view = createChallengeView({
        descriptionContainer: document.getElementById("skwtr-challenge-panel"),
        testsContainer: document.getElementById("skwtr-tests-panel"),
        onRunAllTests: runTests,
    });

    $selectLanguage.on("change", onLanguageChanged);
    $selectChallenge.on("change", () => {
        const next = challenges.find((item) => String(item.id) === String($selectChallenge.val()));
        if (next && next !== challenge) selectChallenge(next);
    });
    $runTestsBtn.on("click", runTests);
    $runCustomBtn.on("click", runCustom);
    $resetBtn.on("click", resetToStartingCode);

    setControlsEnabled(false);
    setLoadingMessage(getAuthToken() ? "Loading today's challenge…" : "Log in to see today's challenge.");

    layoutManager = createLayoutManager({
        configuration: createChallengeLayoutConfig(),
        container: $("#judge0-site-content"),
        registerComponents,
        onInitialised: async () => {
            setFontSizeForEditors(editors(), fontSize);
            refreshLayoutSize();
            await loadChallenges();
        },
    });
    layoutManager.init();

    registerKeyboardShortcuts({
        run: runTests,
        save: saveCurrentDraft,
        saveAs: saveCurrentDraft,
        open: () => {},
        increaseFontSize: () => setFontSizeForEditors(editors(), (fontSize += 1)),
        decreaseFontSize: () => setFontSizeForEditors(editors(), (fontSize -= 1)),
        resetFontSize: () => setFontSizeForEditors(editors(), (fontSize = 13)),
        focusSource: () => sourceEditor?.focus(),
    });

    const superKey = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform) ? "⌘" : "Ctrl";
    $runTestsBtn.attr("data-content", `${superKey}${$runTestsBtn.attr("data-content")}`);

    window.addEventListener("skwtr:login", () => {
        if (!hasLoaded) loadChallenges();
    });
    window.addEventListener("beforeunload", saveCurrentDraft);
});

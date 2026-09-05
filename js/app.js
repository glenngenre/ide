import configuration from "./configuration.js";
import "./ui/theme.js";
import { requireAuthentication, getAuthToken, initAuth } from "./auth.js";
import { sendChatMessage, getInlineCompletion } from "./integrations/ai.js";
import {
    DEFAULT_SOURCE,
    DEFAULT_STDIN,
    DEFAULT_COMPILER_OPTIONS,
    DEFAULT_CMD_ARGUMENTS,
} from "./constants.js";
import { createEditorState } from "./state/editor-state.js";
import {
    loadDraft,
    clearDraft,
    hasDraft,
    createPersistenceController,
} from "./state/persistence.js";
import {
    downloadFile,
    getFilenameExtension,
    normalizeFilename,
} from "./files/file-service.js";
import {
    getAuthHeaders,
    loadLanguagesIntoDropdown,
    getSelectedLanguageId,
    selectLanguageById,
    selectLanguageForExtension,
    applySelectedLanguage,
} from "./language/language-service.js";
import {
    setFontSizeForEditors,
    registerEditorComponents,
} from "./editor/editor-manager.js";
import { registerInlineCompletionProvider } from "./editor/completion-provider.js";
import { createLayoutConfig } from "./layout/layout-config.js";
import { createLayoutManager } from "./layout/layout-manager.js";
import { createStatusUI } from "./ui/status-bar.js";
import { createErrorModal } from "./ui/error-modal.js";
import { registerKeyboardShortcuts } from "./ui/keyboard-shortcuts.js";
import { createRunController } from "./execution/run-controller.js";
import { registerIframeMessaging } from "./integrations/iframe-messaging.js";

const AUTOSAVE_INTERVAL_MS = 5000;
const editorState = createEditorState();
let fontSize = 13;
let layoutManager;
let sourceEditor;
let stdinEditor;
let stdoutEditor;
let statusUI;
let persistence;
let applyingState = false;
let $selectLanguage;
let $compilerOptions;
let $commandLineArguments;
let $runBtn;
let $fileName;
let runController;

function getStateSnapshot() {
    if (!sourceEditor || !stdinEditor || !$selectLanguage) return null;
    editorState.update({
        sourceCode: sourceEditor.getValue(),
        fileName: editorState.fileName,
        languageId: getSelectedLanguageId($selectLanguage),
        stdin: stdinEditor.getValue(),
        compilerOptions: $compilerOptions.val(),
        commandLineArguments: $commandLineArguments.val(),
    });
    return editorState.snapshot();
}

function markStateDirty() {
    if (!applyingState) persistence?.markDirty();
}

function setSourceCodeName(name, markDirty = true) {
    editorState.setFileName(name);
    if ($fileName) $fileName.val(editorState.fileName);
    const title = $(".lm_title")[0];
    if (title) title.innerText = editorState.fileName;
    if (markDirty && !applyingState) persistence?.markDirty();
}

function persistState() {
    persistence?.flush(true);
}

async function applyDefaults() {
    setFontSizeForEditors([sourceEditor, stdinEditor, stdoutEditor], fontSize);
    const saved = loadDraft();
    editorState.update({
        sourceCode: saved.sourceCode ?? editorState.sourceCode,
        stdin: saved.stdin ?? editorState.stdin,
        languageId: saved.languageId ?? editorState.languageId,
        compilerOptions: saved.compilerOptions ?? editorState.compilerOptions,
        commandLineArguments:
            saved.commandLineArguments ?? editorState.commandLineArguments,
        fileName: saved.fileName ?? editorState.fileName,
    });

    applyingState = true;
    sourceEditor.setValue(editorState.sourceCode);
    stdinEditor.setValue(editorState.stdin);
    $compilerOptions.val(editorState.compilerOptions);
    $commandLineArguments.val(editorState.commandLineArguments);
    statusUI?.setExecutionStatus("");
    if (editorState.languageId) {
        selectLanguageById($selectLanguage, editorState.languageId);
        applySelectedLanguage({
            sourceEditor,
            selectElement: $selectLanguage,
            editorState,
            setSourceCodeName,
            skipSetDefaultSourceCodeName: true,
        });
        setSourceCodeName(editorState.fileName, false);
    } else {
        applySelectedLanguage({
            sourceEditor,
            selectElement: $selectLanguage,
            editorState,
            setSourceCodeName,
        });
    }
    applyingState = false;
    persistence?.markClean("saved");
}

function clearEditors() {
    const previousApplyingState = applyingState;
    applyingState = true;
    sourceEditor.setValue("");
    stdinEditor.setValue("");
    $compilerOptions.val(DEFAULT_COMPILER_OPTIONS);
    $commandLineArguments.val(DEFAULT_CMD_ARGUMENTS);
    statusUI?.setExecutionStatus("");
    setSourceCodeName("Untitled", false);
    applyingState = previousApplyingState;
}

async function restoreDraftAction() {
    if (!hasDraft()) {
        errorModal.showError("Draft", "There is no saved local draft to restore.");
        return;
    }
    if (persistence?.isDirty() &&
        !window.confirm("Replace the current unsaved work with the saved draft?")) {
        return;
    }
    await applyDefaults();
}

function clearDraftAction() {
    if (!hasDraft() || !sourceEditor) return;
    if (!window.confirm("Clear the saved local draft? This cannot be undone.")) return;
    clearDraft();
    clearEditors();
    sourceEditor.setValue(DEFAULT_SOURCE);
    stdinEditor.setValue(DEFAULT_STDIN);
    persistence?.markClean("saved");
}

async function openFile(content, filename) {
    if (persistence?.isDirty() &&
        !window.confirm("Replace the current unsaved work with this file?")) {
        return;
    }
    applyingState = true;
    clearEditors();
    sourceEditor.setValue(content);
    selectLanguageForExtension($selectLanguage, getFilenameExtension(filename));
    applySelectedLanguage({
        sourceEditor,
        selectElement: $selectLanguage,
        editorState,
        setSourceCodeName,
        skipSetDefaultSourceCodeName: true,
    });
    setSourceCodeName(filename, false);
    applyingState = false;
    persistence?.markDirty();
}

function openAction() {
    document.getElementById("open-file-input").click();
}

function saveAsAction() {
    const filename = window.prompt("Save source code as:", editorState.fileName);
    if (filename === null) return;
    const trimmedFilename = normalizeFilename(filename);
    if (!trimmedFilename) {
        errorModal.showError("Error", "File name can't be empty!");
        return;
    }
    setSourceCodeName(trimmedFilename);
    persistence?.flush(true);
    downloadFile(sourceEditor.getValue(), trimmedFilename);
}

function saveAction() {
    const filename = normalizeFilename(editorState.fileName);
    if (!filename || filename === "Untitled") {
        saveAsAction();
        return;
    }
    persistence?.flush(true);
    downloadFile(sourceEditor.getValue(), filename);
}

function refreshSiteContentHeight() {
    const navigationHeight =
        document.getElementById("judge0-site-navigation").offsetHeight;
    const siteContent = document.getElementById("judge0-site-content");
    siteContent.style.height = `${window.innerHeight}px`;
    siteContent.style.paddingTop = `${navigationHeight}px`;
}

function refreshLayoutSize() {
    refreshSiteContentHeight();
    layoutManager?.updateSize();
}

function setupChat() {
    document.getElementById("judge0-chat-form").addEventListener(
        "submit",
        async function (e) {
            e.preventDefault();
            const input = document.getElementById("judge0-chat-user-input");
            const userMessage = input.value.trim();
            if (!userMessage) return;
            const model = document.getElementById("judge0-chat-model-select").value;
            const messagesContainer = document.getElementById("judge0-chat-messages");
            const userEl = document.createElement("div");
            userEl.className = "judge0-chat-message judge0-user-message";
            userEl.textContent = userMessage;
            messagesContainer.appendChild(userEl);
            input.value = "";
            input.disabled = true;
            const assistantEl = document.createElement("div");
            assistantEl.className = "judge0-chat-message judge0-chat-assistant";
            try {
                const response = await sendChatMessage([{
                    role: "user",
                    content: `Current code:\n\`\`\`\n${sourceEditor.getValue()}\n\`\`\`\n\n${userMessage}`,
                }], model);
                const content =
                    response?.choices?.[0]?.message?.content ??
                    JSON.stringify(response);
                assistantEl.innerHTML = DOMPurify.sanitize(marked.parse(content));
            } catch (err) {
                console.warn("Judge0 IDE: chat request failed.", err);
                assistantEl.textContent = "Error: no response.";
            }
            messagesContainer.appendChild(assistantEl);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            input.disabled = false;
            input.focus();
        },
    );
}

const errorModal = createErrorModal();

window.addEventListener("resize", refreshLayoutSize);

document.addEventListener("DOMContentLoaded", async function () {
    initAuth();
    requireAuthentication();
    $(".ui.selection.dropdown").dropdown();
    $("[data-content]").popup({ lastResort: "left center" });
    refreshSiteContentHeight();

    $selectLanguage = $("#select-language");
    $selectLanguage.prop("disabled", true);
    $selectLanguage.change(function (event, data) {
        applySelectedLanguage({
            sourceEditor,
            selectElement: $selectLanguage,
            editorState,
            setSourceCodeName,
            skipSetDefaultSourceCodeName:
                data && data.skipSetDefaultSourceCodeName,
        });
        markStateDirty();
    });
    try {
        await loadLanguagesIntoDropdown(
            $selectLanguage,
            getAuthHeaders(getAuthToken()),
        );
    } catch (err) {
        console.error("Failed to load languages:", err);
        errorModal.showError(
            "Error Loading Languages",
            "Failed to load available programming languages. Please check your connection and try again.",
        );
    }

    $compilerOptions = $("#compiler-options");
    $commandLineArguments = $("#command-line-arguments");
    $runBtn = $("#run-btn");
    $fileName = $("#judge0-file-name");
    statusUI = createStatusUI({
        saveStatusElement: document.getElementById("judge0-save-status"),
        executionStatusElement: document.getElementById("judge0-status-line"),
    });
    persistence = createPersistenceController({
        getSnapshot: getStateSnapshot,
        onStatusChange: statusUI.setSaveStatus,
        safetyIntervalMs: AUTOSAVE_INTERVAL_MS,
    });
    statusUI.setSaveStatus("saved");

    $runBtn.click(() => runController?.run());
    $fileName.on("input", () => setSourceCodeName($fileName.val()));
    $compilerOptions.on("change", markStateDirty);
    $commandLineArguments.on("change", markStateDirty);

    $("#open-file-input").change(function (e) {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;
        const reader = new FileReader();
        reader.onload = (event) => openFile(event.target.result, selectedFile.name);
        reader.onerror = (event) =>
            errorModal.showError("Error", "Error reading file: " + event.target.error);
        reader.readAsText(selectedFile);
    });

    const editorManager = { editors: null };
    const inlineCompletion = () => registerInlineCompletionProvider({
        getAuthToken,
        getInlineCompletion,
        isInlineSuggestionsEnabled: () =>
            document.getElementById("judge0-inline-suggestions").checked,
        isAIAssistantEnabled: () =>
            configuration.get("appOptions.showAIAssistant"),
        getSelectedChatModel: () =>
            document.getElementById("judge0-chat-model-select").value,
    });
    layoutManager = createLayoutManager({
        configuration: createLayoutConfig(configuration),
        container: $("#judge0-site-content"),
        registerComponents: (layout) => {
            editorManager.editors = registerEditorComponents(layout, {
                onRun: () => runController?.run(),
                onStateChange: markStateDirty,
                onInlineCompletion: inlineCompletion,
            });
        },
        onInitialised: async () => {
            sourceEditor = editorManager.editors.getSourceEditor();
            stdinEditor = editorManager.editors.getStdinEditor();
            stdoutEditor = editorManager.editors.getStdoutEditor();
            runController = createRunController({
                sourceEditor,
                stdinEditor,
                stdoutEditor,
                compilerOptionsElement: $compilerOptions,
                commandLineArgumentsElement: $commandLineArguments,
                runButton: $runBtn,
                layout: layoutManager.layout,
                statusUI,
                getLanguageId: () => getSelectedLanguageId($selectLanguage),
                getAuthHeaders: () => getAuthHeaders(getAuthToken()),
                showError: errorModal.showError,
            });
            await applyDefaults();
            refreshLayoutSize();
            $selectLanguage.prop("disabled", false);
            persistence.start();
            window.top.postMessage({ event: "initialised" }, "*");
        },
    });
    layoutManager.init();

    registerKeyboardShortcuts({
        run: () => runController?.run(),
        save: saveAction,
        saveAs: saveAsAction,
        open: openAction,
        increaseFontSize: () => {
            fontSize += 1;
            setFontSizeForEditors([sourceEditor, stdinEditor, stdoutEditor], fontSize);
        },
        decreaseFontSize: () => {
            fontSize -= 1;
            setFontSizeForEditors([sourceEditor, stdinEditor, stdoutEditor], fontSize);
        },
        resetFontSize: () => {
            fontSize = 13;
            setFontSizeForEditors([sourceEditor, stdinEditor, stdoutEditor], fontSize);
        },
        focusSource: () => sourceEditor?.focus(),
    });

    const superKey = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform) ? "⌘" : "Ctrl";
    $runBtn.attr("data-content", `${superKey}${$runBtn.attr("data-content")}`);
    document.querySelectorAll(".description").forEach((e) => {
        e.innerText = `${superKey}${e.innerText}`;
    });
    document.getElementById("judge0-open-file-btn").addEventListener("click", openAction);
    document.getElementById("judge0-save-btn").addEventListener("click", saveAction);
    document.getElementById("judge0-save-as-btn").addEventListener("click", saveAsAction);
    document.getElementById("judge0-restore-draft-btn").addEventListener("click", restoreDraftAction);
    document.getElementById("judge0-clear-draft-btn").addEventListener("click", clearDraftAction);
    window.addEventListener("beforeunload", () => persistence?.flush());
    setupChat();

    registerIframeMessaging({
        getSourceCode: () => sourceEditor.getValue(),
        getLanguageId: () => getSelectedLanguageId($selectLanguage),
        getStdin: () => stdinEditor.getValue(),
        getStdout: () => stdoutEditor.getValue(),
        getCompilerOptions: () => $compilerOptions.val(),
        getCommandLineArguments: () => $commandLineArguments.val(),
        setSourceCode: (value) => sourceEditor.setValue(value),
        setLanguageId: (value) => selectLanguageById($selectLanguage, value),
        setStdin: (value) => stdinEditor.setValue(value),
        setStdout: (value) => stdoutEditor.setValue(value),
        setCompilerOptions: (value) => $compilerOptions.val(value),
        setCommandLineArguments: (value) => $commandLineArguments.val(value),
        run: () => runController?.run(),
        persist: persistState,
    });
});

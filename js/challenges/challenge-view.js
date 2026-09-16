import { marked } from "marked";
import DOMPurify from "dompurify";
import { formatCall, formatValue } from "./challenge-model.js";
import { formatCaseExecution, getCaseVerdict } from "./challenge-results.js";

const DIFFICULTY_CLASSES = {
    easy: "skwtr-badge-easy",
    medium: "skwtr-badge-medium",
    hard: "skwtr-badge-hard",
};

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function renderMarkdown(text) {
    const container = el("div", "skwtr-markdown");
    container.innerHTML = DOMPurify.sanitize(marked.parse(String(text ?? "")));
    if (typeof window.renderMathInElement === "function") {
        try {
            window.renderMathInElement(container, {
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "$", right: "$", display: false },
                ],
                throwOnError: false,
            });
        } catch (err) {
            console.warn("SKWTR IDE: KaTeX rendering failed.", err);
        }
    }
    return container;
}

function formatSignature(challenge) {
    if (!challenge.function_name) return null;
    const params = (challenge.parameters || [])
        .map((param) =>
            param?.type ? `${param.name}: ${param.type}` : String(param?.name ?? ""),
        )
        .join(", ");
    const returnType = challenge.return_type ? ` -> ${challenge.return_type}` : "";
    return `${challenge.function_name}(${params})${returnType}`;
}

function formatDailyDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

export function createChallengeView({
    descriptionContainer,
    testsContainer,
    onRunAllTests,
}) {
    let functionName = "solve";
    let solvedBadge = null;
    let summaryElement = null;
    let runAllButton = null;
    let bannerElement = null;
    let caseList = null;
    const caseElements = new Map();

    function renderSolvedBadge(solved) {
        if (!solvedBadge) return;
        solvedBadge.className = solved
            ? "skwtr-badge skwtr-badge-solved"
            : "skwtr-badge skwtr-badge-outline";
        solvedBadge.innerHTML = solved
            ? '<i class="check circle icon"></i>Solved'
            : '<i class="circle outline icon"></i>Unsolved';
    }

    function renderDescription(challenge) {
        functionName = challenge.function_name || "solve";
        descriptionContainer.replaceChildren();

        const header = el("div", "skwtr-challenge-header");
        header.appendChild(el("h2", "skwtr-challenge-title", challenge.title || "Untitled challenge"));

        const badges = el("div", "skwtr-challenge-labels");
        if (challenge.difficulty) {
            const difficultyClass =
                DIFFICULTY_CLASSES[String(challenge.difficulty).toLowerCase()] || "skwtr-badge-neutral";
            badges.appendChild(el("span", `skwtr-badge ${difficultyClass}`, challenge.difficulty));
        }
        if (challenge.topic) {
            badges.appendChild(el("span", "skwtr-badge skwtr-badge-outline", challenge.topic));
        }
        solvedBadge = el("span");
        renderSolvedBadge(Boolean(challenge.solved));
        badges.appendChild(solvedBadge);
        header.appendChild(badges);

        const dailyDate = formatDailyDate(challenge.daily_date);
        if (dailyDate) {
            header.appendChild(el("div", "skwtr-challenge-meta", `Daily challenge · ${dailyDate}`));
        }
        descriptionContainer.appendChild(header);

        if (challenge.description) {
            descriptionContainer.appendChild(renderMarkdown(challenge.description));
        }
        if (challenge.instructions) {
            descriptionContainer.appendChild(el("h4", "ui header skwtr-section-header", "Instructions"));
            descriptionContainer.appendChild(renderMarkdown(challenge.instructions));
        }

        const signature = formatSignature(challenge);
        if (signature) {
            descriptionContainer.appendChild(el("h4", "ui header skwtr-section-header", "Function signature"));
            descriptionContainer.appendChild(el("pre", "skwtr-signature", signature));
            descriptionContainer.appendChild(
                el(
                    "p",
                    "skwtr-challenge-hint",
                    `Return the answer from ${functionName}. Anything you print is shown per test case but is not compared.`,
                ),
            );
        }
    }

    function renderCaseBody(testCase, result = null) {
        const body = el("div", "skwtr-test-case-body");
        const execution = result ? formatCaseExecution(result) : "";
        if (execution) body.appendChild(el("div", "skwtr-challenge-meta", execution));

        if (testCase.hidden) {
            body.appendChild(el("div", "skwtr-test-hidden", "Hidden test case — outputs and diagnostics are private."));
        } else {
            if (testCase.explanation) {
                body.appendChild(el("div", "skwtr-test-explanation", String(testCase.explanation)));
            }

            const grid = el("div", "skwtr-test-grid");
            const inputCol = el("div", "skwtr-test-col");
            inputCol.appendChild(el("div", "skwtr-test-label", "Call"));
            inputCol.appendChild(el("pre", "skwtr-test-pre", formatCall(functionName, testCase.input)));
            grid.appendChild(inputCol);

            if (testCase.hasExpected) {
                const expectedCol = el("div", "skwtr-test-col");
                expectedCol.appendChild(el("div", "skwtr-test-label", "Expected return"));
                expectedCol.appendChild(el("pre", "skwtr-test-pre", formatValue(testCase.expected)));
                grid.appendChild(expectedCol);
            }

            const outCol = el("div", "skwtr-test-col");
            outCol.appendChild(el("div", "skwtr-test-label", "Your return"));
            const outText = result ? result.error || !result.hasOut ? "—" : formatValue(result.out) : "Not run yet";
            outCol.appendChild(el("pre", "skwtr-test-pre skwtr-test-actual", outText));
            grid.appendChild(outCol);
            body.appendChild(grid);

            [
                ["Console", result?.userOut],
                ["stderr", result?.stderr],
                ["Compiler output", result?.compileOutput],
            ].forEach(([label, text]) => {
                if (!text) return;
                const details = el("details", "skwtr-test-stdout");
                details.appendChild(el("summary", null, label));
                details.appendChild(el("pre", "skwtr-test-pre", text));
                body.appendChild(details);
            });
        }

        if (result?.error) {
            body.appendChild(el("pre", "skwtr-test-pre skwtr-test-error", result.error));
        }
        return body;
    }

    function appendCase(testCase) {
        const item = el("div", "skwtr-test-case");
        item.dataset.index = String(testCase.index);
        const header = el("div", "skwtr-test-case-header");
        header.appendChild(el("span", "skwtr-test-name", testCase.name || `Case ${testCase.index + 1}`));
        const status = el("span", "skwtr-test-status skwtr-test-status-idle", "Not run");
        header.appendChild(status);
        item.appendChild(header);
        item.appendChild(renderCaseBody(testCase));
        caseList.appendChild(item);
        caseElements.set(testCase.index, { item, status, testCase });
    }

    function renderTests(testCases) {
        testsContainer.replaceChildren();
        caseElements.clear();
        caseList = null;

        const toolbar = el("div", "skwtr-tests-toolbar");
        runAllButton = el("button", "ui small primary labeled icon button");
        runAllButton.type = "button";
        runAllButton.innerHTML = '<i class="tasks icon"></i>Run Tests';
        runAllButton.disabled = testCases.length === 0;
        runAllButton.addEventListener("click", () => onRunAllTests?.());
        toolbar.appendChild(runAllButton);
        summaryElement = el("span", "skwtr-tests-summary");
        toolbar.appendChild(summaryElement);
        testsContainer.appendChild(toolbar);

        bannerElement = el("div", "skwtr-tests-banner");
        bannerElement.hidden = true;
        testsContainer.appendChild(bannerElement);

        if (!testCases.length) {
            testsContainer.appendChild(el("div", "skwtr-tests-empty", "This challenge has no test cases."));
            return;
        }

        caseList = el("div", "skwtr-tests-list");
        testCases.forEach(appendCase);
        testsContainer.appendChild(caseList);
        resetResults(testCases.length);
    }

    function setCaseState(index, state, label) {
        const refs = caseElements.get(index);
        if (!refs) return;
        refs.item.classList.remove("skwtr-test-passed", "skwtr-test-failed", "skwtr-test-running");
        refs.status.className = `skwtr-test-status skwtr-test-status-${state}`;
        refs.status.textContent =
            label ?? { idle: "Not run", running: "Running…", passed: "Passed", failed: "Failed", error: "Error", info: "Ran" }[state] ?? state;
        if (state === "passed") refs.item.classList.add("skwtr-test-passed");
        if (state === "failed" || state === "error") refs.item.classList.add("skwtr-test-failed");
        if (state === "running") refs.item.classList.add("skwtr-test-running");
    }

    function setCaseDetails(index, result = null) {
        const refs = caseElements.get(index);
        if (!refs) return;
        if (result?.hidden) {
            refs.testCase = { index, name: refs.testCase.name, hidden: true };
        }
        refs.item.querySelector(".skwtr-test-case-body").replaceWith(
            renderCaseBody({ ...refs.testCase, ...result }, result),
        );
    }

    function setBanner(response) {
        if (!bannerElement) return;
        const parts = [];
        if (response?.compileOutput) parts.push(["Compiler output (visible cases)", response.compileOutput]);
        if (response?.stderr) parts.push(["stderr (visible cases)", response.stderr]);
        if (response?.status && response.status.id > 3 && response.status.id !== 4) {
            parts.push([response.status.description || "Run failed", ""]);
        }
        bannerElement.replaceChildren();
        bannerElement.hidden = !parts.length;
        parts.forEach(([title, detail]) => {
            bannerElement.appendChild(el("div", "skwtr-tests-banner-title", title));
            if (detail) bannerElement.appendChild(el("pre", "skwtr-test-pre", detail));
        });
    }

    function updateSummary(total, passed, ran) {
        if (!summaryElement) return;
        if (!ran) {
            summaryElement.textContent = total ? `${total} test case${total === 1 ? "" : "s"}` : "";
            summaryElement.className = "skwtr-tests-summary";
            return;
        }
        summaryElement.textContent = `${passed}/${total} passed`;
        summaryElement.className =
            "skwtr-tests-summary " +
            (passed === total ? "skwtr-tests-summary-pass" : "skwtr-tests-summary-fail");
    }

    function resetResults(total = caseElements.size) {
        caseElements.forEach((_, index) => {
            setCaseState(index, "idle");
            setCaseDetails(index);
        });
        setBanner(null);
        updateSummary(total, 0, 0);
    }

    function setAllRunning() {
        resetResults();
        caseElements.forEach((_, index) => setCaseState(index, "running"));
        setBanner(null);
    }

    function renderResults(response) {
        if (!caseList && response.results.length) {
            testsContainer.querySelector(".skwtr-tests-empty")?.remove();
            caseList = el("div", "skwtr-tests-list");
            testsContainer.appendChild(caseList);
        }
        response.results.forEach((result) => {
            if (!caseElements.has(result.index)) appendCase(result);
            const { state, label } = getCaseVerdict(result);
            setCaseState(result.index, state, label);
            setCaseDetails(result.index, result);
            caseList.appendChild(caseElements.get(result.index).item);
        });
        setBanner(response);
        updateSummary(response.total, response.passedCount, response.total);
        if (response.isOverride && summaryElement) {
            summaryElement.textContent = "Custom run — not graded";
            summaryElement.className = "skwtr-tests-summary";
        }
    }

    function renderStreamResult(result, { completed, total, passed }) {
        if (!caseElements.has(result.index)) appendCase(result);
        const { state, label } = getCaseVerdict(result);
        setCaseState(result.index, state, label);
        setCaseDetails(result.index, result);
        if (summaryElement) {
            summaryElement.textContent =
                `${passed}/${total} passed · ${completed}/${total} complete`;
            summaryElement.className = "skwtr-tests-summary";
        }
    }

    function stopStreaming(completed, total) {
        caseElements.forEach((_, index) => {
            const refs = caseElements.get(index);
            if (refs?.item.classList.contains("skwtr-test-running")) {
                setCaseState(index, "idle", "Not run");
            }
        });
        if (summaryElement) {
            summaryElement.textContent = `${completed}/${total} completed · stopped`;
            summaryElement.className = "skwtr-tests-summary skwtr-tests-summary-fail";
        }
    }

    function setRunning(isRunning) {
        if (runAllButton) {
            runAllButton.disabled = isRunning || caseElements.size === 0;
            runAllButton.classList.toggle("loading", isRunning);
        }
    }

    return {
        renderDescription,
        renderTests,
        renderResults,
        renderStreamResult,
        resetResults,
        setAllRunning,
        setRunning,
        setSolved: renderSolvedBadge,
        stopStreaming,
    };
}

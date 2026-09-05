import {
    buildSubmissionPayload,
    createSubmission,
    decode,
    pollSubmission,
    Judge0Error,
} from "../api.js";

export function createRunController({
    sourceEditor,
    stdinEditor,
    stdoutEditor,
    compilerOptionsElement,
    commandLineArgumentsElement,
    runButton,
    layout,
    statusUI,
    getLanguageId,
    getAuthHeaders,
    showError,
}) {
    let timeStart;
    let isRunning = false;

    function handleRunError(error) {
        const status = error instanceof Judge0Error ? error.status : 0;
        const statusText =
            error instanceof Judge0Error
                ? error.statusText
                : String(error?.message || error);
        const body = error instanceof Judge0Error ? error.body : null;

        showError(
            `${statusText} (${status})`,
            `<pre>${DOMPurify.sanitize(JSON.stringify(body, null, 4) || "")}</pre>`,
        );
        isRunning = false;
        runButton.removeClass("loading");
        window.top.postMessage(
            { event: "runError", data: { status, statusText, body } },
            "*",
        );
    }

    function handleResult(data) {
        const tat = Math.round(performance.now() - timeStart);
        const status = data.status;
        const stdout = decode(data.stdout);
        const compileOutput = decode(data.compile_output);
        const time = data.time === null ? "-" : data.time + "s";
        const memory = data.memory === null ? "-" : data.memory + "KB";

        statusUI.setExecutionStatus(
            `${status.description}, ${time}, ${memory} (TAT: ${tat}ms)`,
        );
        const output = [compileOutput, stdout].filter((x) => x).join("\n").trimEnd();
        stdoutEditor.setValue(output);
        isRunning = false;
        runButton.removeClass("loading");
        window.top.postMessage({
            event: "postExecution",
            status: data.status,
            time: data.time,
            memory: data.memory,
            output,
        }, "*");
    }

    async function run() {
        if (isRunning) return;
        if (sourceEditor.getValue().trim() === "") {
            showError("Error", "Source code can't be empty!");
            return;
        }

        isRunning = true;
        runButton.addClass("loading");
        stdoutEditor.setValue("");
        statusUI?.setExecutionStatus("");

        const stdoutItem = layout.root.getItemsById("stdout")[0];
        stdoutItem.parent.header.parent.setActiveContentItem(stdoutItem);

        const languageId = getLanguageId();
        const sourceCode = sourceEditor.getValue();
        const stdin = stdinEditor.getValue();
        const compilerOptions = compilerOptionsElement.val();
        const commandLineArguments = commandLineArgumentsElement.val();

        window.top.postMessage({
            event: "preExecution",
            source_code: sourceCode,
            language_id: languageId,
            stdin,
            compiler_options: compilerOptions,
            command_line_arguments: commandLineArguments,
        }, "*");

        timeStart = performance.now();
        try {
            const payload = await buildSubmissionPayload({
                languageId,
                sourceCode,
                stdin,
                compilerOptions,
                commandLineArguments,
            });
            const authHeaders = getAuthHeaders();
            const { token } = await createSubmission(payload, authHeaders);
            const result = await pollSubmission(
                token,
                (description) => statusUI?.setExecutionStatus(description),
                authHeaders,
            );
            handleResult(result);
        } catch (err) {
            handleRunError(err);
        }
    }

    return { run, isRunning: () => isRunning };
}

export function registerIframeMessaging({
    getSourceCode,
    getLanguageId,
    getStdin,
    getStdout,
    getCompilerOptions,
    getCommandLineArguments,
    setSourceCode,
    setLanguageId,
    setStdin,
    setStdout,
    setCompilerOptions,
    setCommandLineArguments,
    run,
    persist,
}) {
    window.onmessage = function (e) {
        if (!e.data) {
            return;
        }

        if (e.data.action === "get") {
            window.top.postMessage({
                event: "getResponse",
                source_code: getSourceCode(),
                language_id: getLanguageId(),
                stdin: getStdin(),
                stdout: getStdout(),
                compiler_options: getCompilerOptions(),
                command_line_arguments: getCommandLineArguments(),
            }, "*");
        } else if (e.data.action === "set") {
            if (e.data.source_code) setSourceCode(e.data.source_code);
            if (e.data.language_id) setLanguageId(e.data.language_id);
            if (e.data.stdin) setStdin(e.data.stdin);
            if (e.data.stdout) setStdout(e.data.stdout);
            if (e.data.compiler_options) setCompilerOptions(e.data.compiler_options);
            if (e.data.command_line_arguments) {
                setCommandLineArguments(e.data.command_line_arguments);
            }
            if (e.data.api_key) persist();
        } else if (e.data.action === "run") {
            run();
            if (e.data.api_key) persist();
        }
    };
}

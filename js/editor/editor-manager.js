export function createEditor(container, { language, readOnly, minimap }) {
    return monaco.editor.create(container, {
        automaticLayout: true,
        scrollBeyondLastLine: !!minimap,
        readOnly: !!readOnly,
        language,
        minimap: { enabled: !!minimap },
    });
}

export function setFontSizeForEditors(editors, fontSize) {
    editors.forEach((editor) => editor?.updateOptions({ fontSize }));
}

export function registerEditorComponents(layout, {
    onRun,
    onStateChange,
    onInlineCompletion,
}) {
    let sourceEditor;
    let stdinEditor;
    let stdoutEditor;

    layout.registerComponent("source", function (container, state) {
        sourceEditor = createEditor(container.getElement()[0], {
            language: "cpp",
            readOnly: state.readOnly,
            minimap: true,
        });
        sourceEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            onRun,
        );
        sourceEditor.onDidChangeModelContent(onStateChange);
        onInlineCompletion();
    });

    layout.registerComponent("stdin", function (container, state) {
        stdinEditor = createEditor(container.getElement()[0], {
            language: "plaintext",
            readOnly: state.readOnly,
            minimap: false,
        });
        stdinEditor.onDidChangeModelContent(onStateChange);
    });

    layout.registerComponent("stdout", function (container, state) {
        stdoutEditor = createEditor(container.getElement()[0], {
            language: "plaintext",
            readOnly: state.readOnly,
            minimap: false,
        });
    });

    layout.registerComponent("ai", function (container) {
        container
            .getElement()[0]
            .appendChild(document.getElementById("judge0-chat-container"));
    });

    return {
        getSourceEditor: () => sourceEditor,
        getStdinEditor: () => stdinEditor,
        getStdoutEditor: () => stdoutEditor,
    };
}

export function registerKeyboardShortcuts({
    run,
    save,
    saveAs,
    open,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    focusSource,
}) {
    $(document).on("keydown", "body", function (e) {
        if (!(e.metaKey || e.ctrlKey)) {
            return;
        }
        switch (e.key) {
            case "Enter":
                e.preventDefault();
                run();
                break;
            case "s":
            case "S":
                e.preventDefault();
                (e.shiftKey ? saveAs : save)();
                break;
            case "o":
                e.preventDefault();
                open();
                break;
            case "+":
            case "=":
                e.preventDefault();
                increaseFontSize();
                break;
            case "-":
                e.preventDefault();
                decreaseFontSize();
                break;
            case "0":
                e.preventDefault();
                resetFontSize();
                break;
            case "`":
                e.preventDefault();
                focusSource();
                break;
        }
    });
}

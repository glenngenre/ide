const SAVE_STATUS_LABELS = {
    saved: "Saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Save failed",
};

export function createStatusUI({
    saveStatusElement,
    executionStatusElement,
}) {
    function setSaveStatus(status) {
        if (!saveStatusElement) {
            return;
        }

        saveStatusElement.textContent = SAVE_STATUS_LABELS[status] || status;
        saveStatusElement.dataset.status = status;
        saveStatusElement.classList.remove(
            "judge0-save-status-saved",
            "judge0-save-status-saving",
            "judge0-save-status-unsaved",
            "judge0-save-status-error",
        );
        saveStatusElement.classList.add(`judge0-save-status-${status}`);
        saveStatusElement.setAttribute(
            "aria-label",
            `Draft status: ${saveStatusElement.textContent}`,
        );
    }

    return {
        setSaveStatus,
        setExecutionStatus(content) {
            if (executionStatusElement) {
                executionStatusElement.innerHTML = content;
            }
        },
    };
}

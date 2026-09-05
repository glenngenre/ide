import { Judge0Error } from "../api.js";

export function createErrorModal() {
    function showError(title, content) {
        $("#judge0-site-modal #title").html(title);
        $("#judge0-site-modal .content").html(content);

        const reportTitle = encodeURIComponent(`Error on ${window.location.href}`);
        const reportBody = encodeURIComponent(
            `**Error Title**: ${title}\n` +
                `**Error Timestamp**: \`${new Date()}\`\n` +
                `**Origin**: ${window.location.href}\n` +
                `**Description**:\n${content}`,
        );

        $("#report-problem-btn").attr(
            "href",
            `https://github.com/judge0/ide/issues/new?title=${reportTitle}&body=${reportBody}`,
        );
        $("#judge0-site-modal").modal("show");
    }

    function showRunError(error) {
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

        return { status, statusText, body };
    }

    return { showError, showRunError };
}

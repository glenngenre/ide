export function downloadFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

export function getFilenameExtension(filename) {
    const parts = String(filename || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

export function normalizeFilename(filename) {
    return String(filename || "").trim();
}

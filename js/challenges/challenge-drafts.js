const STORAGE_KEY = "skwtr-challenges:drafts:v1";

function readAll() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(drafts) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
        return true;
    } catch (err) {
        console.warn("SKWTR IDE: failed to save challenge draft.", err);
        return false;
    }
}

function draftKey(challengeId, languageKey) {
    return `${challengeId}::${String(languageKey).toLowerCase()}`;
}

export function loadChallengeDraft(challengeId, languageKey) {
    const draft = readAll()[draftKey(challengeId, languageKey)];
    return typeof draft === "string" ? draft : null;
}

export function saveChallengeDraft(challengeId, languageKey, sourceCode) {
    const drafts = readAll();
    drafts[draftKey(challengeId, languageKey)] = sourceCode;
    return writeAll(drafts);
}

export function clearChallengeDraft(challengeId, languageKey) {
    const drafts = readAll();
    delete drafts[draftKey(challengeId, languageKey)];
    return writeAll(drafts);
}

const STORAGE_KEY = "judge0-ide:state:v1";

const DEFAULT_STATE = {
    sourceCode: null,
    fileName: null,
    languageId: null,
    stdin: null,
    compilerOptions: null,
    commandLineArguments: null,
};

function isStorageAvailable() {
    try {
        const testKey = "__judge0_storage_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

const STORAGE_AVAILABLE = isStorageAvailable();

export function loadState() {
    if (!STORAGE_AVAILABLE) {
        return { ...DEFAULT_STATE };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_STATE };
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object"
            ? { ...DEFAULT_STATE, ...parsed }
            : { ...DEFAULT_STATE };
    } catch (err) {
        console.warn("Judge0 IDE: failed to read saved state, ignoring.", err);
        return { ...DEFAULT_STATE };
    }
}

export function saveState(partial) {
    if (!STORAGE_AVAILABLE) {
        return false;
    }

    try {
        const current = loadState();
        const next = { ...current, ...partial };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return true;
    } catch (err) {
        console.warn("Judge0 IDE: failed to save state.", err);
        return false;
    }
}

export function clearState() {
    if (!STORAGE_AVAILABLE) {
        return false;
    }

    try {
        window.localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (err) {
        console.warn("Judge0 IDE: failed to clear saved state.", err);
        return false;
    }
}

export function hasState() {
    if (!STORAGE_AVAILABLE) {
        return false;
    }

    try {
        return window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}

export const loadDraft = loadState;
export const saveDraft = saveState;
export const clearDraft = clearState;
export const hasDraft = hasState;

export function debounce(fn, waitMs) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn(...args);
        }, waitMs);
    };
}

export function createPersistenceController({
    getSnapshot,
    onStatusChange,
    debounceMs = 700,
    safetyIntervalMs = 5000,
}) {
    let dirty = false;
    let debounceId = null;
    let safetyIntervalId = null;

    const notify = (status) => {
        if (onStatusChange) {
            onStatusChange(status);
        }
    };

    const saveNow = (force = false) => {
        if (!dirty && !force) {
            return true;
        }

        notify("saving");
        let saved = false;
        try {
            const snapshot = getSnapshot();
            saved = snapshot ? saveState(snapshot) : false;
        } catch (err) {
            console.warn("Judge0 IDE: failed to build draft state.", err);
        }
        if (saved) {
            dirty = false;
            notify("saved");
        } else {
            notify("error");
        }
        return saved;
    };

    const scheduleSave = () => {
        if (debounceId !== null) {
            clearTimeout(debounceId);
        }
        debounceId = setTimeout(() => {
            debounceId = null;
            saveNow();
        }, debounceMs);
    };

    return {
        markDirty() {
            dirty = true;
            notify("unsaved");
            scheduleSave();
        },
        markClean(status = "saved") {
            dirty = false;
            if (debounceId !== null) {
                clearTimeout(debounceId);
                debounceId = null;
            }
            notify(status);
        },
        saveNow,
        flush(force = false) {
            if (debounceId !== null) {
                clearTimeout(debounceId);
                debounceId = null;
            }
            return saveNow(force);
        },
        start() {
            if (safetyIntervalId === null) {
                safetyIntervalId = setInterval(saveNow, safetyIntervalMs);
            }
        },
        stop() {
            if (debounceId !== null) {
                clearTimeout(debounceId);
                debounceId = null;
            }
            if (safetyIntervalId !== null) {
                clearInterval(safetyIntervalId);
                safetyIntervalId = null;
            }
        },
        isDirty() {
            return dirty;
        },
    };
}

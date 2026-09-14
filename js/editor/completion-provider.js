import * as monaco from "./monaco.js";

const DEBOUNCE_MS = 400;
const CACHE_SIZE = 20;

function waitUnlessCancelled(ms, token) {
    return new Promise((resolve) => {
        if (token.isCancellationRequested) {
            resolve(false);
            return;
        }
        const timer = setTimeout(() => {
            listener.dispose();
            resolve(true);
        }, ms);
        const listener = token.onCancellationRequested(() => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

function createCompletionCache(maxSize) {
    const entries = new Map();
    return {
        get(key) {
            return entries.get(key);
        },
        set(key, value) {
            if (entries.size >= maxSize) {
                entries.delete(entries.keys().next().value);
            }
            entries.set(key, value);
        },
    };
}

function extractCompletionText(aiResponse) {
    let value = "";

    if (Array.isArray(aiResponse)) {
        value = aiResponse
            .map((v) => (typeof v === "string" ? v : v?.text || v?.content || ""))
            .join("\n")
            .trim();
    } else if (typeof aiResponse === "string") {
        value = aiResponse.trim();
    } else if (aiResponse && typeof aiResponse === "object") {
        value = (
            aiResponse.content ||
            aiResponse.text ||
            aiResponse.message?.content ||
            ""
        ).trim();
    }

    return value
        .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
        .replace(/\s*```$/, "")
        .replace(/^Completion:\s*/i, "")
        .trim();
}

export function registerInlineCompletionProvider(deps) {
    const {
        getAuthToken,
        getInlineCompletion,
        isInlineSuggestionsEnabled,
        isAIAssistantEnabled,
        getSelectedChatModel,
    } = deps;

    const cache = createCompletionCache(CACHE_SIZE);

    return monaco.languages.registerInlineCompletionsProvider("*", {
        provideInlineCompletions: async (model, position, _context, token) => {
            if (
                !getAuthToken() ||
                !isInlineSuggestionsEnabled() ||
                !isAIAssistantEnabled()
            ) {
                return;
            }

            if (!(await waitUnlessCancelled(DEBOUNCE_MS, token))) {
                return;
            }

            const textBeforeCursor = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });
            const textAfterCursor = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: model.getLineCount(),
                endColumn: model.getLineMaxColumn(model.getLineCount()),
            });

            const chatModel = getSelectedChatModel();
            const cacheKey = `${chatModel}\u0000${textBeforeCursor}\u0000${textAfterCursor}`;
            let text = cache.get(cacheKey);

            if (text === undefined) {
                const abort = new AbortController();
                const cancelListener = token.onCancellationRequested(() => abort.abort());
                let aiResponse;
                try {
                    aiResponse = await getInlineCompletion(
                        textBeforeCursor,
                        textAfterCursor,
                        chatModel,
                        abort.signal,
                    );
                } catch (err) {
                    console.warn("Judge0 IDE: inline completion request failed.", err);
                    return;
                } finally {
                    cancelListener.dispose();
                }
                if (token.isCancellationRequested) {
                    return;
                }
                text = extractCompletionText(aiResponse);
                cache.set(cacheKey, text);
            }

            if (!text) {
                return;
            }

            return {
                items: [{
                    insertText: text,
                    range: new monaco.Range(
                        position.lineNumber,
                        position.column,
                        position.lineNumber,
                        position.column,
                    ),
                }],
            };
        },
        handleItemDidShow: () => {},
        freeInlineCompletions: () => {},
    });
}

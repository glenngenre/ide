import { apiFetch, handleUnauthorized } from "../auth.js";
import { API_BASE_URL } from "../constants.js";

export async function sendChatMessage(messages, model, stream = false) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/ai/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages, model, stream }),
        });

        if (response.status === 401) {
            handleUnauthorized();
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error("Chat error:", error);
        return null;
    }
}

export async function getInlineCompletion(
    textBeforeCursor,
    textAfterCursor,
    model,
    signal,
) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/ai/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                prompt: textBeforeCursor,
                suffix: textAfterCursor,
                stream: false,
                options: { temperature: 0.1, num_predict: 64 },
            }),
            signal,
        });

        if (response.status === 401) {
            handleUnauthorized();
            return null;
        }

        if (!response.ok) return null;

        const data = await response.json();
        return data?.response || null;
    } catch (error) {
        if (error?.name === "AbortError") return null;
        console.error("Inline completion error:", error);
        return null;
    }
}

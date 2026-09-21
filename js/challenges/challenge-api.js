import { API_BASE_URL } from "../constants.js";
import { networkError, toJudge0Error } from "../api.js";
import { apiFetch, getAuthToken } from "../auth.js";

const CHALLENGES_API_BASE_URL = `${API_BASE_URL}/challenges`;

function buildSubmitBody({ language, sourceCode, testCases }) {
    const body = { language, source_code: sourceCode };
    if (Array.isArray(testCases)) {
        if (testCases.length > 10) {
            throw new Error("At most 10 custom test cases are allowed.");
        }
        body.test_cases = testCases;
    }
    return body;
}
async function request(path, { method = "GET", body } = {}) {
    let response;
    try {
        response = await apiFetch(`${CHALLENGES_API_BASE_URL}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (err) {
        throw networkError(err);
    }
    if (!response.ok) {
        throw await toJudge0Error(response);
    }
    return response;
}

export async function fetchDailyChallenges() {
    const response = await request("/daily");
    const data = await response.json();
    if (Array.isArray(data)) return data;
    return data && typeof data === "object" ? [data] : [];
}
export async function submitSolution(id, submission) {
    const body = buildSubmitBody(submission);
    const response = await request(`/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        body,
    });
    return response.json();
}

function dispatchEvent(block, handlers) {
    let event = "message";
    const data = [];
    block.split(/\r?\n/).forEach((line) => {
        if (!line || line.startsWith(":")) return;
        const separator = line.indexOf(":");
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? "" : line.slice(separator + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") event = value;
        if (field === "data") data.push(value);
    });
    if (!data.length) return false;

    let payload;
    try {
        payload = JSON.parse(data.join("\n"));
    } catch (err) {
        throw new Error(
            `Invalid ${event} event from challenge stream: ${err.message}`,
        );
    }

    if (event === "error") {
        const message =
            typeof payload === "string"
                ? payload
                : payload?.error ||
                  payload?.message ||
                  "Challenge execution failed.";
        throw new Error(message);
    }
    handlers[event]?.(payload);
    return event === "done";
}

export async function submitSolutionStream(id, submission, handlers = {}) {
    const token = getAuthToken();
    let response;
    try {
        response = await fetch(
            `${CHALLENGES_API_BASE_URL}/${encodeURIComponent(id)}/submit-stream`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(buildSubmitBody(submission)),
            },
        );
    } catch (err) {
        throw networkError(err);
    }
    if (!response.ok) {
        throw await toJudge0Error(response);
    }
    if (!response.body) {
        throw new Error("The challenge stream returned no response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    while (!completed) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        for (const block of blocks) {
            completed = dispatchEvent(block, handlers) || completed;
            if (completed) {
                await reader.cancel();
                break;
            }
        }
        if (done) break;
    }

    if (!completed && buffer.trim()) {
        completed = dispatchEvent(buffer, handlers);
    }
    if (!completed) {
        throw new Error("The challenge stream ended before the final result.");
    }
}

import { API_BASE_URL } from "../constants.js";
import { networkError, toJudge0Error } from "../api.js";

const CHALLENGES_API_BASE_URL = `${API_BASE_URL}/challenges`;

async function request(path, { method = "GET", body, authHeaders = {} } = {}) {
    let response;
    try {
        response = await fetch(`${CHALLENGES_API_BASE_URL}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...authHeaders,
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

export async function fetchDailyChallenges(authHeaders = {}) {
    const response = await request("/daily", { authHeaders });
    const data = await response.json();
    if (Array.isArray(data)) return data;
    return data && typeof data === "object" ? [data] : [];
}

export async function submitSolution(
    id,
    { language, sourceCode, testCases },
    authHeaders = {},
) {
    const body = { language, source_code: sourceCode };
    if (Array.isArray(testCases)) {
        if (testCases.length > 10) {
            throw new Error("At most 10 custom test cases are allowed.");
        }
        body.test_cases = testCases;
    }
    const response = await request(`/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        body,
        authHeaders,
    });
    return response.json();
}

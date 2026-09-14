import { normalizeLanguageKey } from "./language-labels.js";

export function getChallengeLanguages(challenge) {
    const keys = Array.isArray(challenge?.supported_languages) &&
        challenge.supported_languages.length
        ? challenge.supported_languages
        : Object.keys(challenge?.starting_code || {});
    const seen = new Set();
    return keys.filter((key) => {
        const normalized = normalizeLanguageKey(key);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}

export function getStartingCode(challenge, key) {
    const startingCode = challenge?.starting_code;
    if (!startingCode || typeof startingCode !== "object") return "";
    if (typeof startingCode[key] === "string") return startingCode[key];
    const wanted = normalizeLanguageKey(key);
    const match = Object.keys(startingCode).find(
        (candidate) => normalizeLanguageKey(candidate) === wanted,
    );
    return match ? String(startingCode[match] ?? "") : "";
}

export function normalizeTestCases(testCases) {
    if (!Array.isArray(testCases)) return [];
    return testCases.map((raw, index) => {
        const object = raw && typeof raw === "object" ? raw : {};
        const hidden = Boolean(object.hidden ?? object.is_hidden);
        const hasInput = !hidden && Array.isArray(object.input);
        return {
            index,
            name: object.name ? String(object.name) : `Case ${index + 1}`,
            hidden,
            input: hasInput ? object.input : undefined,
            hasExpected: !hidden && "output" in object,
            expected: hidden ? undefined : object.output,
            explanation: object.explanation ?? null,
        };
    });
}

export function formatValue(value) {
    if (value === undefined) return "";
    try {
        const json = JSON.stringify(value, null, 2);
        return json.length <= 60 ? JSON.stringify(value) : json;
    } catch {
        return String(value);
    }
}

export function formatCall(functionName, args) {
    const name = functionName || "solve";
    if (!Array.isArray(args)) return `${name}(…)`;
    return `${name}(${args.map((arg) => formatValue(arg)).join(", ")})`;
}

export function parseCustomArgs(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) throw new Error("Enter the arguments as a JSON array, e.g. [15]");
    let value;
    try {
        value = JSON.parse(trimmed);
    } catch (err) {
        throw new Error(`Arguments must be valid JSON: ${err.message}`);
    }
    return Array.isArray(value) ? value : [value];
}

function statusReason(status) {
    if (status && typeof status.id === "number" && status.id > 3 && status.id !== 4) {
        return status.description || `Judge0 status ${status.id}`;
    }
    return null;
}

export function normalizeSubmitResponse(raw, testCases = [], { isOverride = false } = {}) {
    const response = raw && typeof raw === "object" ? raw : {};
    const status = response.status ?? null;
    const localByIndex = new Map(testCases.map((testCase) => [testCase.index, testCase]));
    const provided = Array.isArray(response.results) ? response.results : [];
    const byIndex = new Map();
    provided.forEach((result, position) => {
        if (!result || typeof result !== "object") return;
        const index = Number.isInteger(result.index) ? result.index : position;
        byIndex.set(index, result);
    });
    const indices = [...new Set([...localByIndex.keys(), ...byIndex.keys()])].sort((a, b) => a - b);

    const results = indices.map((index) => {
        const testCase = localByIndex.get(index);
        const result = byIndex.get(index);
        const hidden = Boolean(testCase?.hidden || result?.hidden);
        const error = result
            ? result.error ? String(result.error) : statusReason(result.status)
            : statusReason(status) || "No result returned for this case";
        const normalized = {
            index,
            hidden,
            passed: error ? false : isOverride ? null :
                result.passed === true ? true : result.passed === false ? false : null,
            status: result?.status ?? null,
            time: result?.time ?? null,
            memory: result?.memory ?? null,
            error: error && hidden ? "Test case execution failed" : error,
        };
        if (hidden) return normalized;

        const hasOut = Boolean(result && ("out" in result || "actual" in result));
        const userOut = result && "user_out" in result ? result.user_out : result?.stdout;
        return {
            ...normalized,
            input: result && "input" in result ? result.input : testCase?.input,
            hasExpected: Boolean(!isOverride && !error && result && "expected" in result),
            ...(!isOverride && !error && result && "expected" in result ? { expected: result.expected } : {}),
            hasOut,
            out: error ? null : result && "out" in result ? result.out : result?.actual,
            userOut: typeof userOut === "string" ? userOut : "",
            stderr: result?.stderr || null,
            compileOutput: result?.compile_output || null,
        };
    });

    const passedCount = results.filter((result) => result.passed === true).length;
    const allOfficialPassed = !isOverride && results.length > 0 && passedCount === results.length;
    return {
        passed: allOfficialPassed && response.passed === true,
        solved: allOfficialPassed && response.solved === true,
        isOverride,
        status,
        compileOutput: response.compile_output || null,
        stderr: response.stderr || null,
        time: response.time ?? null,
        memory: response.memory ?? null,
        total: results.length,
        passedCount,
        results,
    };
}

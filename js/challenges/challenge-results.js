import { formatCall, formatValue } from "./challenge-model.js";

export function getCaseVerdict(result) {
    if (result.error) return { state: "error", label: "Execution Error" };
    if (result.passed === true) return { state: "passed", label: "Passed" };
    if (result.passed === false) return { state: "failed", label: "Wrong Answer" };
    return { state: "info", label: "Ran (not graded)" };
}

export function formatCaseExecution(result) {
    const parts = [];
    if (result.status) {
        parts.push(`Execution: ${result.status.description || "Unknown"} (${result.status.id})`);
    }
    if (result.time != null) parts.push(`${result.time}s`);
    if (result.memory != null) parts.push(`${result.memory} KB`);
    return parts.join(" · ");
}

export function formatSubmissionVerdict(response) {
    const errors = response.results.filter((result) => result.error).length;
    if (response.isOverride) {
        return errors ? "Execution Error" : "Ran (not graded)";
    }
    if (response.passed) return `All ${response.total} test cases passed 🎉`;
    const summary = `${response.passedCount}/${response.total} test cases passed`;
    return errors ? `${summary} (${errors} execution error${errors === 1 ? "" : "s"})` : summary;
}

export function formatCustomResult(response, functionName, args) {
    const result = response.results[0];
    const lines = [formatCall(functionName, args)];
    if (!result) {
        lines.push("", response.stderr || "The backend returned no result for this run.");
        return lines.join("\n");
    }

    const execution = formatCaseExecution(result);
    if (execution) lines.push(execution);
    if (!result.hidden && !result.error && result.hasOut) {
        lines.push(`→ ${formatValue(result.out)}`);
    }
    if (result.error) lines.push("", "Error:", result.error);
    if (!result.hidden) {
        const compileOutput = result.compileOutput ?? response.compileOutput;
        const stderr = result.stderr ?? response.stderr;
        if (compileOutput) lines.push("", "Compiler output:", compileOutput);
        if (stderr) lines.push("", "stderr:", stderr);
        if (result.userOut) lines.push("", "Console:", result.userOut);
    }
    return lines.join("\n");
}

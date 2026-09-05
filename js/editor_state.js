import {
    DEFAULT_CMD_ARGUMENTS,
    DEFAULT_COMPILER_OPTIONS,
    DEFAULT_SOURCE,
    DEFAULT_STDIN,
} from "./constants.js";
import { normalizeFilename } from "./file_operations.js";

export function createEditorState(saved = {}) {
    let values = {
        sourceCode: saved.sourceCode ?? DEFAULT_SOURCE,
        stdin: saved.stdin ?? DEFAULT_STDIN,
        languageId: saved.languageId ?? null,
        compilerOptions:
            saved.compilerOptions ?? DEFAULT_COMPILER_OPTIONS,
        commandLineArguments:
            saved.commandLineArguments ?? DEFAULT_CMD_ARGUMENTS,
        fileName: normalizeFilename(saved.fileName) || "Untitled",
    };

    return {
        get sourceCode() {
            return values.sourceCode;
        },
        get stdin() {
            return values.stdin;
        },
        get languageId() {
            return values.languageId;
        },
        get compilerOptions() {
            return values.compilerOptions;
        },
        get commandLineArguments() {
            return values.commandLineArguments;
        },
        get fileName() {
            return values.fileName;
        },
        update(next) {
            values = { ...values, ...next };
        },
        setFileName(name) {
            values.fileName = normalizeFilename(name) || "Untitled";
        },
        snapshot() {
            return { ...values };
        },
    };
}

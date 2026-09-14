const LANGUAGES = {
    bash: { label: "Bash", mode: "shell" },
    c: { label: "C", mode: "c" },
    cpp: { label: "C++", mode: "cpp" },
    csharp: { label: "C#", mode: "csharp" },
    go: { label: "Go", mode: "go" },
    java: { label: "Java", mode: "java" },
    javascript: { label: "JavaScript", mode: "javascript" },
    kotlin: { label: "Kotlin", mode: "kotlin" },
    lua: { label: "Lua", mode: "lua" },
    php: { label: "PHP", mode: "php" },
    python: { label: "Python", mode: "python" },
    ruby: { label: "Ruby", mode: "ruby" },
    rust: { label: "Rust", mode: "rust" },
    scala: { label: "Scala", mode: "scala" },
    swift: { label: "Swift", mode: "swift" },
    typescript: { label: "TypeScript", mode: "typescript" },
};

const ALIASES = {
    "c++": "cpp",
    "c#": "csharp",
    cs: "csharp",
    js: "javascript",
    node: "javascript",
    ts: "typescript",
    py: "python",
    python3: "python",
    golang: "go",
    rb: "ruby",
    rs: "rust",
    kt: "kotlin",
    sh: "bash",
    shell: "bash",
};

export function normalizeLanguageKey(key) {
    const normalized = String(key ?? "").trim().toLowerCase();
    return ALIASES[normalized] ?? normalized;
}

export function languageLabel(key) {
    const normalized = normalizeLanguageKey(key);
    if (LANGUAGES[normalized]) return LANGUAGES[normalized].label;
    return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : String(key);
}

export function editorModeFor(key) {
    return LANGUAGES[normalizeLanguageKey(key)]?.mode ?? "plaintext";
}

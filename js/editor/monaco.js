// Single entry point for the Monaco editor.
//
// Instead of `monaco-editor` (which pulls in every language definition plus
// the CSS/HTML/JSON/TypeScript language services and their workers), we load
// the bare editor, all editor features, and only the syntax definitions we
// map languages to in `constants.js`. The IDE does syntax highlighting only;
// execution and AI features go through the backend.
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";

import "monaco-editor/languages/definitions/clojure/register";
import "monaco-editor/languages/definitions/cpp/register"; // registers both `c` and `cpp`
import "monaco-editor/languages/definitions/csharp/register";
import "monaco-editor/languages/definitions/fsharp/register";
import "monaco-editor/languages/definitions/go/register";
import "monaco-editor/languages/definitions/java/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/kotlin/register";
import "monaco-editor/languages/definitions/lua/register";
import "monaco-editor/languages/definitions/objective-c/register";
import "monaco-editor/languages/definitions/pascal/register";
import "monaco-editor/languages/definitions/perl/register";
import "monaco-editor/languages/definitions/php/register";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/r/register";
import "monaco-editor/languages/definitions/ruby/register";
import "monaco-editor/languages/definitions/rust/register";
import "monaco-editor/languages/definitions/scala/register";
import "monaco-editor/languages/definitions/shell/register";
import "monaco-editor/languages/definitions/sql/register";
import "monaco-editor/languages/definitions/swift/register";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/vb/register";

import EditorWorker from "monaco-editor/editor/editor.worker?worker";

self.MonacoEnvironment = {
    getWorker() {
        return new EditorWorker();
    },
};

export * from "monaco-editor/editor";
export default monaco;

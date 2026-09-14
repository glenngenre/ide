# Challenge submission contract

The frontend never judges a solution itself. It sends raw source to the backend,
which wraps it in a per-language harness and runs **one fresh process per test
case** through Judge0. No global or static state is shared between cases. The
backend grades official cases, records completion only for a qualifying official
run, and returns results in input order, regardless of execution completion order.

## `POST /v1/challenges/{id}/submit`

Auth: `BearerAuth` (same as the other challenge endpoints).

### Request

```json
{
  "language": "python",
  "source_code": "def solve(n: int) -> str:\n    ...",
  "test_cases": [{ "input": [15] }]
}
```

| Field | Type | Notes |
| ----- | ---- | ----- |
| `language` | string | Required. One of the challenge's `supported_languages` keys (`java`, `python`, `javascript`, `typescript`, …). |
| `source_code` | string | Required. Raw UTF-8 source, **not base64**. |
| `test_cases` | array | Optional override, **maximum 10 cases**. When present, these replace the official challenge cases. Overrides are not graded and never mark the challenge complete, even if an override includes `output`. Used by the "Run Custom" button. |

When `test_cases` is omitted, the backend uses the official challenge cases.
Each case's `input` is an array of positional arguments.

### Response `200`

This official run has one wrong answer but no execution failures, so the
aggregate execution status is still `3 Accepted`:

```json
{
  "challenge_id": 3,
  "language": "python",
  "language_id": 71,
  "passed": false,
  "solved": false,
  "status": { "id": 3, "description": "Accepted" },
  "compile_output": null,
  "stderr": null,
  "time": "0.031",
  "memory": 9840,
  "total": 3,
  "passed_count": 2,
  "results": [
    {
      "index": 0,
      "hidden": false,
      "passed": true,
      "status": { "id": 3, "description": "Accepted" },
      "time": "0.010",
      "memory": 9800,
      "input": [1],
      "expected": "1",
      "user_out": "",
      "out": "1",
      "stdout": "",
      "actual": "1"
    },
    {
      "index": 1,
      "hidden": false,
      "passed": false,
      "status": { "id": 3, "description": "Accepted" },
      "time": "0.011",
      "memory": 9840,
      "input": [3],
      "expected": "Fizz",
      "user_out": "  debug: 3\n\n",
      "out": "3",
      "stdout": "  debug: 3\n\n",
      "actual": "3"
    },
    {
      "index": 2,
      "hidden": true,
      "passed": true,
      "status": { "id": 3, "description": "Accepted" },
      "time": "0.010",
      "memory": 9820
    }
  ]
}
```

#### Top-level fields and aggregation

| Field | Type | Notes |
| ----- | ---- | ----- |
| `challenge_id` | int | Submitted challenge id. |
| `language`, `language_id` | string, int | Challenge language key and corresponding Judge0 language id. |
| `passed`, `solved` | bool | Both are `true` iff at least one official case ran and all official cases passed. Both are `false` for overrides or an empty run. These describe this submission, not historical completion state. Overrides never trigger completion. |
| `status` | `{id, description}` | First execution failure in input order; otherwise `{ "id": 3, "description": "Accepted" }`. Wrong answers do not change this status. See the invalid-result exception below. |
| `time` | string | Sum of all case execution times, in seconds. |
| `memory` | number | Maximum case memory usage, in KB. |
| `stderr`, `compile_output` | string or null | Joined nonempty diagnostics from **visible cases only**, in input order; `null` when none. Hidden diagnostics must not leak through these aggregate fields. |
| `total` | int | Number of cases in this run. |
| `passed_count` | int | Number of passing official cases, including hidden cases. Always zero for overrides. |
| `results` | array | One entry per case, in input order. Each case has its own process and execution result; a failure in one case does not imply later cases were never reached. |

Status describes **execution, not grading**. Judge0 statuses include `3 Accepted`,
`5 Time Limit Exceeded`, `6 Compilation Error`, runtime errors `7–12`, and
`13 Internal Error`. A case may execute with status `3` and still be a wrong
answer (`passed: false`, no `error`).

A missing or invalid harness result is a failure even if Judge0 reported execution
success: the case's status may remain `3 Accepted`, but its `passed` is `false`
and its `error` is nonempty. For top-level aggregation, this failure is treated as
`13 Internal Error`. Select the first failure in input order, treating execution
failures and missing/invalid-result failures this way; otherwise return
`3 Accepted`.

#### Visible per-case fields (`hidden: false`)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `index` | int | Zero-based position in the selected input cases (official or override). |
| `hidden` | bool | `false` for a visible case. |
| `passed` | bool or null | Official cases: boolean grading result. Overrides: `null` on successful execution with a valid result, `false` on failure, regardless of any supplied `output`. |
| `status` | `{id, description}` | This case's execution status, not its grading verdict. |
| `time` | string | This case's execution time in seconds. |
| `memory` | number | This case's memory usage in KB. |
| `input` | array | Echo of the case's positional arguments. |
| `expected` | any JSON value | Present **only for visible official cases that execute successfully and produce a valid result**, including wrong answers. Omitted for overrides and failures. May itself be `null`. |
| `user_out` | string | Canonical captured user logs, preserving whitespace and newlines **exactly**, including leading/trailing spaces, blank lines, and trailing newlines. Never graded. |
| `out` | any JSON value | Canonical parsed return value: object, array, string, number, boolean, or `null`. On an execution or missing/invalid-result failure, explicitly `null`. |
| `stdout` | string | Compatibility alias of `user_out`, with identical content. Not a harness protocol or a return value. |
| `actual` | any JSON value | Compatibility alias of `out`, including explicit `null` on failure. |
| `error` | string (optional) | Present and nonempty for execution failures or missing/invalid harness results. Not set for a wrong answer or a successful result. |
| `stderr`, `compile_output` | string (optional) | Present only when nonempty. Diagnostic text is not itself a failure signal. |

A legitimate returned JSON `null` has `out: null` and `actual: null` without a
nonempty `error`. A failure also has these null values, but **must** have a
nonempty `error`. Do not infer failure from a null result. Official grading can
accept a legitimate null when the expected value is null.

#### Hidden per-case fields (`hidden: true`)

Hidden results contain **only** `index`, `hidden`, `passed`, `status`, `time`, and
`memory`, plus an optional `error` on an execution or missing/invalid-result
failure. That error must be exactly `"Test case execution failed"`; a hidden
wrong answer does not receive an execution error.

Never return `input`, `expected`, `user_out`, `out`, `stdout`, `actual`, `stderr`,
or `compile_output` for hidden cases. Omit them entirely: do not include null,
empty-string, or other placeholders, raw logs, outputs, or diagnostic details.
Hidden diagnostics are also excluded from top-level diagnostic aggregation.

### Errors

| Code | When |
| ---- | ---- |
| 400 | Malformed body, missing fields, `language` not in `supported_languages`, `test_cases` override longer than 10 or malformed, or a parameter type with no mapping for the requested language. |
| 401 | No / invalid JWT. |
| 404 | Unknown challenge id. |
| 502 | Judge0 unreachable or returned an error. |

All errors use the existing `handlers.errorResponse` shape `{ "error": "..." }`.
Per-case execution and grading failures are represented in the `200` response
above, rather than inferred from HTTP success.

## Solution contract (what the user writes)

* The solution **returns** its answer. Printed output is for debugging, captured
  per case in `user_out` (also `stdout`), and never compared against the expected
  answer.
* Python / JavaScript / TypeScript: a top-level function named by the challenge's
  `function_name`. Helper functions and imports are allowed.
* Java: the source is inserted **verbatim as the body of `public class Main`**,
  so the starting code is a bare `public String solve(int n) { … }` method.
  Extra methods/fields are fine. Top-level user `import` lines are hoisted above
  the class by the harness builder so they compile. Primitive returns are
  supported via autoboxing. Challenges must have a non-void `return_type`.
* Each case starts in a fresh process. Global/static variables and other
  in-process state cannot carry over to the next case.
* Comparison is on JSON values: numbers compared numerically (`1 == 1.0`),
  strings exactly, arrays element-wise, objects key-wise. No trimming.

### Type vocabulary (`parameters[].type` / `return_type`)

Keep the challenge schema's type names canonical and map them per language:

| Canonical | Python | JS / TS | Java literal |
| --------- | ------ | ------- | ------------ |
| `int` | int | number | `1` |
| `long` | int | number | `1L` |
| `float` | float | number | `1.5` (double) |
| `bool` | bool | boolean | `true` |
| `string` | str | string | `"…"` (escaped) |
| `char` | str | string | `'a'` |
| `int[]` | list | number[] | `new int[]{1,2}` |
| `long[]`, `float[]`, `bool[]`, `string[]` | list | T[] | `new long[]{…}`, `new double[]{…}`, `new boolean[]{…}`, `new String[]{…}` |
| `int[][]`, `string[][]` | list | T[][] | `new int[][]{{1},{2}}`, `new String[][]{…}` |

Reject a submission with `400` if a parameter type has no mapping for the
requested language rather than emitting code that won't compile.

## Frontend consumption rules

* Use canonical `user_out` for logs and `out` for the parsed return value.
  Compatibility fallback to `stdout` / `actual` is allowed only when the
  corresponding canonical field is absent. Check field presence, not truthiness
  or nullishness: JSON `null`, `false`, `0`, and `""` are valid results.
* **Never parse `stdout` or harness markers.** Harness transport and parsing are
  backend internals. Do not JSON-parse `out` again, even when it is a string.
* Render logs without trimming, splitting/rejoining, or otherwise normalizing
  whitespace or newlines.
* Use `passed` for grading and execution `status` together with a nonempty
  `error` for failures. Status `3` alone does not imply an official pass or even
  a valid harness result. Neither a null `out` nor diagnostic text proves failure.
* Display `expected` only when present. Respect hidden-case omission; never
  recover hidden data from logs, aliases, or aggregate diagnostics.
* Use top-level `passed`, `solved`, and `passed_count` as the submission verdict.
  A successful override is ungraded and never completes the challenge.

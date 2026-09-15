---
ticket: z8pmx9mv3v
stage: implement
mode: standard
status: complete
owner: developer
updated: 2026-09-15
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3v"
  github: ""
---

# Implementation — 12 · A message's AI diagnostics, behind an explicit opt-in

Branch `ticket/z8pmx9mv3v`, cut from the tip carrying every prerequisite
(`z8pmx9md71`'s permissions layer and the `z8pmx9mf1b` chats surface). The pull
request targets `main`, at the owner's instruction.

## Files changed

### New (6)

| File | What it is |
|---|---|
| `src/lib/diagnostics.ts` | Every decision this surface makes, as pure functions: `showsDiagnosticsBadge`, `diagnosticsSource`, `debugPayloadOf`, `diagnosticsText`, `diagnosticsFailure`, plus `MAX_DIAGNOSTICS_TEXT` and the `DiagnosticsOf` / `Diagnostics` / `DiagnosticsSource` types. Imports the wire type from `@/api/chat`, `hasField`/`hasDiagnostics` from `@/lib/redaction`, `displayText` from `@/lib/surfaces` and the `ApiError` **type** only — **no permission module**. |
| `src/lib/diagnostics.test.ts` | 22 tests over those decisions. |
| `src/features/chat/message-diagnostics.tsx` | `MessageDiagnostics` (badge + open state) and `DiagnosticsPanel` (the latched, permission-gated query and the rendered payload). |
| `src/features/chat/message-diagnostics.test.tsx` | 9 rendered-output tests via `react-dom/server`. |
| `src/api/chat.test.ts` | 5 tests asserting the serialised query string. |
| `src/api/message.test.ts` | 4 tests asserting the debug route. |

### Edited (5)

| File | Change |
|---|---|
| `src/api/chat.ts` | `ChatMessagesParams` gains `includeDebug?: boolean`; `getChatMessages` destructures it and translates it to `include_debug: includeDebug ? true : undefined`. The wire spelling now exists in this file and nowhere else in `src/`. |
| `src/api/message.ts` | `getMessageDebug(messageId)` — `GET /message/{id}/debug`, typed `unknown`. |
| `src/features/chat/message-view.tsx` | `mayReadDiagnostics` prop; the "Embed diagnostics" switch (rendered only with the permission, and not resetting `offset`); a 300 ms search debounce; `includeDebug` in the query key; `gcTime` on the embedded variant; `canReadDiagnostics` threaded into `MessageBubble`, which renders `<MessageDiagnostics>`. |
| `src/pages/chats.tsx` | A fourth hoisted permission boolean, `mayReadDiagnostics`, above the `if (!device)` return; header comment corrected from "three subscriptions"/"All four" to "four"/"All five". |
| `src/lib/source-policy.test.ts` | `message-diagnostics.tsx` added to `LISTS`; `MESSAGES_DEBUG_READ` added to the existing permission loop; a new describe block with 9 rules. |

**No deployment runtime file was touched.** `.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json` and
`index.html` are unmodified, and no dependency was added.

## Deviations from the approved plan

### 1 — `diagnosticsText` strips `Cf` only, not `displayText`'s `Cc`+`Cf`

**The plan was wrong and a test caught it.** The plan specified
`displayText(JSON.stringify(value, null, 2), MAX_DIAGNOSTICS_TEXT)`, reusing
`surfaces.ts` as the single owner of the control/format strip. That regex is
`[\p{Cc}\p{Cf}]`, and `Cc` **includes `U+000A`** — so the first run of the
indentation test failed with the entire payload flattened onto one line:

```
expected '{  "model": "claude",  "nested": {   …' to contain '\n  '
```

`displayText`'s class is correct for what it was written for — a one-line account
name in the header bar, where a newline is hostile. It is wrong for a
pretty-printed block, where a newline is the structure. So `diagnostics.ts`
declares `FORMAT_CHARACTERS = /\p{Cf}/gu` and caps by hand.

This is **not** the duplication `surfaces.ts`'s header warns against: it is a
different character class for a different position, and the file says so. `Cc`
needs no strip here anyway — `JSON.stringify` escapes every C0 control inside a
string value as `\uXXXX`, so the only raw ones left in its output are the ones it
inserted itself. `Cf` it passes through untouched, which was verified directly
before the strip was written and is what makes the strip necessary at all.

`diagnosticsFailure` still uses `displayText`: that one **is** a single-line
label, so the wider class is right there. Both reasons are recorded in the code.

### 2 — `format:check` is not part of the validation

The plan named `npm run format:check` alongside the `ui-source` profile. It
fails on **478 files** at baseline, including files this ticket never touches
(`wrangler.jsonc`, `tsconfig.json`, `src/stores/device.ts`), because the working
tree is CRLF under `core.autocrlf=true` while prettier defaults to `endOfLine:
lf`. That is a pre-existing, environment-level condition and outside this
ticket's scope.

What was done instead: every touched file was diffed against
`npx prettier <file>` with line endings normalised, and four genuine
line-length wrappings were applied by hand. All eleven touched files now match
prettier's output exactly. Running `prettier --write` was deliberately avoided —
it would have rewritten the line endings of five pre-existing files and turned a
small diff into a whole-file one.

### 3 — One source-policy regex relaxed for prettier's wrapping

`queryKey: ['chat-messages', chat.jid, {…}]` wraps across five lines at 100
columns, so the rule's pattern ends `\},?\s*\]` rather than `\}\]`. Noted in the
rule itself, because a rule that breaks on reformatting is a rule that gets
deleted.

## Known limits

- **The debug endpoint's response envelope is unverified against a live
  server.** §12 states it is absent from `openapi.yaml`, and no gowa backend is
  reachable from this environment, so it could not be observed. The security
  lens asked for it to be pinned by observation; that is recorded here as
  undone rather than claimed. What was done instead is to make the *unknown*
  safe: `debugPayloadOf` decides on the presence of a key, unwraps only a sole
  `metadata_debug`, keeps an object carrying sibling keys, and answers `none` —
  rendering nothing at all — for anything that is not a non-empty object. No arm
  invents an error and no arm can display a transport envelope, because
  `results()` has already unwrapped `{code, message, results}` before this
  function sees anything.
- **A permission downgrade that does not end the session** leaves an
  already-fetched payload in the cache for up to its 60 s `gcTime` while the
  surface itself disappears. The assumption is that an administrative permission
  change bumps the token epoch and forces a sign-out, which is what
  `src/lib/http.ts` already handles. Stated rather than assumed.
- `keepPreviousData` means that in the window just after the opt-in flips, the
  rows on screen belong to the previous, un-embedded page; opening a badge then
  issues one per-message fetch even though the embedding page is in flight. It
  is self-correcting, and the latch makes it strictly a one-request event.

## Validation run

Profile `ui-source`, all three checks green:

| Check | Command | Result |
|---|---|---|
| `ui-typecheck` | `npm run typecheck` | **pass** — no output, no errors. |
| `ui-lint` | `npm run lint` | **pass** — 4 warnings, all pre-existing `react(only-export-components)` in `ui/button.tsx`, `ui/badge.tsx`, `ui/tabs.tsx`, `hooks/use-device-guard.tsx`. None in a touched file. |
| `ui-test` | `npm run test` | **pass** — 38 files, **691 tests**. Baseline was 34 files / 642 tests, so 4 files and 49 tests were added and none was lost. |

### Mutation pass — 17 mutants, 17 killed

Each mutant was applied to the working tree, the suite run, and the file
restored. A mutant that survives is a rule that reads stronger than it is.

| # | Mutant | Result |
|---|---|---|
| M1 | `hasDiagnostics`: `=== true` → `!== false` | killed |
| M2 | drop `mayReadDiagnostics &&` from the request flag | killed |
| M3 | send `include_debug=false` instead of dropping the key | killed |
| M4 | drop `includeDebug` from the message cache key | killed |
| M5 | drop `canRead` from the panel query's `enabled` | killed |
| M6 | recompute `diagnosticsSource` per render instead of latching | killed |
| M7 | badge on the payload's truthiness instead of `has_debug` | killed |
| M8 | route a falsy-but-present embedded payload to a fetch | killed |
| M9 | strip `Cc` as well as `Cf`, flattening the indentation | killed |
| M10 | render an empty answer as a payload instead of `none` | killed |
| M11 | render the server's error text bare and uncapped | killed |
| E1 | evade the field rule with `!message?.has_debug` | killed |
| E2 | evade it with `message['metadata_debug']` | killed |
| E3 | evade it by destructuring `const { has_debug } = message` | killed |
| E4 | evade it with a Yoda `false === message.has_debug` | killed |
| E5 | call `getMessageDebug` from a second, ungated file | killed |
| E6 | spell `include_debug` at the call site | killed |

E6 is worth one note. Written as a **comment** it survived, because
`stripComments` removes comments before any rule matches — that is deliberate and
documented in the file ("this guards what the code *does*, and a file that
documents the rule it obeys must not fail it"), and a comment cannot send a query
parameter. Re-run as real code (`include_debug: true` added to the request
object) it was killed. The mutant, not the rule, was invalid.

The five evasion mutants are the ones the review panel asked for by name: they
are the spellings that slip past the shape-matching rule the first draft of the
plan proposed, and they are killed by the containment rule that replaced it.

## Not committed here

Per the workflow, `/implement` creates no commit. The changes sit as
uncommitted working-tree edits on `ticket/z8pmx9mv3v`; the single publishable
commit is created by `/publish-pr`.

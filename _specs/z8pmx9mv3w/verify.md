---
ticket: z8pmx9mv3w
stage: verify
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3w"
  github: ""
---

# Verification — 13 · A voice note's transcript, beneath its existing player

**Outcome: PASSED.**

## Validation profile — `ui-source`

| Check | Command | Exit | Result |
|---|---|---|---|
| `ui-typecheck` | `npm run typecheck` | 0 | Clean. |
| `ui-lint` | `npm run lint` | 0 | Four pre-existing `only-export-components` warnings, all in files this ticket does not touch (`button.tsx`, `badge.tsx`, `tabs.tsx`, `use-device-guard.tsx`). No errors. |
| `ui-test` | `npm run test` | 0 | **753 passed / 753, in 40 files.** |

Baseline before this ticket: **691 tests in 38 files**. After: **753 in 40**
(+62 tests, +2 files). 56 of the new tests are the two new files; the remainder
are the six source-policy rules. No pre-existing test changed its result.

## Runtime impact (TR-3)

**No deployment runtime file was modified.** `.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json` and
`index.html` are all untouched — confirmed by `git status --short`, which lists
exactly three modified and four added files, all under `src/` plus the ticket
workspace. No dependency was added; the bundle gains one small module and one
component with no new imports outside `@/lib`.

## Acceptance criteria

### Scope and non-regression

| AC | Result | Evidence |
|---|---|---|
| AC-1 | **PASS** | `src/features/chat/message-media.tsx` does not appear in `git status`. The audio path is byte-identical. |
| AC-2 | **PASS** | `<MessageTranscript>` renders immediately after the `{hasMedia && <MessageMedia …/>}` block in `message-view.tsx`; nothing was removed or reordered. |
| AC-3 | **PASS** | Neither `src/api/chat.ts` nor `src/api/message.ts` appears in `git status`. No new endpoint, request or parameter exists. |
| AC-4 | **PASS** | The component reads only `message`, never the media query; `message-transcript.test.tsx` renders a transcript for a message whose media was never fetched. |
| AC-5 | **PASS** | *"renders nothing for a plain text message"* and *"…for a voice note whose keys were redacted away"* both assert `markup === ''`. |

### Authorization

| AC | Result | Evidence |
|---|---|---|
| AC-6 | **PASS** | `chats.tsx` calls `useHasPermission(PERMISSIONS.MESSAGES_TRANSCRIPT_READ)`; asserted by the source-policy wiring rule. No role name appears anywhere in the path (the file-wide `role` ban already covers it). |
| AC-7 | **PASS** | *"renders nothing without the permission"* asserts `''`; *"renders nothing disabled anywhere"* asserts no `disabled`; *"leaks no part of the transcript"* asserts neither the text nor the caption is present. |
| AC-8 | **PASS** | The permission is separate from `MESSAGES_READ`, which still gates `MessageMedia` alone. Losing the transcript changes nothing else on the row. |
| AC-9 | **PASS** | `message-transcript.tsx` is in the `LISTS` array, so the two existing rules — no permission hook, no `<Can>` — now cover it. The new no-hook rule bans `use[A-Z]` outright. |

### The transcript states

| AC | Result | Evidence |
|---|---|---|
| AC-10 | **PASS** | `TRANSCRIPT_STATUSES` is the closed set; *"renders a note for pending, failed and no_speech"* iterates it. |
| AC-11 | **PASS** | *"renders the text for done"*; and the markup test asserts the text appears. |
| AC-12 | **PASS** | *"says the transcription is still running for pending, with no spinner"* — asserts the sentence and the absence of `animate-spin`. Wording checked against polling by *"does not promise that a pending transcript will arrive by itself"*. |
| AC-13 | **PASS** | *"states the failure as a fact and offers no control to retry it"* — no `<button`, no `href`, no `/retry|try again/i`. |
| AC-14 | **PASS** | *"words no_speech differently from failed"*, plus *"gives the three notes three different sentences"* (`new Set(notes).size === 3`). |
| AC-15 | **PASS** | *"answers none for a status outside the closed set"*, *"…even when the message carries usable text"*, *"…for an empty-string status"*, and the markup test *"renders nothing at all for an unrecognised status"*. |
| AC-16 | **PASS** | *"renders the note for a recognised non-done status with no text"*; markup test *"renders a status line rather than an empty block"*. |
| AC-17 | **PASS** | *"answers none for done with no transcript key"*, *"…with an empty transcript"*, *"…with a whitespace-only transcript"*. |
| AC-34 | **PASS** | *"renders the note, not the text, when a non-done status carries text"*. |

### The language label

| AC | Result | Evidence |
|---|---|---|
| AC-18 | **PASS** | Markup test asserts `Detected language: en` and the absence of `/selected|chosen|preferred/i`. |
| AC-19 | **PASS** | *"carries null when the key is absent"*, *"…for a blank or whitespace-only value"*, *"carries no language label on a note"*, and the markup test *"shows no language label beside a status line"*. |
| AC-20 | **PASS** | *"puts dir=\"auto\" on the text"*. |
| AC-21 | **PASS** | *"clamps the rendered block rather than growing the bubble"* asserts `max-h-48` and `break-words`; the bubble's `max-w-[75%]` is untouched. |
| AC-35 | **PASS** | *"carries null for prose, which is not a code"* (three values, including a path-traversal-shaped one) and *"…only long enough to be suspicious"*. |
| AC-36 | **PASS** | *"puts dir on exactly one element, and not on the wrapper"* — counts `dir="` occurrences (exactly 1) and asserts the wrapper matches `^<div class="…border-l-2…"><p`. Mutant M10 (moving `dir` to the wrapper) is killed. |
| AC-37 | **PASS** | *"turns a newline into a space, never into nothing"* and *"collapses every run of whitespace to a single space"*. |

### Redaction discipline

| AC | Result | Evidence |
|---|---|---|
| AC-22 | **PASS** | *"tests the KEY, not the value: undefined at a present key"*, *"never reports a failure for an absent key"*, plus the source rule requiring `hasField(message, '<field>')` for all three fields. |
| AC-23 | **PASS** | The containment rule, with the regex `/(?<![-/])\btranscript(_language\|_status)?\b(?!\.read)/` and a three-file allowlist. Its two exclusions are themselves asserted against the exact strings in this repository, and mutant M13 (a hand-read added to the component) is killed. |
| AC-24 | **PASS** | No arm of `transcriptView` produces an error value; the component has no error branch; no toast, banner or retry exists in either file. |
| AC-25 | **PASS** | The source rule asserts `transcript.ts` imports no permission module and that the permission arrives as `canRead: boolean`. |

### Text safety

| AC | Result | Evidence |
|---|---|---|
| AC-26 | **PASS** | *"strips a bidi override rather than rendering it"* and *"…from the language label too"*. |
| AC-27 | **PASS** | *"renders no markup from a payload that contains some"* (no `<img`, and the escaped form present) and *"offers nothing that moves the text elsewhere"* (no `href`, `download`, `<a `). |
| AC-28 | **PASS** | *"caps a long transcript and marks the cut"*, *"leaves a transcript at exactly the cap unmarked"*, *"holds both bounds to an absolute ceiling"*, *"caps a fixed enormous input to a fixed small length"*. |
| AC-38 | **PASS** | *"heads the block with an app-authored caption"*; mutant M11 (caption removed) is killed. |

### Performance

| AC | Result | Evidence |
|---|---|---|
| AC-29 | **PASS** | `MessageBubble` is still `memo(…)` (existing rule asserts it); the new prop is a bare boolean; the no-hook rule bans `use[A-Z]` in the surface. |
| AC-30 | **PASS** | The no-timer rule bans `refetchInterval`, `setInterval`, `setTimeout`; the no-hook rule bans `useQuery` transitively. `src/api/` is untouched, so the request profile is unchanged by construction. |
| AC-39 | **PASS** | *"reads no more of the raw field than the raw bound"*, rewritten after the mutation pass so it actually observes the slice; mutant M4 is killed. |

### Testing

| AC | Result | Evidence |
|---|---|---|
| AC-31 | **PASS** | 37 decision tests covering all four statuses, an unrecognised value, the absent-key case for each field, the label rules, the empty-text cases, the strip, the collapse and both bounds. |
| AC-32 | **PASS** | 20 markup tests through `react-dom/server`. |
| AC-33 | **PASS** | `ui-source` green; 753/753. |

## Test cases

| TC | Result | Evidence |
|---|---|---|
| TC-1 | **PASS** | *"a transcribed voice note reads under its player"* — text, caption, `Detected language: en`, `dir="auto"`, and `message-media.tsx` unmodified. |
| TC-2 | **PASS** | The component issues no request and reads no query; `src/api/` untouched. |
| TC-3 | **PASS** | The three note markup tests, each asserting its own sentence, plus no spinner and no retry. |
| TC-4 | **PASS** | The three no-permission markup tests: `''`, no `disabled`, no leak of text or caption. |
| TC-5 | **PASS** | The absent-key decision tests plus the containment and `hasField` source rules. |
| TC-6 | **PASS** | *"renders nothing for a plain text message"*. |
| TC-7 | **PASS** | *"answers none even when the message carries usable text"* and its markup counterpart. |
| TC-8 | **PASS** | *"renders the note for a recognised non-done status with no text"*. |
| TC-9 | **PASS** | The bidi-strip and cap tests. |
| TC-10 | **PASS** | *"turns a newline into a space, never into nothing"*. |
| TC-11 | **PASS** | *"renders the note, not the text, when a non-done status carries text"*. |
| TC-12 | **PASS** | *"carries null for prose, which is not a code"*. |
| TC-13 | **PASS** | *"puts dir on exactly one element, and not on the wrapper"*. |
| TC-14 | **PASS** | *"reads no more of the raw field than the raw bound"*. |

## Mutation pass

Each mutant was applied to the working tree alone, the suite run, and the file
restored. **15 mutants, 15 killed, 0 survivors.**

| # | Mutant | Result |
|---|---|---|
| M1 | `hasField(message, 'transcript')` → `!message.transcript` | KILLED (source rule) |
| M2 | every non-`done` status reported as `failed` | KILLED |
| M3 | an unrecognised status falls through to `done` | KILLED |
| M4 | the raw bound removed | KILLED |
| M5 | the whitespace collapse removed | KILLED |
| M6 | the language-code validation removed | KILLED |
| M7 | the display cap raised to ten million | KILLED |
| M8 | the `canRead` argument ignored | KILLED |
| M9 | the language label leaked onto a status note | KILLED |
| M10 | `dir="auto"` moved to the decorated wrapper | KILLED |
| M11 | the app-authored caption removed | KILLED |
| M12 | `canReadTranscript={mayDownloadMedia}` — the permission mis-wired | KILLED |
| M13 | a hand-read of `transcript_status` added to the component | KILLED |
| M14 | `hasField(message, 'transcript_status')` → truthiness | KILLED |
| M15 | `hasField(message, 'transcript_language')` → truthiness | KILLED |

Three of these survived the first run and are written up in
`implement.md > Deviations`. Two were tests that could never have failed (a
tautological raw-bound comparison, and cap assertions measured against the
constant they were meant to pin). The third — M1, and by extension M15 — is an
**equivalent mutant**: for a `string` field the only falsy value is `''`, which
both spellings already render as nothing, so no behavioural test can distinguish
them without inventing a requirement. It is killed by a source rule instead,
which is the honest place for a discipline whose violation is not yet observable.

## Accepted risk

**A fifth `transcript_status` value would empty the surface silently.** An
unrecognised status renders nothing (AC-15), which is the correct fail-closed
direction for a field whose future values could be `partial` or
`redacted_pending_review` — but if the backend adds one, every transcript in the
product disappears with no error, no marker and no log. That is unavoidable
rather than sloppy: it is indistinguishable by construction from the §09
absent-key case, which AC-24 forbids reporting as an error. The mitigation is
diagnosability by reading — the failure mode is named in `src/lib/transcript.ts`'s
header, with the fix (add the value to `TRANSCRIPT_STATUSES` and let the compiler
find the rest). Raised by the security lens; accepted knowingly.

**Known, pre-existing, not introduced here:** `displayText` slices on UTF-16 code
units, so a cap landing mid-surrogate can emit a lone surrogate. Shared with
`diagnostics.ts` and owned by `surfaces.ts`; fixing it here would mean a second
cap implementation, which is the divergence that module exists to prevent.

## Sign-off

All 39 acceptance criteria and all 14 test cases are mapped to an executed result
(`all-ac`, MO-6). No deployment runtime file changed. **PASSED.**

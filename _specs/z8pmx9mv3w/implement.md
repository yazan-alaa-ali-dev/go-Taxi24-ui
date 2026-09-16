---
ticket: z8pmx9mv3w
stage: implement
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3w"
  github: ""
---

# Implementation — 13 · A voice note's transcript, beneath its existing player

Applied on branch `ticket/z8pmx9mv3w`, cut from `ticket/z8pmx9mv3v` (ticket 12 is
not in `main`, and this ticket edits the same three files — so the branch is cut
from that tip rather than from `main`). The pull request targets `main`.

**No commit was created here.** Committing is the delivery boundary's job —
`/publish-pr` creates the single publishable commit (PB-8, IM-9).

## Files changed

**Added (4)**

| File | What it is |
|---|---|
| `src/lib/transcript.ts` | Every decision this feature makes: the permission conjunction, the closed status set, the key reads, the whitespace collapse, the raw bound, the cap, and the language-code validation. Pure, total, imports no permission module. |
| `src/lib/transcript.test.ts` | 37 tests over the above. |
| `src/features/chat/message-transcript.tsx` | The surface: a captioned block beneath the player. No hook, no control, no request, no timer. |
| `src/features/chat/message-transcript.test.tsx` | 20 tests rendering real markup through `react-dom/server`. |

**Edited (3)**

| File | Change |
|---|---|
| `src/features/chat/message-view.tsx` | `MessageView` takes `mayReadTranscripts`; `MessageBubble` takes `canReadTranscript`; `<MessageTranscript>` renders immediately after the media block; one import; the memo header now names three booleans and records why the view object may not become a prop. |
| `src/pages/chats.tsx` | A fifth `useHasPermission(PERMISSIONS.MESSAGES_TRANSCRIPT_READ)` above the `if (!device)` return, passed down as a boolean; header counts updated. |
| `src/lib/source-policy.test.ts` | `message-transcript.tsx` added to the existing `LISTS` array; `'MESSAGES_TRANSCRIPT_READ'` added to the existing hoisted-permission loop; one new `describe` of **six** rules. |

**Deliberately not touched**, each one an acceptance criterion: `src/api/chat.ts`
and `src/api/message.ts` (AC-3 — no new request), `src/features/chat/message-media.tsx`
(AC-1 — the audio path is untouched), `src/lib/redaction.ts`, `src/lib/permissions.ts`,
`src/lib/surfaces.ts`, and every deployment runtime file (NFR-6). `git diff --stat`
confirms it: three modified files, four added, nothing else.

## Deviations from the plan

Three, and the first two are the ones worth reading.

### 1 — The mutation pass found three survivors, and two were tests that could never have failed

The plan committed to deliberately breaking each decision and requiring the suite
to fail. Thirteen mutants, **three survived**:

- **The raw-bound test was a tautology.** It compared a 100 000-character input
  against the same input hand-truncated to `MAX_TRANSCRIPT_RAW` and asserted they
  matched — which they do *whether or not the slice exists*, because the display
  cap cuts at 1 500 characters long before the tail could matter. Rewritten to an
  input whose first `MAX_TRANSCRIPT_RAW` characters are whitespace: bounded, it
  collapses and trims to nothing; unbounded, the tail survives and renders. The
  slice is now observable, and removing it flips the result.
- **Every cap assertion measured the output against the constant**, so setting
  `MAX_TRANSCRIPT_TEXT` to ten million kept them all green — the cap could be
  deleted by being raised. Added two assertions stated in absolute numbers: the
  constant is pinned below 4 000, and a fixed 50 000-character input must produce
  at most 4 001 characters out.
- **`hasField` → truthiness survived on `transcript` and `transcript_language`.**
  This one is *not* a test gap: the fields are typed `string`, the only falsy
  string is `''`, and both spellings already render `''` as nothing — so the
  mutants are **equivalent**, and no behavioural test can distinguish them
  without inventing a requirement the spec does not have. (The distinction does
  bite on `transcript_status`, where an empty value is a present-but-unrecognised
  key; that mutant is killed by a test.) Since the discipline is real but the
  behaviour is not observable, it was made **executable on the source** instead:
  a new source-policy rule asserts all three fields are reached through
  `hasField(message, '<field>')` by name. Equivalent today is not equivalent
  tomorrow — the moment the wire type widens, truthiness starts turning an absent
  key into a value.

After the fixes, **15 mutants, 15 killed, 0 survivors.**

### 2 — One markup assertion was wrong about correct behaviour

`expect(markup).not.toContain('onerror')` failed against a render that was doing
exactly the right thing: React escaped `<img src=x onerror=alert(1)>` to
`&lt;img src=x onerror=alert(1)&gt;`, so the attribute *name* survives as inert
text and it is the `<` becoming `&lt;` that defuses it. Making that assertion
pass by changing the component would have meant weakening the render. The
assertion was corrected to require the escaped form, with a comment saying why —
so the next person does not "fix" it in the wrong direction.

### 3 — The new source-policy rule was inserted into the wrong `describe`

Both the diagnostics block and the transcript block contain an identically named
test (`RULE: the decisions module takes the permission as an argument …`), so a
first-match insertion landed the new `hasField` rule in the z8pmx9mv3v block,
where it ran against `diagnostics.ts` and failed. Moved to the last occurrence.
Caught by the suite immediately; no behaviour was involved.

The plan's rule count also moved from five to **six**, the sixth being the
`hasField` rule the mutation pass motivated (deviation 1).

## Validation run

Profile `ui-source`, from the repository root.

| Check | Command | Exit | Result |
|---|---|---|---|
| `ui-typecheck` | `npm run typecheck` | 0 | Clean. |
| `ui-lint` | `npm run lint` | 0 | Four pre-existing `only-export-components` warnings in files this ticket does not touch; no errors. |
| `ui-test` | `npm run test` | 0 | **753 passed, 40 files.** Baseline was 691 in 38 files. |

Mutation pass: 15 mutants applied one at a time to the working tree and reverted;
every one failed the suite. Recorded in full in `verify.md`.

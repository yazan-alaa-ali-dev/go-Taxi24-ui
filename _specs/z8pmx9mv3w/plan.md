---
ticket: z8pmx9mv3w
stage: plan
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3w"
  github: ""
---

# Plan — 13 · A voice note's transcript, beneath its existing player

> **Revision 2.** Revision 1 was authored for the advisory review panel
> (`senior-reviewer`, `security-reviewer`, `performance-reviewer` — the lenses
> `/review` dispatches) before any code was written. The panel returned **28
> findings** across the three lenses — **four of them major, and two of those
> raised independently by two lenses** — and every one is answered in **Panel
> response** at the end of this file. Eleven changed the design and those changes
> are folded into the sections below; six changed `spec.md` (`AC-34`…`AC-39`
> added, `AC-18`, `AC-19`, `AC-28` rewritten, `TC-10`…`TC-14` added).
>
> The findings that mattered most, all four verified against the real files
> before being accepted:
>
> - **The containment rule failed on the very commit that introduced it**
>   (senior 1 / security 1). `SOURCES` strips comments but not **import
>   specifiers or string literals**, so `/\btranscript\b/` matched
>   `from './message-transcript'`, `from '@/lib/transcript'` **and**
>   `'messages.transcript.read'` in `permissions.ts`. Revision 1's stated reason
>   for believing otherwise was simply wrong.
> - **`displayText` welds sentences together** (senior 2). Its class is
>   `[\p{Cc}\p{Cf}]` replaced with the *empty string*, and `Cc` contains
>   `U+000A` — so `"…that worked.\nCall me back."` renders as
>   `"…that worked.Call me back."`. Silent corruption of the one thing this
>   ticket exists to show. Verified in a REPL, not assumed.
> - **The cap bounded the output, not the work** (performance 1). `displayText`
>   scans and trims the **whole raw value** before slicing, so the per-row cost
>   was O(server transcript length) — unbounded — and `memo()` does not shield
>   it, because every refetch replaces all thirty message identities.
> - **Two of the seven proposed source rules were broken or vacuous**
>   (senior 3). The "no `/transcript` URL fragment" rule tripped on
>   `'@/lib/transcript'` immediately, and the `transcript_status ===` rule is
>   unreachable once containment holds.

## Approach

Every layer this ticket needs already exists and **none of them changes its
contract**:

- `src/api/chat.ts` already declares `transcript`, `transcript_language` and
  `transcript_status` as optional fields of `MessageInfo`, with a doc comment
  saying to read them with `hasField`. Nothing is added to it — and that is an
  acceptance criterion (AC-3), because a new field or parameter here would be a
  new request this ticket promised not to make.
- `src/lib/redaction.ts` already lists all three in `MASKED_FIELDS`, so
  `hasField(message, 'transcript')` type-checks today. Nothing is added.
- `src/lib/permissions.ts` already carries `MESSAGES_TRANSCRIPT_READ`
  (`messages.transcript.read`). Nothing is added.
- `src/lib/surfaces.ts` already exports `displayText`, the single owner of the
  control/format-character strip and the cap. Nothing is added.
- `src/pages/chats.tsx` already resolves four permission booleans plus
  `base_path` once, above the list. A fifth boolean joins them.

So the ticket is: **one pure decision module, one new presentational component,
two small edits, and the executable rules that keep them true.** No API change,
no request, no dependency.

**The dominant design constraint is that this repository has no component
renderer in its test environment** — no jsdom, no React Testing Library, and
adding either would add a dependency to a build that inlines everything into a
single `dist/index.html` (`src/components/shared/can.test.tsx` explains the
choice). A decision written inline in JSX is a decision no test can reach, and
this feature's decisions are precisely the §09 redaction rule the reference calls
the single largest source of silent bugs in the migration. So:

1. every decision goes into `src/lib/transcript.ts` as a pure function with a
   colocated test;
2. the component stays thin enough that `react-dom/server` can answer the
   questions that are genuinely about **output** (absent not disabled,
   `dir="auto"`, no retry control, the caption);
3. everything a renderer cannot reach is asserted **textually** in
   `src/lib/source-policy.test.ts`.

### The two authorities, kept apart

`permissions[]` answers *does this surface exist*. The presence of a key answers
*does this one message carry a transcript*. `src/lib/transcript.ts` takes
`canRead` as a **boolean argument** and imports no permission module — the same
shape `src/lib/diagnostics.ts` already has, and the same import boundary
`source-policy.test.ts` already enforces between `./redaction` and
`./permissions`.

### Every function on this path must be total

`grep -rn 'ErrorBoundary|componentDidCatch' src/` returns **nothing**, and
`MessageTranscript` is deliberately not gated on `hasMedia`, so it executes for
**every row of every conversation**. A throw in this path blanks the entire SPA,
not one bubble (security 8). `transcriptView`, `transcriptNote` and `displayText`
are total functions and every one of them stays that way — which is, separately,
the strongest argument for the `Intl.DisplayNames` exclusion in `spec.md > Out of
scope`. This constraint is written into `transcript.ts`'s header so a later
ticket does not add a throwing formatter to it.

### The four places this plan interprets rather than transcribes

The reference specifies three fields and four status values. Four combinations
it does not describe are reachable, and each is decided here rather than left to
whoever writes the JSX:

1. **`done` with no transcript text → nothing** (`spec.md` AC-17). A line saying
   "transcription complete" with nothing beneath it is the UI announcing *a field
   belongs here and it is empty*, which is exactly the distinction §09 deletes by
   removing the key.
2. **Text present with no `transcript_status` key → render the text.** The server
   made no statement about status; refusing to show a field the principal already
   holds because a sibling key is absent would be the UI inventing a rule.
3. **An unrecognised status → nothing, even when text is present** (`spec.md`
   AC-15). Here the server *did* make a statement and this UI does not understand
   it. This fails **closed**, which is right for a field whose future values could
   be `partial` or `redacted_pending_review` — and the consequence, accepted
   knowingly (security 6), is that a backend adding a fifth status makes every
   transcript in the product vanish silently. That is indistinguishable from the
   §09 absent-key case *by construction*, so it cannot be surfaced as an error
   without breaking AC-24; instead it is named as the known failure mode in
   `transcript.ts`'s header and recorded as an accepted risk in `verify.md`, so
   the next person debugging "transcripts stopped appearing" finds the answer in
   the module rather than in a diff.
4. **A recognised non-`done` status carrying text → the status line, not the
   text** (`spec.md` AC-34, senior 6). The server's statement about the recording
   outranks a partial artefact of it. Stated here and covered by a test, rather
   than falling out of the control flow unnoticed.

## Steps

### 1 — The decisions (`src/lib/transcript.ts`, new)

Pure, importing only `@/api/chat` (for the type), `@/lib/redaction` and
`@/lib/surfaces`. No React, no store, no permission module.

```ts
export type TranscriptOf = Pick<
  MessageInfo,
  'transcript' | 'transcript_language' | 'transcript_status'
>

export const TRANSCRIPT_STATUSES = ['pending', 'done', 'failed', 'no_speech'] as const
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]
/** The three that carry no text of their own. */
export type TranscriptNote = Exclude<TranscriptStatus, 'done'>

export type TranscriptView =
  | { kind: 'none' }
  | { kind: 'text'; text: string; language: string | null }
  | { kind: 'note'; status: TranscriptNote }

export const MAX_TRANSCRIPT_TEXT = 1_500
export const MAX_TRANSCRIPT_RAW = MAX_TRANSCRIPT_TEXT * 4
export const MAX_TRANSCRIPT_LANGUAGE = 24

export function transcriptView(message: TranscriptOf, canRead: boolean): TranscriptView
export function transcriptNote(status: TranscriptNote): string
```

`Pick` rather than a hand-written interface, for the reason `diagnostics.ts`
already records: an interface of only-optional properties is a **weak type**,
which TypeScript refuses an object for unless it shares a property — which is
exactly the redacted payload these functions exist to answer for, the one with
none of the three keys.

`language` is carried on the **`text` arm only** (security 10): "No speech was
detected in this recording" beside a detected-language label is a visibly
self-contradicting pair, and a contradicting pair teaches the operator to
distrust the honest line next to it. That is a narrowing of `spec.md` AC-19, not
a violation of it — the key's presence remains a necessary condition.

`transcriptView` in order:

1. `if (!canRead) return NONE` — the surface does not exist. Written here, once,
   rather than as a `&&` in JSX, so a test can reach it, and tested **first** so
   an unpermitted principal renders nothing even in the hypothetical where the
   backend ships a status without a transcript.
2. `const text = transcriptText(message)` — see below.
3. No `transcript_status` key → `text ? { kind: 'text', … } : NONE`.
4. Status not in `TRANSCRIPT_STATUSES` → `NONE` (AC-15).
5. Status `!== 'done'` → `{ kind: 'note', status }` — which narrows to
   `TranscriptNote` for free (AC-16, AC-34).
6. `done` → `text ? { kind: 'text', text, language } : NONE` (AC-11, AC-17).

**`transcriptText` bounds the work before it does any** (performance 1, AC-39):

```ts
const raw = typeof message.transcript === 'string' ? message.transcript : ''
const bounded = raw.slice(0, MAX_TRANSCRIPT_RAW).replace(/\s+/g, ' ')
return displayText(bounded, MAX_TRANSCRIPT_TEXT)
```

Three deliberate lines:

- **`.slice` first.** `displayText` replaces and `.trim()`s the *whole* raw value
  and only then slices (`src/lib/surfaces.ts:234-236`), so a 100 000-character
  transcript would cost a 100 000-character regex pass **per row, per render** —
  and `memo()` does not save it, because a refetch (post-send invalidation, every
  debounced search keystroke, the pager, every mount) replaces all thirty message
  identities at once. The raw bound is 4× the display cap: stripping only ever
  removes characters, so 6 000 raw characters cannot sanitise down to fewer than
  the 1 500 that will be shown unless three quarters of the field is control
  characters, in which case the content is already garbage.
- **`\s+ → ' '`, not a second character class.** `displayText`'s `Cc` strip
  replaces with the **empty string**, so without this `"…worked.\nCall me…"`
  renders as `"…worked.Call me…"` — silent corruption of the text this ticket
  exists to show, sitting beside real message content that *does* keep its
  newlines. A whitespace **collapse** is not a second copy of the `Cf` class, so
  `surfaces.ts`'s single-owner rule is untouched, and transcribed speech is a
  paragraph rather than a structured document, so collapsing is the right shape
  for it (senior 2, AC-37).
- **`typeof … === 'string'`** because `hasField` answers on the **key**: an
  explicitly `undefined` value at a present key is exactly the case the guard
  exists for, and it is tested.

`transcriptLanguage` is `hasField` → `displayText(…, MAX_TRANSCRIPT_LANGUAGE)` →
**shape validation** against `/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/`,
returning `null` otherwise (security 4, AC-35). `displayText` strips and caps but
says nothing about 24 characters of arbitrary prose sitting where this app's own
chrome sits — the reference specifies a *code* (§08, "DETECTED, not requested"),
and the same rule AC-15 applies to an unrecognised status applies here: the
server made a statement this UI does not understand, so it says nothing. This is
validation, not translation, so the `Intl.DisplayNames` exclusion stands.

`transcriptNote` maps the three to their sentences through a
`satisfies Record<TranscriptNote, string>` record, so adding a fifth status to the
union is a compile error rather than a silent fall-through:

- `pending` — *"Still being transcribed. The text appears here once the server
  has finished and the conversation is loaded again."* Non-alarming, and honest
  that this browser is not watching for it (AC-12, NFR-2).
- `failed` — *"The transcription did not succeed for this recording."* A fact
  about the recording, with no retry offered (AC-13).
- `no_speech` — *"No speech was detected in this recording."* Distinct from
  `failed` because the recording was processed successfully (AC-14).

### 2 — The surface (`src/features/chat/message-transcript.tsx`, new)

```tsx
export function MessageTranscript({ message, canRead }: { message: MessageInfo; canRead: boolean })
```

One call to `transcriptView`, then `none` → `return null` (nothing: no wrapper,
no border, no placeholder), `text` → the text plus its optional label, `note` →
the sentence.

**An app-authored `Transcript` caption heads the block** (security 3, AC-38).
`message-view.tsx:85` renders `message.content` only when non-empty, so a voice
note with empty `content` would otherwise produce a bubble whose *entire* visible
text is machine-transcribed caller speech, distinguishable from a real message
body only by a 2px rule — a cheap impersonation surface ("System: your session
expired, re-authenticate at …") and an operational misattribution risk. The
caption renders only when something is already being rendered, so the §09
absent-key silence (AC-17, AC-24) is untouched.

**The decoration is on the wrapper; `dir="auto"` is on the text element only**
(security 5, senior 5, AC-36). Putting both on one element lets the transcript's
first strong character resolve the block's own start edge, so an attacker-chosen
RTL opening character would flip the caption and the rule to the other side of
the bubble — weakening exactly the marker the caption was added to provide. The
wrapper carries no `dir` and inherits the application's, so the decoration is
fixed; only the text flows.

The utilities are **physical** (`border-l-2 pl-2`), not logical: there are zero
uses of `ps-*`/`border-s-*` anywhere in `src/`, the app is uniformly physical,
and — since `dir="auto"` is on the inner element only — the logical form would
resolve to exactly the same thing anyway. Revision 1's RTL rationale for them was
simply wrong (senior 5).

The text block is `max-h-48 overflow-y-auto break-words`, the clamp
`message-diagnostics.tsx:137` already uses for the same reason (performance 3):
1 500 characters × 30 bubbles is ~45 000 characters of wrapped text in one
non-virtualised `ScrollArea` whose `useLayoutEffect` scroll-to-bottom reads
`scrollHeight` synchronously on every `messages` change. The bubble's existing
`max-w-[75%]` bounds it horizontally (AC-21).

**No hook of any kind** — not `useState`, not `useMemo`, not `useQuery` (AC-29,
NFR-3). And the reason is not "there is nothing to memoise" (revision 1 said
that, and it was a weak argument): a `useMemo` here would be a **guaranteed cache
miss**, because the component's only re-render trigger is a new `message`
identity, which is also what the memo would key on (performance 4). The lever is
bounding the input, not caching it — which is why AC-39 exists.

**No control of any kind** — no `<Button>`, no `onClick`, no `href`, no
`download` (AC-13, AC-27). There is no endpoint to retry with.

The header also records (performance 7) that the `TranscriptView` object is
computed **inside** the row component and must never become a prop: it is a fresh
identity per call, and hoisting it into `MessageBubble` would break `memo()` on
all thirty rows — the exact failure NFR-4 exists to prevent.

### 3 — The row and the view (`src/features/chat/message-view.tsx`)

- `MessageBubble` takes one new prop, `canReadTranscript: boolean` — bare, for the
  reason its own header already records (AC-29, NFR-4).
- `<MessageTranscript message={message} canRead={canReadTranscript} />` renders
  **immediately after** the `{hasMedia && <MessageMedia …/>}` block and before the
  reactions line, so it sits below the player area and above nothing that was
  previously below it (AC-2).
- `MessageView` takes `mayReadTranscripts: boolean` and passes it through.

The transcript is **not** gated on `hasMedia`: it is a field of a row the
principal already holds, and gating it on a second field would invent a coupling
the payload does not have. A message with no media and no transcript key is
untouched anyway, because `transcriptView` answers `none` (AC-4, AC-5).

### 4 — The screen (`src/pages/chats.tsx`)

One hook beside the four already there, above the `if (!device)` return (it is a
hook):

```ts
const mayReadTranscripts = useHasPermission(PERMISSIONS.MESSAGES_TRANSCRIPT_READ)
```

passed as `mayReadTranscripts={mayReadTranscripts}`.

### 5 — Tests

**`src/lib/transcript.test.ts`** — the decisions, exhaustively: `canRead: false`
with a full transcript; each of the four statuses and the three notes being
pairwise distinct; an unrecognised status with and without text; a non-`done`
status with text (AC-34); `done` with an absent transcript and with `''`; text
with no status key; `undefined` at a **present** key; the language label present,
absent, blank, and malformed (AC-35); `U+202E` stripped from text and language;
an embedded newline becoming a space (AC-37); the cap and its ellipsis; and a
100 000-character input proving the raw bound is applied before the scan (AC-39).

**`src/features/chat/message-transcript.test.tsx`** — the markup, through
`renderToStaticMarkup` exactly as `message-diagnostics.test.tsx` does: no
permission → `''` and no `disabled`; `done` → the text with `dir="auto"` and the
`Transcript` caption; the three notes rendering their own sentence with no
`<button`, no `href`, no `download` and no `animate-spin`; a text message with no
transcript keys → `''`; `<img src=x>` in a transcript rendering no `<img`; and
`dir=` appearing **exactly once**, on the text element (AC-36).

Revision 1 claimed the absent `QueryClientProvider` was itself an assertion.
It is not, here: that argument works in `message-diagnostics.test.tsx` because
that file genuinely contains `useQuery`, and this one has no query at all
(senior 8). AC-30's evidence is the source-policy no-hook rule instead.

**`src/lib/source-policy.test.ts`** — deliberately **five** rules, not seven
(senior 3 deleted two as broken and vacuous), plus two one-line edits to existing
constants:

- `message-transcript.tsx` is **added to the existing `LISTS` array** in the
  `z8pmx9mf1b` block, so the two rules already written there — no permission
  hook, no `<Can>` — cover it automatically.
- `'MESSAGES_TRANSCRIPT_READ'` is **added to the existing permission loop**
  (`source-policy.test.ts:1417-1428`), the array that file already nominates as
  the place a new hoisted permission goes (senior 9).
- **Containment** (AC-23), with the regex the panel's two majors forced:

  ```js
  /(?<![-\/])\btranscript(_language|_status)?\b(?!\.read)/
  ```

  The lookbehind excludes module specifiers (`./message-transcript`,
  `@/lib/transcript`) and the negative lookahead excludes the permission id
  (`messages.transcript.read`), so `permissions.ts` passes with **no exemption**
  and `message-transcript.tsx` stays **guarded** — which matters, because it is
  the file where hand-reading a maskable field would be most tempting. It still
  catches `message.transcript`, `m?.transcript`, `['transcript_status']` and
  `const { transcript } =`. Verified against all ten shapes in a REPL before
  being written down. Allowlist: `src/api/chat.ts`, `src/lib/redaction.ts`,
  `src/lib/transcript.ts` — and *not* their tests, which `SOURCES` already
  filters out (senior 4).

  Containment rather than shape-matching, for the reason this file has recorded
  four times: a rule that matches a *shape* is evaded by the next shape. The name
  **is** the rule.
- **The permission actually reaches the row** (AC-6, AC-9) — all **three** hops,
  because TypeScript catches a missing prop but not `canRead={mayCompose}`, which
  type-checks and fails open. Revision 1 pinned two and left the middle hop
  `MessageView → MessageBubble` unasserted (security 2).
- **The row adds no request and no timer** (AC-30, NFR-2).
- **`transcript.ts` imports no permission module** (AC-25).

Deleted from revision 1: the "no `/transcript` URL fragment" rule, which tripped
on `'@/lib/transcript'` immediately and is already covered by AC-3 plus the
`git diff --stat`; and the `transcript_status ===` rule, which is unreachable
once containment holds.

## Files to change

| # | File | Change |
|---|---|---|
| 1 | `src/lib/transcript.ts` | **New.** Every decision this feature makes; pure, total; imports `@/lib/redaction` and `@/lib/surfaces` and no permission module. |
| 2 | `src/lib/transcript.test.ts` | **New.** The decision tests above. |
| 3 | `src/features/chat/message-transcript.tsx` | **New.** The presentational surface; no hook, no control, no request. |
| 4 | `src/features/chat/message-transcript.test.tsx` | **New.** `react-dom/server` markup assertions. |
| 5 | `src/features/chat/message-view.tsx` | **Edit.** One prop on `MessageView`, one on `MessageBubble`, one element after the media block, one import, header note. |
| 6 | `src/pages/chats.tsx` | **Edit.** One `useHasPermission` call, one prop passed, header note. |
| 7 | `src/lib/source-policy.test.ts` | **Edit.** `message-transcript.tsx` added to `LISTS`; `MESSAGES_TRANSCRIPT_READ` added to the permission loop; one new `describe` block of five rules. |
| 8 | `_specs/z8pmx9mv3w/*` | The ticket artifacts. |

**Not touched, and each is an acceptance criterion:** `src/api/chat.ts` and
`src/api/message.ts` (AC-3), `src/features/chat/message-media.tsx` (AC-1),
`src/lib/redaction.ts`, `src/lib/permissions.ts`, `src/lib/surfaces.ts`, and
every deployment runtime file (NFR-6).

## Validation strategy

Validation profile **`ui-source`** (`.claude/project-config.yaml >
validation_profiles`): `npm run typecheck`, `npm run lint`, `npm run test`.

Beyond the profile, `verify.md` records:

- the full suite green with the baseline count (**691 tests, 38 files**) plus the
  new ones, so a regression anywhere is visible rather than assumed;
- every AC mapped to the test or the diff that answers it (`all-ac`, MO-6);
- a **mutation pass**: each decision in `transcript.ts` is deliberately broken in
  the working tree — truthiness instead of `hasField`, a non-`done` status treated
  as failed, an unrecognised status falling through to `done`, the raw bound
  removed, the whitespace collapse removed, the language validation removed, the
  cap removed, the permission argument ignored, `dir="auto"` moved to the wrapper
  — and the run must fail each time. A test that passes against its own mutant is
  not a test;
- a `git diff --stat` confirming no untouched-file claim above was violated;
- the runtime-impact statement (TR-3): **no** deployment runtime file changed;
- the accepted risk from security 6 (a fifth backend status silently empties the
  surface).

## Rollback

Every change is additive or a two-line edit. Reverting is `git revert` of the
single publishable commit, or deleting the four new files and removing the prop
from three call sites — the audio path, the API layer and the redaction layer are
untouched, so nothing else can be left inconsistent.

## Out of scope

As `spec.md > Out of scope`. In particular: no transcription request or retry, no
polling, no diagnostics or origin surface, no media or composer change, and no
language-code-to-name translation.

## Panel response

28 findings across three lenses. **11 changed the design**, **6 changed
`spec.md`**, **8 were answered without a change** (confirmations and constraints
now written into a module header), and **3 were accepted as recorded risk or
noted without action**. None was declined as wrong.

Four findings were raised independently by two lenses — the containment regex
(senior 1 / security 1), the unrecognised-status fail-closed consequence
(senior 6 / security 6), the language label contradicting a `no_speech` line
(security 10 / senior 6's neighbourhood), and the physical-vs-logical utilities
(senior 5 / security 5). All four are fixed.

### senior-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | Containment regex fires on `permissions.ts`, on `message-view.tsx`'s import and on the new component's own import — the rule fails on the commit that introduces it. | **Accepted, design changed.** Verified all three against the real files. Adopted the lens's own regex, `/(?<![-\/])\btranscript(_language\|_status)?\b(?!\.read)/`, tested against ten shapes in a REPL before writing it down. `permissions.ts` needs **no** exemption and `message-transcript.tsx` stays guarded — which is the point, and is why this was preferred over the (also correct) strip-the-specifiers alternative security 1 proposed. Declined the "rename the module to `voice-note`" alternative: naming a module for what it is not, to satisfy a regex, is the tail wagging the dog. |
| 2 | major | `displayText` concatenates sentences across a newline — `"worked.\nCall me"` → `"worked.Call me"`. | **Accepted, design changed.** Reproduced in a REPL first. A `\s+ → ' '` collapse now runs before `displayText`, which is not a second copy of the `Cf` class, so `surfaces.ts` keeps its single-owner rule. `spec.md` AC-37 and TC-10 added. |
| 3 | major | The "no `/transcript` URL" rule trips on `'@/lib/transcript'`; the `transcript_status ===` rule is vacuous once containment holds. | **Accepted, both deleted.** Seven rules down to five. AC-3 is covered by the untouched-files claim plus `git diff --stat`. |
| 4 | minor | "and their tests" in the allowlist is dead — `SOURCES` already filters `*.test.ts`. | **Accepted.** Allowlist prose corrected to three files. |
| 5 | minor | `border-s-2 ps-2` are the only logical utilities in the codebase, and the RTL rationale for them is wrong. | **Accepted, design changed.** Grep confirms zero logical utilities in `src/`. Switched to `border-l-2 pl-2` and deleted the rationale: with `dir="auto"` on the inner element only, the logical form resolves identically anyway. |
| 6 | minor | A non-`done` status carrying text silently discards it, unstated and untested. | **Accepted, design changed.** Made explicit as `spec.md` AC-34 with TC-11, and stated in Approach §4 — the server's statement about the recording outranks a partial artefact of it. |
| 7 | minor | AC-18 is a wording criterion the plan never pins, so `/verify` has nothing to map it to. | **Accepted.** `spec.md` AC-18 now names the exact string `Detected language: <code>`. |
| 8 | nit | The "no `QueryClientProvider` is itself an assertion" claim does not carry over — this component has no query. | **Accepted.** Claim removed; AC-30's evidence is the source-policy no-hook rule. |
| 9 | nit | The permission-wiring rule duplicates the existing loop the file nominates for exactly this. | **Accepted.** `'MESSAGES_TRANSCRIPT_READ'` added to that array; only the matchers TypeScript cannot catch stay as new rules. |
| 10 | info | Integration and reversibility otherwise sound; the decision module is the established pattern, not over-engineering. | **Confirmation, no change.** Recorded. |

### security-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | Same containment failure, plus the warning that the path of least resistance is to allowlist the one file that most needs guarding. | **Accepted** — see senior 1. The lens's strip-the-specifiers fix was considered and **not** adopted, for a reason it could not see: a global `stripModulePaths` would break the existing rule at `source-policy.test.ts:1690` (`/from\s+['"][^'"]*permissions['"]/`), which asserts **on** an import specifier. The lookbehind achieves the same outcome without touching shared machinery, and keeps `message-transcript.tsx` un-allowlisted as the lens asked. |
| 2 | minor | The middle hop `MessageView → MessageBubble` is unasserted — `canReadTranscript={mayDownloadMedia}` would type-check and pass all three proposed rules. | **Accepted, design changed.** All three hops are now pinned. |
| 3 | minor | A voice note with empty `content` yields a bubble whose entire visible text is machine-transcribed attacker speech — an impersonation and misattribution surface. | **Accepted, design changed.** An app-authored `Transcript` caption heads the block (`spec.md` AC-38). It renders only when something is already rendered, so §09 silence is untouched. |
| 4 | minor | `transcript_language` is an unvalidated server string in a chrome position. | **Accepted, design changed.** Shape-validated against a BCP-47-ish code after sanitising; anything else renders no label (`spec.md` AC-35, TC-12) — the same rule AC-15 applies to the status. Validation, not translation, so the `Intl.DisplayNames` exclusion stands. |
| 5 | minor | `dir="auto"` co-located with the decoration lets an attacker-chosen RTL first character move the "quoted material" marker. | **Accepted, design changed.** Decoration on a wrapper with no `dir`; `dir="auto"` on the text element only; asserted in the markup test (`spec.md` AC-36, TC-13). |
| 6 | minor | An unrecognised status silently discards an entitled transcript; a fifth backend status would empty the product with no diagnosis. | **Accepted as recorded risk, behaviour kept.** Fail-closed is right, and the consequence cannot be surfaced as an error without breaking AC-24 — it is indistinguishable from the absent-key case by construction. Named as the known failure mode in `transcript.ts`'s header and recorded in `verify.md`, exactly as the lens asked. |
| 7 | info | Redaction ordering sound; the two authorities stay apart; `hasField` is immune to the `undefined`-at-present-key case. | **Confirmation, no change.** The `canRead`-first ordering is now explicit in Step 1. |
| 8 | info | No error boundary exists anywhere, and this component runs for every row — a throw blanks the SPA. | **Accepted as a written constraint.** Verified (`grep` returns nothing). "Every function on this path must be total" is now its own Approach section and goes into the module header. |
| 9 | info | No deployment-runtime exposure; rollback genuinely additive. | **Confirmation, no change.** |
| 10 | nit | The language label beside a `no_speech` line is a self-contradicting pair. | **Accepted, design changed.** `language` is carried on the `text` arm only (`spec.md` AC-19). |
| 11 | nit | `displayText`'s cap slices UTF-16 code units and can split a surrogate pair. | **Noted, no change.** Pre-existing, shared with `diagnostics.ts`, and owned by `surfaces.ts` — fixing it here would be a second cap implementation, which is the divergence that module exists to prevent. Recorded so it is not mistaken for a transcript-specific defect during the mutation pass. |

### performance-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | The cap bounds the output, not the work: `displayText` scans and trims the whole raw value before slicing, so per-row cost is O(server transcript length). | **Accepted, design changed.** `raw.slice(0, MAX_TRANSCRIPT_RAW)` runs before anything scans it; `spec.md` AC-39 and TC-14 added, with a 100 000-character decision test. |
| 2 | minor | "`memo()` is enough" is true for the keystroke path only — a refetch replaces all thirty message identities, so the work runs 30×. | **Accepted.** The rationale in Step 2 now says exactly that, which is also why finding 1 matters. No structural change: the bare-boolean prop was already right. |
| 3 | minor | 4 000 chars × 30 bubbles in a non-virtualised `ScrollArea` whose `useLayoutEffect` reads `scrollHeight` on every `messages` change. | **Accepted, design changed.** Cap lowered 4 000 → **1 500**, and the block clamped with `max-h-48 overflow-y-auto`, the precedent `message-diagnostics.tsx:137` already sets. Also serves the ticket's own "skim" goal. |
| 4 | info | "No memoisation" is the right call but for the wrong reason — a `useMemo` here would be a guaranteed cache miss. | **Accepted.** Rationale replaced with the lens's argument; the no-hook rule is kept as a deliberate statement rather than a side effect. |
| 5 | info | No request, observer, subscription or timer is added; `useHasPermission` returns a primitive, so it is one page-lifetime subscription. | **Confirmation, no change.** Will be recorded as verified at `/verify` rather than assumed. |
| 6 | info | No dependency implied; zero marginal bundle bytes. | **Confirmation, no change.** The suggested "no import outside `react`/`@/lib`" rule was **not** added — senior 3 cut the rule count for good reason, and a sixth rule guarding a hypothetical is the over-engineering that lens flagged. |
| 7 | nit | `transcriptView` returns a fresh object; a later ticket hoisting it into `MessageBubble` would break `memo()` on all thirty rows. | **Accepted.** One line in the component header says the view is computed inside the row and must never become a prop. |

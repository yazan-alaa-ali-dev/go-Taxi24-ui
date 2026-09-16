---
ticket: z8pmx9mv3w
stage: spec
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3w"
  github: ""
---

# Specification — 13 · A voice note's transcript, beneath its existing player

## Business goal

An operator reading a conversation today has no way to know what is *in* a voice
note without playing it. The backend already transcribes them and already ships
the result on the message row — `transcript`, `transcript_language` and
`transcript_status` (reference §08) — so the text is arriving and being thrown
away by the UI on every conversation load.

The goal is to make that text readable **where the operator already is**, at no
network cost, without touching a single thing about how the audio plays or
downloads, and without ever building a UI state out of a field's absence: all
three fields are **deleted from the JSON** for a principal without
`messages.transcript.read` (reference §09), with no 403 and no marker.

## User story

> **As** an Account Administrator,
> **I want** to read the text of a voice note beneath its player, with the audio
> still playing exactly as it does today,
> **so that** I can skim what a customer said without listening to every
> recording, and still listen when the wording matters.

## Functional requirements

| # | Requirement |
|---|---|
| REQ-1 | The transcript surface exists only for a principal whose `permissions[]` from `GET /auth/me` contains `messages.transcript.read`. Nothing is decided from a role name. |
| REQ-2 | The permission is resolved once, at the height of the chats screen, and travels into the message view and the message row as a bare boolean prop. |
| REQ-3 | The transcript is rendered **below** the message's player area, inside the existing bubble, and replaces or hides nothing that is on the row today. |
| REQ-4 | The transcript is read from the message payload the conversation page already returned. This ticket introduces no endpoint, no request and no query parameter. |
| REQ-5 | The transcript is readable without the media having been downloaded, and without `messages.read` (which grants the media download and nothing else). |
| REQ-6 | `transcript_status` is interpreted as a closed set of four values — `pending`, `done`, `failed`, `no_speech` — each with its own rendering, and any other value is not interpreted at all. |
| REQ-7 | `transcript_language` is presented as the **detected** language of the recording, never as a setting the operator chose, and only when its key is present. |
| REQ-8 | The transcript text carries a per-element automatic direction, so an Arabic transcript reads right-to-left inside an otherwise left-to-right row without the surrounding interface changing. |
| REQ-9 | Every read of the three maskable fields tests for the **key**, through `hasField` from `src/lib/redaction.ts`. A value-truthiness fallback and a non-`done`-means-failed inference are both defects, not style. |
| REQ-10 | An absent key produces nothing at all — no error, no toast, no banner, no placeholder, no retry. The backend does not distinguish "no transcript stored" from "not yours to see" and the UI must not invent the distinction. |
| REQ-11 | Key presence never gates an action. Whether the surface exists is answered by `permissions[]`; whether one message carries a transcript is answered by the key; the two authorities stay separate modules. |
| REQ-12 | Server-authored transcript text reaches a rendered node only after the house strip-and-cap treatment, as every other operator- or server-controlled string in this app does. |
| REQ-13 | The message row stays memoised and gains no hook, no query and no observer. |
| REQ-14 | The decisions this feature makes are expressed as pure functions with colocated tests, because this repository has no component renderer able to reach a decision written inline in JSX. |

## Non-functional requirements and constraints

| # | Requirement |
|---|---|
| NFR-1 | **No new network traffic.** The conversation page's request profile after this ticket is identical to before it: same URL, same parameters, same count. |
| NFR-2 | **No polling and no timer.** A `pending` transcript is a fact about the server, not work happening in this browser. |
| NFR-3 | **No permission subscription inside the message list.** `MessageView` holds the composer's `draft` in the same component that renders the rows, so a hook there re-runs on every keystroke and a hook in a row is one subscription per message. |
| NFR-4 | **Props into the memoised row stay bare booleans and strings.** An object or a callback prop is a fresh identity per render and would break `memo()` on all thirty rows at once. |
| NFR-5 | **The redaction module imports no permission module and vice versa**, and `src/lib/source-policy.test.ts` continues to fail the build if either ever does. |
| NFR-6 | **No new runtime dependency** and no change to any deployment runtime file (`vite.config.ts`, `package.json`, `index.html`, the two workflow files). |
| NFR-7 | Validation profile `ui-source`: `npm run typecheck`, `npm run lint`, `npm run test`. |

## Acceptance criteria

### Scope and non-regression

| ID | Criterion |
|---|---|
| AC-1 | The audio path is unchanged: the same download control, the same per-message download request, the same `<audio>` element and the same file link. `src/features/chat/message-media.tsx` is not edited by this ticket. |
| AC-2 | The transcript renders **below** the message's player area and never in place of it; no existing control on the row is replaced, hidden or moved. |
| AC-3 | The transcript is read from the already-returned message payload. No endpoint, request or query parameter is added: `src/api/chat.ts` and `src/api/message.ts` are not edited by this ticket. |
| AC-4 | The transcript renders whether or not the media has been downloaded in this session, and whether or not the principal holds `messages.read`. |
| AC-5 | A message carrying none of the three transcript keys renders exactly as it does today — no extra node, no wrapper, no spacing change. |

### Authorization

| ID | Criterion |
|---|---|
| AC-6 | The surface is rendered only when `permissions[]` contains `messages.transcript.read`, resolved through `useHasPermission(PERMISSIONS.MESSAGES_TRANSCRIPT_READ)`. No role name is read anywhere in the path. |
| AC-7 | Without that permission the transcript area is **absent** from the rendered output — not empty, not disabled, and with no placeholder hinting a transcript exists. |
| AC-8 | Without that permission the voice note still plays and still downloads for a principal holding `messages.read`; nothing else on the row changes. |
| AC-9 | The permission is read once in `src/pages/chats.tsx` and passed down as a boolean prop. Neither the message view nor any per-row component calls a permission hook or mounts `<Can>`, and `src/lib/source-policy.test.ts` asserts it. |

### The transcript states

| ID | Criterion |
|---|---|
| AC-10 | `transcript_status` is matched against the closed set `pending` · `done` · `failed` · `no_speech`. Each produces its own rendering and no two share one. |
| AC-11 | `done` with usable transcript text renders that text. |
| AC-12 | `pending` renders a short, non-alarming line stating the transcription is still running. There is no spinner, no timer and no refetch. |
| AC-13 | `failed` renders a short line stating the transcription did not succeed, with **no retry control** — the UI has no endpoint to retry with. |
| AC-14 | `no_speech` renders a short line stating no speech was detected, worded distinctly from the `failed` line because the recording was processed successfully. |
| AC-15 | An unrecognised `transcript_status` value renders as the neutral "nothing to show" case: nothing at all. It is never treated as `done` and never crashes. |
| AC-16 | A recognised non-`done` status renders its status line even when `transcript` is absent or empty — never an empty block. |
| AC-17 | `done` (or an absent status) with an absent or empty transcript renders **nothing at all** — not an empty block, not a dash, not a "transcription complete" line. Announcing an empty field is exactly the distinction §09 deletes, and this app must not restore it. |
| AC-34 | A recognised non-`done` status that *does* carry transcript text renders its status line and **not** the text. The server's statement about the recording outranks a partial artefact of it, and the choice is stated in the module header and covered by a test rather than left implicit. |

### The language label

| ID | Criterion |
|---|---|
| AC-18 | `transcript_language` is labelled as the **detected** language, in the exact string `Detected language: <code>`, which cannot be read as a setting the operator chose. |
| AC-19 | The label renders only in the `done`/text case, only when the `transcript_language` key is present, and only when its sanitised value is a well-formed language code. Its absence produces no label and no default, and it never accompanies a `pending`, `failed` or `no_speech` line — "no speech was detected" beside a detected language is a self-contradicting pair that teaches the operator to distrust the honest line next to it. |
| AC-35 | A `transcript_language` value that is not a well-formed code (`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$`) renders **no label** — the same "the server made a statement this UI does not understand, so say nothing" rule AC-15 applies to the status. It is validation, not translation. |
| AC-20 | The transcript text carries `dir="auto"`, so an Arabic transcript reads right-to-left inside an otherwise left-to-right row and a latin transcript is unaffected. The direction is never inferred from the interface locale and no `dir` is set on any ancestor. |
| AC-21 | Long transcripts wrap and never overflow the bubble horizontally; the bubble's existing `max-w-[75%]` is respected and no horizontal scroll is introduced. |
| AC-36 | The transcript block's decoration — its caption and its start-edge rule — sits on a **wrapper that inherits the application's direction**, and `dir="auto"` sits on the text element only. An attacker-chosen right-to-left opening character may reorder the transcript's own text; it may not move the marker that identifies the text as a transcript. |
| AC-37 | The transcript renders as a single flowed paragraph with internal whitespace **collapsed**, never concatenated: a transcript containing a newline renders `…worked. Call me…`, never `…worked.Call me…`. |

### Redaction discipline

| ID | Criterion |
|---|---|
| AC-22 | Every read of `transcript`, `transcript_language` and `transcript_status` goes through `hasField` from `src/lib/redaction.ts`. A truthiness fallback on the text, and a "non-`done` means failed" inference, are both rejected. |
| AC-23 | The three field names are **named** in `src/api/chat.ts`, `src/lib/redaction.ts` and the new decision module only; every other file reads them through that module, and `src/lib/source-policy.test.ts` fails the build on a fourth namer. |
| AC-24 | An absent key produces no error, no toast, no banner and no retry — it renders as nothing at all. |
| AC-25 | Key presence gates no action. The decision module imports no permission module, takes the permission as a boolean argument, and the existing import-boundary rule still passes. |

### Text safety

| ID | Criterion |
|---|---|
| AC-26 | The transcript text and the language label pass through `displayText` from `src/lib/surfaces.ts` before rendering — the single owner of the control/format-character strip — so a `U+202E` stored in a transcript cannot reorder what is printed around it. React escapes HTML; it does not neutralise bidi. |
| AC-27 | The rendered transcript is a text child and nothing else: no `href`, no `download`, no clipboard affordance, and no `dangerouslySetInnerHTML` anywhere in the path. |
| AC-28 | The transcript text is capped at a declared maximum with a visible ellipsis, and the rendered block is height-clamped, so a transcript of unbounded length cannot produce a bubble the operator cannot scroll past. |
| AC-38 | The transcript text is rendered inside an app-authored **`Transcript` caption**, so a machine transcription of a caller's speech can never be the entire visible text of a bubble and be mistaken for a message body or for this application's own chrome. The caption renders only when something is already being rendered, so it discloses nothing an absent key would have hidden. |

### Performance

| ID | Criterion |
|---|---|
| AC-29 | The message row stays wrapped in `memo()`, the new component calls no hook at all, and the props added to the row are bare booleans. |
| AC-30 | The conversation page issues the same requests, with the same parameters, in the same number as before this ticket. No `setInterval`, `setTimeout`, `refetchInterval` or `useQuery` is introduced in the transcript path. |
| AC-39 | **The per-row cost is bounded by a constant, not by the server.** The raw field is truncated to a declared raw bound *before* any scan of it, so a 100 000-character transcript costs the same as a 1 000-character one. `memo()` shields the composer-keystroke path but not a refetch — every refetch replaces all thirty message identities — so the sanitising work must be bounded at the source rather than cached. |

### Testing

| ID | Criterion |
|---|---|
| AC-31 | Unit tests cover the four statuses, an unrecognised value, the absent-key case for each of the three fields, the language label appearing only with its key, the empty-text cases, the sanitising strip and the cap, and that nothing renders without the permission. |
| AC-32 | Rendering claims — "absent, not disabled", `dir="auto"`, "no retry control", "a text message is untouched" — are asserted on real markup through `react-dom/server`, as `message-diagnostics.test.tsx` does. |
| AC-33 | Validation profile `ui-source` (`npm run typecheck`, `npm run lint`, `npm run test`) passes, and the pre-existing suite still passes in full. |

## Test cases

| ID | Case | Given | When | Then |
|---|---|---|---|---|
| TC-1 | A transcribed voice note reads under its player | An administrator, and a voice note with `transcript_status: done`, a transcript and `transcript_language: ar` | The conversation is opened | The text appears below the message's player area; the language is labelled as detected; the text carries `dir="auto"`; the download and playback controls are exactly as before. |
| TC-2 | The transcript needs no download | A voice note whose media has not been downloaded in this session | The conversation is read | The transcript is visible and no media download request was issued. |
| TC-3 | Each status says its own thing | Three voice notes with `pending`, `failed` and `no_speech` | The conversation is read | The `pending` one says the transcription is still running, with no spinner and no polling; the `failed` one says it did not succeed and offers no retry; the `no_speech` one says no speech was detected, worded differently from `failed`. |
| TC-4 | A user-role principal sees no transcript surface | A principal whose `permissions[]` lacks `messages.transcript.read`, and a voice note that carries a transcript for other principals | The conversation is read | No transcript, status line or language label is in the markup; no error, banner or toast; the voice note still plays and still downloads. |
| TC-5 | An absent key is not an empty transcript and not a failure | An administrator and a voice note whose `transcript` key is absent | The row renders | Nothing is shown in the transcript area — no empty block, no "failed", no dash — and no code path used a truthiness fallback or treated a non-`done` status as failed. |
| TC-6 | A regular text message is untouched | A text message with no media and no transcript key | The conversation is read | The row is structurally identical to its pre-ticket rendering and no transcript area is created. |
| TC-7 | An unrecognised status is neutral, not a failure | A voice note with `transcript_status: "queued"` and a transcript | The row renders | Nothing is rendered — the value is not interpreted as `done` and not reported as an error. |
| TC-8 | A status with no text still says something | A voice note with `transcript_status: failed` and no `transcript` key | The row renders | The failed line renders; no empty block and no dash. |
| TC-9 | A hostile transcript cannot reorder the bubble | A transcript containing `U+202E` and a 20 000-character transcript | The row renders | The format character is absent from the markup and the text is cut at the declared cap with a visible ellipsis. |
| TC-10 | Sentences are not welded together | A transcript containing `Yes, that worked.\nCall me back.` | The row renders | The rendered text reads `Yes, that worked. Call me back.` — the newline becomes a space, never nothing. |
| TC-11 | A status outranks a partial artefact | A voice note with `transcript_status: failed` **and** transcript text | The row renders | The failed line renders and the partial text does not. |
| TC-12 | A malformed language is not a label | A voice note with `transcript_status: done`, text, and `transcript_language: "Arabic (detected by our AI partner)"` | The row renders | The text renders and no language label does. |
| TC-13 | A hostile transcript cannot move its own caption | A `done` transcript whose first strong character is right-to-left | The row renders | `dir="auto"` is on the text element only; the caption and the start-edge rule are on a wrapper carrying no `dir`. |
| TC-14 | An enormous transcript costs a constant | A 100 000-character transcript | `transcriptView` runs | The raw value is truncated to the declared raw bound before it is scanned, and the result is identical to the same transcript truncated by hand. |

## Out of scope

- Any transcription request, retry or provider configuration from the UI — there
  is no endpoint for one.
- Polling or refetching a `pending` transcript.
- The AI-diagnostics surface, which is ticket `z8pmx9mv3v` (12) and already
  delivered.
- The origin badge from `sent_via` / `sent_by_name`, which is its own ticket.
- Any change to media download, the composer, the chat list or the pager.
- Translating a detected language code into a language name: the reference
  specifies a code and nothing else, and `Intl.DisplayNames` on a server-authored
  string is a throw this ticket does not need to own.

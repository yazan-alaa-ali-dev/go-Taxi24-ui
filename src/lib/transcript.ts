import type { MessageInfo } from '@/api/chat'
import { hasField } from '@/lib/redaction'
import { displayText } from '@/lib/surfaces'

/**
 * Every decision the voice-note transcript surface makes, lifted out of the
 * component that renders it (ticket z8pmx9mv3w).
 *
 * **Why a module rather than a few inline ternaries.** This repository has no
 * component renderer in its test environment — no jsdom, no React Testing
 * Library, and adding one would add a dependency to a build that inlines
 * everything into a single file. A decision written inside JSX is therefore a
 * decision no test can reach, and this feature's decisions are exactly the kind
 * that must be reachable: they are the §09 redaction rule, which the reference
 * calls the single largest source of silent bugs in this migration.
 * `./diagnostics` is written the same way for the same reason.
 *
 * **Two authorities, kept apart.** Whether this surface exists at all is
 * answered by `permissions[]` — `messages.transcript.read`, read once at the
 * height of the chats screen. Whether one particular message happens to carry a
 * transcript is answered by the presence of a key. They are not the same
 * question and must not be allowed to become one, so the permission arrives here
 * as a **boolean argument** and this module imports no permission module.
 * `./redaction`'s header makes the same point about `hasField`, and
 * `./source-policy.test.ts` enforces the import boundary.
 *
 * **Every function here is total, and that is a hard constraint rather than a
 * preference.** `grep -rn 'ErrorBoundary|componentDidCatch' src/` returns
 * nothing, and `MessageTranscript` is deliberately not gated on `media_type`, so
 * it executes for **every row of every conversation**. A throw on this path
 * blanks the entire SPA, not one bubble. Nothing here may parse, assert,
 * `Intl`-format, or index past an end — and a later ticket adding a throwing
 * formatter to this file is the failure mode this paragraph exists to prevent.
 *
 * **The known failure mode, recorded rather than discovered.** An unrecognised
 * `transcript_status` renders as nothing (see `transcriptView`). That fails
 * closed, which is right — but it means a backend that adds a fifth status makes
 * every transcript in the product vanish **silently**, and by construction that
 * is indistinguishable from the §09 absent-key case, so it cannot be surfaced as
 * an error without breaking the rule that an absent key is never an error. If
 * transcripts have "stopped appearing", look here first: add the new value to
 * `TRANSCRIPT_STATUSES` and the compiler will point at everything else that
 * needs it.
 */

/**
 * The three maskable fields this surface reads, taken from the wire type rather
 * than hand-rolled.
 *
 * `Pick` rather than a fresh `interface { transcript?: string; … }`: an interface
 * of only-optional properties is a *weak type*, which TypeScript refuses to
 * accept an object for unless it shares a property — which is precisely the
 * redacted payload these functions exist to answer for, the one with none of the
 * three keys. It is also the house pattern: `./diagnostics`, `./user-admin`,
 * `./send-channel` and `./device-scope` all take their shapes from `@/api/`.
 */
export type TranscriptOf = Pick<
  MessageInfo,
  'transcript' | 'transcript_language' | 'transcript_status'
>

/**
 * The closed set the reference specifies (§08), as a value so it can be searched
 * and as a type so a fifth member is a compile error everywhere at once.
 */
export const TRANSCRIPT_STATUSES = ['pending', 'done', 'failed', 'no_speech'] as const

/** One of the four documented status values. */
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]

/** The three that carry no transcript text of their own and say so instead. */
export type TranscriptNote = Exclude<TranscriptStatus, 'done'>

/**
 * What the row has to show, if anything. `none` renders as nothing at all — no
 * frame, no border, no placeholder.
 *
 * **`language` rides on the `text` arm only.** "No speech was detected in this
 * recording" beside a detected-language label is a visibly self-contradicting
 * pair, and a contradicting pair teaches the operator to distrust the honest
 * line next to it.
 */
export type TranscriptView =
  | { kind: 'none' }
  | { kind: 'text'; text: string; language: string | null }
  | { kind: 'note'; status: TranscriptNote }

/**
 * The longest transcript this app renders inside a chat bubble.
 *
 * Deliberately modest. Thirty bubbles share one non-virtualised scroll area
 * whose scroll-to-bottom effect reads `scrollHeight` synchronously on every
 * change to the message list, so the aggregate is what costs, not one row — and
 * a wall of text also defeats the point of the feature, which is to **skim** a
 * recording rather than read a transcript of it. The cut is visible
 * (`displayText` appends an ellipsis) and the audio is still there, unchanged,
 * for anyone who needs the rest.
 */
export const MAX_TRANSCRIPT_TEXT = 1_500

/**
 * How much of the raw field is looked at **at all**.
 *
 * This is the one that bounds the *work*, and it is separate from the cap above
 * on purpose. `displayText` replaces across the whole value and `.trim()`s it
 * *before* it slices, so handing it a 100 000-character transcript costs a
 * 100 000-character regex pass — per row, per render. `memo()` does not save it:
 * a refetch (the post-send invalidation, every debounced search keystroke, the
 * pager, every mount) replaces all thirty message identities at once, so the
 * work runs thirty times.
 *
 * Four times the display cap, because stripping only ever *removes* characters:
 * 6 000 raw characters cannot sanitise down to fewer than the 1 500 that will be
 * shown unless three quarters of the field is control characters, at which point
 * the content is already garbage.
 */
export const MAX_TRANSCRIPT_RAW = MAX_TRANSCRIPT_TEXT * 4

/** A language code is a handful of characters; anything longer is not one. */
export const MAX_TRANSCRIPT_LANGUAGE = 24

/**
 * A BCP-47-shaped code, which is all the reference ever describes (§08:
 * `"transcript_language": "ar"`, *DETECTED, not requested*).
 *
 * **Shape validation, not translation.** `displayText` strips control and format
 * characters and caps the length; it says nothing about twenty-four characters
 * of arbitrary prose arriving in a position where this application's own chrome
 * sits, beside a real timestamp. A value that is not a code is the server making
 * a statement this UI does not understand — the same situation as an
 * unrecognised status, and it gets the same answer: say nothing.
 */
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

/** Allocated once; `none` is stateless and there is no reason to rebuild it. */
const NONE: TranscriptView = { kind: 'none' }

/**
 * What each non-`done` status says for itself.
 *
 * `satisfies Record<TranscriptNote, string>` rather than a `switch`: adding a
 * fifth member to `TranscriptStatus` becomes a compile error here instead of a
 * silent fall-through to `undefined` rendered as an empty line.
 *
 * The wording is load-bearing in three ways. `pending` is **not alarming** and is
 * honest that nothing in this browser is watching — there is no polling, so
 * "it will appear shortly" would be a promise the UI cannot keep. `failed` states
 * a fact about the recording and offers **no retry**, because there is no
 * endpoint to retry with. `no_speech` is worded to be unmistakably *not* `failed`:
 * that recording was processed successfully and simply had nothing in it.
 */
const NOTES = {
  pending:
    'Still being transcribed. The text appears here once the server has finished and the conversation is loaded again.',
  failed: 'The transcription did not succeed for this recording.',
  no_speech: 'No speech was detected in this recording.',
} satisfies Record<TranscriptNote, string>

/** The sentence for a status that carries no text of its own. */
export function transcriptNote(status: TranscriptNote): string {
  return NOTES[status]
}

/**
 * The transcript, bounded then sanitised then capped — in that order.
 *
 * **`hasField` first, and then a `typeof` guard.** The key test is the §09 rule;
 * the `typeof` is for the case the key test deliberately admits — a key that is
 * present with an `undefined` (or, from an untyped wire, non-string) value.
 * `message.transcript || ''` would collapse both of those with a legitimate
 * empty string *and* with an absent key, which is the single idiom this module
 * exists to make unnecessary.
 *
 * **`.slice` before anything reads it** — see `MAX_TRANSCRIPT_RAW`.
 *
 * **`\s+ → ' '` before `displayText`, and this is not cosmetic.**
 * `displayText`'s class is `[\p{Cc}\p{Cf}]` replaced with the *empty string*,
 * and `Cc` contains `U+000A`. Without the collapse, `"Yes, that worked.\nCall me
 * back."` renders as `"Yes, that worked.Call me back."` — silent corruption of
 * the one thing this ticket exists to show, sitting beside real message content
 * that *does* keep its newlines. A whitespace collapse is not a second copy of
 * the character class, so `./surfaces` keeps its single-owner rule; and
 * transcribed speech is a paragraph rather than a structured document, so
 * collapsing is the right shape for it. (`./diagnostics` strips `Cf` only, for
 * the opposite case — JSON, where the indentation *is* the structure.)
 */
function transcriptText(message: TranscriptOf): string {
  if (!hasField(message, 'transcript')) return ''
  const raw = typeof message.transcript === 'string' ? message.transcript : ''
  return displayText(raw.slice(0, MAX_TRANSCRIPT_RAW).replace(/\s+/g, ' '), MAX_TRANSCRIPT_TEXT)
}

/** The detected language code, or `null` when there is not one to show. */
function transcriptLanguage(message: TranscriptOf): string | null {
  if (!hasField(message, 'transcript_language')) return null
  const raw = typeof message.transcript_language === 'string' ? message.transcript_language : ''
  const cleaned = displayText(raw, MAX_TRANSCRIPT_LANGUAGE)
  return LANGUAGE_CODE.test(cleaned) ? cleaned : null
}

/**
 * What this row should render beneath its player, if anything.
 *
 * The order of the tests is the specification, and each step answers a case the
 * reference does not describe:
 *
 * 1. **`canRead` first.** The surface does not exist without
 *    `messages.transcript.read`, and testing it before anything else means an
 *    unpermitted principal renders nothing even in the hypothetical where the
 *    backend ships a status without a transcript. Written here, once, rather
 *    than as a `&&` in JSX, so a test can reach it.
 * 2. **No `transcript_status` key → the text, if there is text.** The server
 *    made no statement about status; refusing to show a field the principal
 *    already holds because a *sibling* key is absent would be the UI inventing a
 *    rule the payload does not have.
 * 3. **An unrecognised status → nothing, even with text.** Here the server *did*
 *    make a statement and this UI does not understand it, so it declines to
 *    interpret the text beside it. This is the fail-closed direction, which is
 *    right for a field whose future values could be `partial` or
 *    `redacted_pending_review` — and its cost is the known failure mode in this
 *    module's header.
 * 4. **A recognised non-`done` status → its line, text or no text.** The
 *    server's statement about the recording outranks a partial artefact of it,
 *    and a `pending` row has no text *by definition* and must still say so.
 * 5. **`done` → the text, or nothing.** `done` with nothing to show renders
 *    nothing: a "transcription complete" line above an empty space is the UI
 *    announcing that a field belongs here and is empty, which is exactly the
 *    distinction §09 deletes by removing the key.
 */
export function transcriptView(message: TranscriptOf, canRead: boolean): TranscriptView {
  if (!canRead) return NONE

  const text = transcriptText(message)

  if (!hasField(message, 'transcript_status')) {
    return text ? { kind: 'text', text, language: transcriptLanguage(message) } : NONE
  }

  const status = TRANSCRIPT_STATUSES.find((known) => known === message.transcript_status)
  if (status === undefined) return NONE
  if (status !== 'done') return { kind: 'note', status }

  return text ? { kind: 'text', text, language: transcriptLanguage(message) } : NONE
}

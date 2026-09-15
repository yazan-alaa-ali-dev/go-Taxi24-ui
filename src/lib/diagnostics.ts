import type { MessageInfo } from '@/api/chat'
import type { ApiError } from '@/api/types'
import { hasDiagnostics, hasField } from '@/lib/redaction'
import { displayText } from '@/lib/surfaces'

/**
 * Every decision the AI-diagnostics surface makes, lifted out of the components
 * that render it (ticket z8pmx9mv3v).
 *
 * **Why a module rather than a few inline ternaries.** This repository has no
 * component renderer in its test environment — no jsdom, no React Testing
 * Library, and adding one would add a dependency to a build that inlines
 * everything into a single file. A decision written inside JSX is therefore a
 * decision no test can reach, and this feature's decisions are exactly the kind
 * that must be reachable: they are the §09 redaction rule, which the reference
 * calls the single largest source of silent bugs in this migration.
 *
 * **Two authorities, kept apart.** Whether this surface exists at all is
 * answered by `permissions[]` — `messages.debug.read`, read once at the height
 * of the chats screen. Whether one particular payload happens to be embedded in
 * one particular response is answered by the presence of a key. They are not the
 * same question and they must not be allowed to become one, so the permission
 * arrives here as a **boolean argument** and this module imports no permission
 * module. `./redaction`'s header makes the same point about `hasField`, and
 * `./source-policy.test.ts` enforces the import boundary.
 *
 * **Nothing here reads a value where a key is the question.** `has_debug` is
 * both maskable *and* `omitempty`, so absence means "there are no diagnostics"
 * for a permitted principal and "you may not see them" for anyone else — and the
 * backend deletes the distinction on purpose. `=== true` is the only correct
 * test and an explicit `false` is never expected.
 */

/**
 * The two maskable fields this surface reads, taken from the wire type rather
 * than hand-rolled.
 *
 * `Pick` rather than a fresh `interface { has_debug?: boolean }`: an interface of
 * only-optional properties is a *weak type*, which TypeScript refuses to accept
 * an object for unless it shares a property — which is precisely the redacted
 * payload these functions exist to answer for, the one with neither key. It is
 * also the house pattern: `./user-admin`, `./send-channel` and `./device-scope`
 * all take their shapes from `@/api/`.
 */
export type DiagnosticsOf = Pick<MessageInfo, 'has_debug' | 'metadata_debug'>

/** What the panel has to show, if anything. `none` renders as nothing at all. */
export type Diagnostics = { kind: 'payload'; value: unknown } | { kind: 'none' }

/** Where one message's diagnostics come from. */
export type DiagnosticsSource = { kind: 'embedded'; payload: unknown } | { kind: 'fetch' }

/**
 * A cap on text this app did not write and cannot predict.
 *
 * `metadata_debug` is arbitrary server-authored content of unknown schema: a
 * stored prompt, a model trace, a tool transcript. One oversized payload
 * formatted into a chat bubble is a layout the operator cannot scroll past, so
 * the text is capped and the cap is visible — `displayText` appends an ellipsis.
 * Larger than a notice body (`MAX_SERVER_MESSAGE` is 200) because this *is* the
 * content, not an explanation of it.
 */
export const MAX_DIAGNOSTICS_TEXT = 20_000

/**
 * Does this row show a diagnostics badge?
 *
 * The conjunction is the whole point and it is written once, here, rather than
 * as a `&&` chain in JSX: the permission decides whether the surface exists, and
 * `has_debug === true` decides whether this one message has anything behind it.
 *
 * **The badge is driven by `has_debug`, never by the presence of
 * `metadata_debug`.** A page embeds payloads under a 1 MiB budget, so a message
 * past that budget reports `has_debug: true` with nothing attached — and a badge
 * keyed on the payload would vanish for exactly the messages most worth opening.
 * It is also why the badge appears whether or not the opt-in is on: `has_debug`
 * rides on the message regardless, so an operator can see which messages carry
 * diagnostics before deciding to fetch any.
 */
export function showsDiagnosticsBadge(message: DiagnosticsOf, canRead: boolean): boolean {
  return canRead && hasDiagnostics(message)
}

/**
 * Is this message's payload already here, or does it have to be asked for?
 *
 * **Decided on the KEY.** `metadata_debug` is absent from the JSON when the
 * opt-in was off, when the principal may not read it, and when the message fell
 * past the page's embedding budget — and a truthiness test would additionally
 * mis-route a payload that is legitimately `null`, `0`, `''` or `false`, sending
 * a second request for a value that was already delivered.
 *
 * The caller reads this **once, when the panel opens**, and holds the answer for
 * the life of that panel. Recomputing it per render turns a single opt-in flip
 * into one request per open panel: turning the embed *off* replaces every row
 * with one carrying no `metadata_debug`, and every open panel would flip from
 * `embedded` to `fetch` at the same instant.
 */
export function diagnosticsSource(message: DiagnosticsOf): DiagnosticsSource {
  if (hasField(message, 'metadata_debug')) {
    return { kind: 'embedded', payload: message.metadata_debug }
  }
  return { kind: 'fetch' }
}

/** A non-null object, array included — the only answers the debug route can carry. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * What `GET /message/{message_id}/debug` actually sent.
 *
 * **This is the one shape in the ticket that is specified nowhere.** §12 states
 * that this endpoint is absent from `openapi.yaml`, and the reference gives the
 * route without the envelope — so the answer is read the same way every other
 * maskable field in this codebase is read: on the presence of a key, never on a
 * value, and with silence as the answer when there is nothing to show.
 *
 * Three arms, and each one is a deliberate choice:
 *
 * - **A sole `metadata_debug` key is unwrapped.** If the route answers
 *   `{ metadata_debug: {...} }`, the wrapper is this endpoint's envelope and the
 *   payload is what the operator asked for.
 * - **Sibling keys are kept.** If it answers
 *   `{ metadata_debug: {...}, generated_at: ... }`, unwrapping would show the
 *   operator *less* than the server sent them, which is worse than showing the
 *   object whole. So the object is rendered as it arrived.
 * - **Anything else is `none`.** Not an object, or an object with no keys at
 *   all, renders as nothing at all — no empty box, no placeholder, no error. An
 *   empty frame would be a UI announcing "a field belongs here and it is empty",
 *   which is exactly the distinction §09 deletes and this app must not restore.
 *
 * `results()` has already unwrapped `{code, message, results}` before anything
 * reaches here, so there is no transport envelope left that could be displayed
 * by mistake.
 */
export function debugPayloadOf(results: unknown): Diagnostics {
  if (!isObject(results)) return { kind: 'none' }

  const keys = Object.keys(results)
  if (keys.length === 0) return { kind: 'none' }
  if (keys.length === 1 && hasField(results, 'metadata_debug')) {
    return { kind: 'payload', value: results.metadata_debug }
  }
  return { kind: 'payload', value: results }
}

/**
 * Unicode **format** characters (`Cf`): the bidi overrides `U+202A..202E`, the
 * isolates `U+2066..2069`, `LRM`/`RLM` and the zero-width joiners.
 *
 * **Deliberately narrower than `surfaces.ts`'s `[\p{Cc}\p{Cf}]`, and that
 * difference is why this is a separate declaration rather than the duplication
 * that module's header warns against.** `Cc` contains `U+000A` and `U+0009` —
 * hostile inside a one-line account name, and *the indentation itself* inside a
 * pretty-printed JSON block. Reusing the wider class here flattened the whole
 * payload onto a single unreadable line; the test for indentation is what
 * caught it.
 *
 * `Cc` also needs no strip in this position: `JSON.stringify` escapes every C0
 * control **inside a string value** as `\uXXXX`, so the only raw ones left in
 * its output are the newlines and spaces it inserted. `Cf` it passes through
 * untouched — verified, not assumed — which is the entire reason this exists.
 */
const FORMAT_CHARACTERS = /\p{Cf}/gu

/**
 * The payload, as text a human can read — and as text, only.
 *
 * **`JSON.stringify`, never `JSON.parse`.** `metadata_debug` arrives as a ready
 * object, not an escaped string; §11 lists parsing it among the common traps.
 * Parsing an object throws or, worse, stringifies it into `"[object Object]"`
 * and parses *that*.
 *
 * **Stripped as well as capped, and the strip is not theoretical.** A `U+202E`
 * stored inside a payload survives `JSON.stringify` into the rendered text and
 * reorders what is printed around it. React escapes HTML; it does not neutralise
 * bidi.
 *
 * **Absence collapses to the empty string,** which the panel renders as nothing
 * at all. `JSON.stringify(undefined)` answers `undefined` rather than a string,
 * and interpolating that would print the literal text "undefined" into the panel
 * as though the server had sent it.
 */
export function diagnosticsText(value: unknown): string {
  const json = JSON.stringify(value, null, 2)
  if (json === undefined) return ''

  const cleaned = json.replace(FORMAT_CHARACTERS, '')
  return cleaned.length <= MAX_DIAGNOSTICS_TEXT
    ? cleaned
    : `${cleaned.slice(0, MAX_DIAGNOSTICS_TEXT)}…`
}

/**
 * The one error path in this ticket, and the reason it is allowed to exist.
 *
 * Every other absence here is silent: a missing key is not an error, carries no
 * 403, and must produce no toast, banner or retry. This message is different
 * because the operator **explicitly asked** for this one payload and the request
 * they asked for failed — saying nothing would leave a spinner that never ends.
 *
 * **The server's own text is led, capped and stripped rather than rendered
 * bare.** This lands inside a chat bubble, beside real message content, where an
 * operator may read it as content; it is chosen by whatever answered the request,
 * which on a proxied deployment need not be gowa. The fixed sentence says what
 * happened, and the detail is bounded. The request carries no body, so nothing
 * this app sent can be echoed back through it.
 *
 * This one *is* a single-line label, so it takes `displayText` and the wider
 * `Cc`+`Cf` class that goes with it — the opposite of the payload above, where a
 * newline is structure. Same reasoning, different position.
 */
export function diagnosticsFailure(error: ApiError): string {
  const detail = displayText(error.message, 200)
  return detail
    ? `The diagnostics could not be loaded. ${detail}`
    : 'The diagnostics could not be loaded.'
}

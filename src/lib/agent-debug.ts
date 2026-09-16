import type { TtlField } from '@/api/agent'
import type { ApiError } from '@/api/types'
import { phoneFromJid } from '@/lib/jid'
import { MAX_SERVER_MESSAGE } from '@/lib/auth-messages'
import { displayText } from '@/lib/surfaces'

/**
 * Every decision the agent-debug toggle makes, lifted out of the dialog that
 * renders it (ticket z8pmx9mw2x).
 *
 * **Why a module rather than a few inline ternaries.** This repository has no
 * component renderer in its test environment — no jsdom, no React Testing
 * Library, and adding one would add a dependency to a build that inlines
 * everything into a single file. A decision written inside JSX is therefore a
 * decision no test can reach, and the decisions here are the ones that must be:
 * they are the difference between telling an operator "nothing changed" and
 * telling them the truth. `./diagnostics` and `./transcript` are written the
 * same way for the same reason.
 *
 * **Two authorities, kept apart.** Whether this surface exists at all is
 * answered by `permissions[]` — `admin.debug.toggle`, read once at the height of
 * the chats screen. Whether *this* conversation has a number behind it is
 * answered by its JID. They are not the same question, so the permission arrives
 * here as a **boolean argument** and this module imports no permission module;
 * `./source-policy.test.ts` enforces the boundary.
 *
 * **The governing fact: there is no reader.** GOWA stores nothing about which
 * numbers have debug on and exposes no endpoint that reads the state back, so
 * nothing here may produce a persistent on/off claim. `expires_at` is a cache
 * at most, expired the moment it passes, and the two `expiry*` functions below
 * are that rule reduced to something a test can run.
 *
 * **And the rule that shaped the failure table: an unexplained failure is
 * `unknown`, not `no`.** Saying "the switch was not applied" is a *claim*, and
 * this UI makes it only where the reference's own catalogue supports it. See
 * `toggleFailure`.
 */

/** A duration that has been validated, or the reason it was refused. */
export type Ttl = TtlField | { kind: 'error'; message: string }

/**
 * The durations the dialog offers as one-press buttons.
 *
 * Three plain numbers rather than a configurable list: they are the reference's
 * own example values, the free numeric entry covers everything else, and a
 * config for a value that never changes is the abstraction this repository's
 * review lens exists to catch.
 */
export const TTL_PRESETS = [30, 60, 120] as const

/**
 * A typed duration from what the operator typed.
 *
 * **Digits-first, conversion second.** `/^[0-9]+$/` on the trimmed string is one
 * rule that rejects `1.5`, `-5`, `1e3`, `0x10`, `abc`, `5abc` and `  ` — every
 * spelling `Number()` would otherwise turn into a duration the operator did not
 * type. Testing the text before converting it is why `Number` here cannot return
 * a surprise.
 *
 * `Number.isSafeInteger` is the second half, and it is not ceremony: a pasted
 * 300-digit value passes the digit test, becomes `Infinity`, and `JSON.stringify`
 * serialises that as `null` — a body the server reads as "no duration" while the
 * operator believes they set one.
 *
 * Blank means **omit the field**, which is not the same as sending `0`: the
 * upstream default applies, and `0` is a 400.
 */
export function parseTtl(raw: string): Ttl {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'omit' }
  if (!/^[0-9]+$/.test(trimmed)) {
    return { kind: 'error', message: 'Enter a whole number of minutes, or leave this empty.' }
  }
  const minutes = Number(trimmed)
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    return { kind: 'error', message: 'The duration must be at least one minute.' }
  }
  return { kind: 'minutes', minutes }
}

/**
 * The number the menu would act on, or `null` when it offers nothing.
 *
 * **The one place the two authorities meet**, and written here rather than as an
 * `&&` chain in JSX so that a test can reach it: the permission decides whether
 * the surface exists, and the JID decides whether this conversation has a number
 * behind it at all. A group, a newsletter, `status@broadcast` and a `@lid` all
 * answer `null` — silently, with no disabled item and no placeholder, because a
 * disabled control still announces a capability, and here it would announce one
 * that cannot exist for this chat.
 *
 * `showsDiagnosticsBadge` in `./diagnostics` is the same shape for the same
 * question one ticket over.
 */
export function debugToggleTarget(jid: string, canToggle: boolean): string | null {
  return canToggle ? phoneFromJid(jid) : null
}

/** What a successful toggle actually reported. */
export interface ToggleReport {
  phone: string
  enabled: boolean
  expiresAt: string | null
}

/** A non-null object — the only answer shape this body can usefully carry. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The same allow-list `phoneFromJid` applies, used on the way back in.
 *
 * The proxy returns the upstream body **unmodified**, so `results.phone` is a
 * string this application does not control, rendered into the one sentence that
 * tells an operator which customer's number was changed. A `U+202E` in it
 * reorders that sentence; a five-kilobyte string in it becomes the dialog.
 * Capping and stripping would still put an attacker-chosen value in the claim,
 * so the value is *matched* instead: a genuine server-side normalisation is
 * still a well-formed number and still shown, and anything else is discarded in
 * favour of what was sent.
 */
const E164 = /^\+[0-9]{5,20}$/

/**
 * What a `200` said, read defensively off a body with no contract.
 *
 * The documented shape is `{phone, enabled, expires_at}` and the reference
 * promises nothing more: additional fields are passed through untouched, so they
 * are ignored here rather than treated as a parse failure, and a body that is
 * not an object at all falls back to what was sent rather than throwing.
 *
 * **`enabled` is read from the response, not from the request.** The operator
 * needs to see what happened, not what they asked for — if the omni answers
 * `false` to an "on" request, the confirmation says off.
 *
 * **An expiry is never shown beside "collection off".** `expires_at` is dropped
 * whenever the confirmed outcome is `false`, even if the upstream sends one:
 * a window beside "collection is off" is a self-contradicting pair, and the UI
 * refuses to render one rather than passing the contradiction to the operator.
 */
export function toggleReport(
  sent: { phone: string; enabled: boolean },
  results: unknown,
): ToggleReport {
  const body = isObject(results) ? results : {}

  const echoed = typeof body.phone === 'string' && E164.test(body.phone) ? body.phone : sent.phone
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : sent.enabled
  const expiresAt =
    enabled && typeof body.expires_at === 'string' && body.expires_at.trim() !== ''
      ? body.expires_at
      : null

  return { phone: echoed, enabled, expiresAt }
}

/**
 * Whether the switch definitely did not take effect, or whether nobody knows.
 *
 * There is no `'yes'`: a toggle that was applied answers `200` and becomes a
 * `ToggleReport`, never a failure.
 */
export type Applied = 'no' | 'unknown'

export interface ToggleFailure {
  message: string
  applied: Applied
  /** Does the dialog offer a button the operator may press? Never automatic. */
  offersRetry: boolean
}

/**
 * The codes the reference documents as being decided **before** the upstream
 * call is made — and therefore the only ones this UI is entitled to report as
 * "nothing changed".
 *
 * `AGENT_DEBUG_DISABLED` is on the list because the endpoint answers it with no
 * upstream call at all, and `AGENT_DEBUG_BUSY` because the call is refused
 * rather than queued. `AGENT_UPSTREAM_ERROR` is on it because all three of its
 * documented causes — unreachable, a non-2xx refusal, a redirect that is never
 * followed — are refusals.
 *
 * `AGENT_UPSTREAM_INVALID_RESPONSE` is deliberately **not**: it means the omni
 * answered **2xx** with a body this proxy could not read, so it accepted the
 * command and only its answer was unreadable. Reporting that as "not applied"
 * would be telling the operator nothing changed about a change that most likely
 * happened.
 */
const NOT_APPLIED = new Set([
  'DEVICE_ID_REQUIRED',
  'VALIDATION_ERROR',
  'AGENT_DEBUG_DISABLED',
  'AGENT_DEBUG_BUSY',
  'AGENT_UPSTREAM_ERROR',
])

/** The sentence each documented code gets, and whether a retry is worth offering. */
const FAILURES: Record<string, { lead: string; retry: boolean; detail: boolean }> = {
  DEVICE_ID_REQUIRED: {
    lead: 'Select a device before changing diagnostics collection. Nothing was changed.',
    retry: false,
    detail: false,
  },
  // The one refusal the operator can act on without leaving this dialog: the
  // duration field is still on screen and still editable, so re-submitting after
  // correcting it is a legitimate next step rather than an invitation to repeat
  // a refusal. The two below are not — a device is selected elsewhere and an
  // unconfigured deployment is fixed by whoever runs it.
  VALIDATION_ERROR: {
    lead: 'The server refused this request, so nothing was changed.',
    retry: true,
    detail: true,
  },
  // Names no environment variable, deliberately. The deployment's configuration
  // vocabulary is the server's business, and the rule in source-policy.test.ts
  // that bans those names across src/ keeps an empty exemption list because of
  // this line.
  AGENT_DEBUG_DISABLED: {
    lead: 'This server has no AI-agent diagnostics integration configured, so the switch is unavailable here — ask whoever runs it.',
    retry: false,
    detail: false,
  },
  AGENT_DEBUG_BUSY: {
    lead: 'Too many diagnostics toggles are in flight at once. The request was refused rather than queued — try again shortly.',
    retry: true,
    detail: false,
  },
  AGENT_UPSTREAM_ERROR: {
    lead: 'The AI agent could not be reached, so the switch was not applied.',
    retry: true,
    detail: false,
  },
  AGENT_UPSTREAM_INVALID_RESPONSE: {
    lead: 'The AI agent answered unexpectedly. It may or may not have applied the switch.',
    retry: true,
    detail: false,
  },
  AGENT_UPSTREAM_TIMEOUT: {
    lead: 'The AI agent did not answer in time. The toggle may or may not have been applied.',
    retry: true,
    detail: false,
  },
}

/**
 * A failed toggle, as something the operator can act on.
 *
 * **The default arm is `unknown`, and inverting it was the single most important
 * change this ticket made.** An earlier draft reported everything it did not
 * recognise as "not applied", which is wrong for at least three reachable cases:
 * `http` carries a 45-second budget, so a slow proxy hop aborts client-side as
 * `status: 0` **after** the command was forwarded; a reverse proxy in front of
 * gowa can mint a `502`/`504` carrying no envelope code at all; and a future
 * code this table does not know is, by definition, unclassified. Each of them
 * can happen after the agent acted.
 *
 * So `'no'` is claimed only for `NOT_APPLIED` above. Everything else says the
 * outcome is unknown and offers a retry the operator presses themselves —
 * nothing here ever retries on its own.
 *
 * **The server's own text is led, capped and stripped, never rendered bare.**
 * `displayText` rather than a cap alone: this lands in a dialog beside a
 * customer's phone number, the text is chosen by whatever answered the request —
 * which on a proxied deployment need not be gowa — and React escapes HTML but
 * does not neutralise bidi. Only the `VALIDATION_ERROR` arm carries it, because
 * that is the one failure whose text is about the body this UI just sent.
 */
export function toggleFailure(error: ApiError): ToggleFailure {
  const known = FAILURES[error.code]
  const applied: Applied = NOT_APPLIED.has(error.code) ? 'no' : 'unknown'

  if (!known) {
    // Two shapes reach here: a refusal decided before the request was built
    // (401, 413 and anything else a 4xx) and an outcome nobody classified. The
    // first is safe to call "not applied"; the second is not.
    const refusedOutright = error.status >= 400 && error.status < 500
    const detail = displayText(error.message, MAX_SERVER_MESSAGE)
    const lead = refusedOutright
      ? 'The server refused this request, so nothing was changed.'
      : 'The toggle could not be completed, and it may or may not have been applied.'
    return {
      message: detail ? `${lead} ${detail}` : lead,
      applied: refusedOutright ? 'no' : 'unknown',
      offersRetry: !refusedOutright,
    }
  }

  const detail = known.detail ? displayText(error.message, MAX_SERVER_MESSAGE) : ''
  return {
    message: detail ? `${known.lead} ${detail}` : known.lead,
    applied,
    offersRetry: known.retry,
  }
}

/**
 * The confirmation sentence for a `200` (AC-28).
 *
 * The number comes from `ToggleReport`, which has already decided whether to
 * trust the echoed value, so nothing untrusted is interpolated here.
 */
export function toggleSummary(report: ToggleReport): string {
  return report.enabled
    ? `Diagnostics collection is on for ${report.phone}.`
    : `Diagnostics collection is off for ${report.phone}.`
}

/**
 * When the agent said it would stop collecting — or `null`, which means say
 * nothing.
 *
 * **`null` for "already past" is the whole point.** There is no endpoint that
 * reads the current state, so a reported expiry is a cache and nothing more, and
 * the moment it passes this UI knows nothing about the number again. Absent,
 * unparseable and past all collapse to the same silence, because the alternative
 * is a dashboard asserting a state it cannot see.
 */
export function expiryAt(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null
  const at = new Date(expiresAt).getTime()
  if (Number.isNaN(at) || at <= now) return null
  return at
}

/**
 * The largest delay `setTimeout` accepts. Beyond it the value overflows a signed
 * 32-bit int and the callback fires **immediately** — so an expiry a month out
 * would be forgotten at once, the exact opposite of what the timer is for.
 */
const MAX_TIMER_DELAY = 2 ** 31 - 1

/**
 * How long to wait before this UI must stop claiming anything — or `null` when
 * there is no timer to arm.
 *
 * Separate from `expiryAt` because the two answer different questions: that one
 * decides whether to *render* the expiry, this one decides whether to *schedule*
 * forgetting it. An expiry beyond `MAX_TIMER_DELAY` is still rendered (it has
 * genuinely not passed) and simply not scheduled — a distinction that would be
 * an unreachable branch inside a component and is a test case out here.
 */
export function expiryDelay(expiresAt: string | null, now: number = Date.now()): number | null {
  const at = expiryAt(expiresAt, now)
  if (at === null) return null
  const delay = at - now
  return delay > MAX_TIMER_DELAY ? null : delay
}

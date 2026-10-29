import type {
  DeviceWebhookConfig,
  UpdateDeviceWebhookPayload,
  WebhookSign,
  WebhookSignatureScheme,
} from '@/api/devices'
import { toApiError } from '@/lib/api-error'

/**
 * Every decision the device webhook surface makes, as a function of its
 * arguments.
 *
 * **This module exists because two different operations look like "turn the
 * webhook off", and the product got it wrong until this ticket.** The dialog
 * this replaces told the operator to "leave the URL empty and save to disable
 * the webhook", which is the one thing the reference explicitly warns against:
 *
 * - Emptying `webhook_url` through `PATCH /devices/{id}/webhook` is a
 *   **deletion**. It erases the URL, the secret and the event list, and the
 *   device's events then fall back to the deployment-wide webhook list — so
 *   events keep going out, just somewhere else, to an endpoint the operator did
 *   not choose for this customer.
 * - `PATCH /devices/{id}/webhook/enabled` with `false` is **silence**. Nothing
 *   is delivered, nothing falls back, and the AI agent bridge is not called, so
 *   no automatic reply reaches the customer.
 *
 * One of those loses the configuration and leaks the events; the other keeps
 * everything and stops the delivery. The sentences below are the product's only
 * defence against choosing the wrong one, so they are constants with tests
 * rather than copy inside JSX — copy inside JSX is copy that drifts from the
 * request beside it.
 *
 * Pure: no store, no React, no axios instance.
 */

/**
 * What saving this form does to the stored configuration.
 *
 * One function, called by both the warning and the request, so the two cannot
 * disagree. Two independent `url.trim() === ''` checks in a component is exactly
 * how a UI ends up warning about one thing and sending another.
 */
export function webhookSaveEffect(url: string): 'clear' | 'set' {
  return url.trim() === '' ? 'clear' : 'set'
}

/**
 * What an empty URL destroys, in the words the specification requires.
 *
 * A constant rather than a string in a dialog because the test asserts the two
 * facts it must carry — that three stored values are erased, and that events
 * then go *somewhere else* rather than stopping — and a paraphrase in a
 * component would satisfy neither.
 */
export const CLEARS_WEBHOOK_WARNING =
  'Saving an empty URL deletes this device’s webhook configuration: the URL, the signing secret and the event list are all erased. Events do not stop — this device’s events then fall back to the deployment-wide webhook list, so they keep going out, to an endpoint you did not choose for this customer. To stop delivery without losing anything, switch delivery off instead.'

/**
 * What switching delivery off actually does — all four consequences.
 *
 * The fourth is the one nobody expects and the reason this list is data: an
 * operator disabling a webhook to stop *notifications* also stops the AI agent
 * bridge, so the customer stops receiving automatic replies. That is a change in
 * what the customer experiences, not an internal detail, and it belongs on
 * screen next to the switch.
 */
export const DISABLED_MEANS = [
  'Nothing is delivered to this device’s webhook URL.',
  'Nothing falls back to the deployment-wide webhook either — switching delivery off means silence, not redirection.',
  'The AI agent bridge is not called for this device, so no automatic reply is sent to the customer.',
  'Incoming messages are still received and stored, and you can still reply by hand.',
] as const

/** What re-enabling does, which is the half an operator hesitates over. */
export const ENABLING_RESUMES =
  'Switching delivery back on resumes it to the same URL, with the same signing secret and the same event list, on the first message that arrives afterwards. There is no restart, no re-pairing, and nothing to re-enter.'

/**
 * What skipping TLS verification costs.
 *
 * The field was already on this form with a bare label. Every other switch here
 * now states its consequence, and leaving the one that turns off peer
 * authentication as the exception would be the odd omission: with it on, this
 * device's events — signed with the secret above, and carrying the customer's
 * message content — go to whatever presents itself at that address.
 */
export const INSECURE_SKIP_VERIFY_MEANS =
  'With this on, the server does not check that the certificate at the webhook URL belongs to that host. This device’s events — the customer’s message content, signed with the secret above — are then delivered to whatever answers at that address. Turn it on only for an endpoint whose certificate you control and cannot fix.'

/**
 * A sentence about the URL's scheme, or `null`.
 *
 * **A notice, never a refusal.** An endpoint reachable only inside a private
 * network is a legitimate deployment, and the server is the authority on what it
 * accepts; a client-side rejection here would block a working configuration to
 * make a point. What the operator is owed is the consequence.
 *
 * It deliberately does not reach for `@/lib/url`, which normalises the *server
 * base URL* and answers a different question with different rules. A string that
 * is not a URL at all gets the same notice as `http:` — the server will reject
 * it, and guessing which malformed strings it would have taken is how a client
 * refuses input the server would have accepted.
 */
export function webhookUrlNotice(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed === '') return null
  if (/^https:\/\//i.test(trimmed)) return null
  return 'This URL is not https. Events for this device — the customer’s message content — will be sent over a connection that anyone on the path can read. Use https unless this endpoint is reachable only inside a private network.'
}

/**
 * Is webhook delivery on for this device, and did the server actually say so?
 *
 * **An absent field reads as `true`.** The reference documents
 * `webhook_enabled` as always present — a device that has never been disabled
 * reports `true`, and so does a device with no webhook configuration at all,
 * because absence of configuration is not the same as being silenced — but a
 * deployment predating the switch omits it, and reading an omission as `false`
 * would tell an operator their customer's webhook is silenced when it is not.
 *
 * **And the inference is reported rather than hidden**, which is the honest
 * form of a fail-open on a delivery-state display: `reported: false` means this
 * value is what we assume, not what the server said, and the switch labels it
 * that way instead of asserting it.
 *
 * Note what this is *not* about: a response that has not arrived. The rule
 * concerns a missing **field**, not a missing **read** — passing `undefined`
 * because a query is still in flight would render "on" for the length of the
 * load, on the one screen that exists to stop exactly that confusion. The caller
 * renders no switch until the read resolves.
 */
export function webhookEnabledFrom(config: DeviceWebhookConfig): {
  enabled: boolean
  reported: boolean
} {
  const reported = config.webhook_enabled !== undefined
  return { enabled: config.webhook_enabled ?? true, reported }
}

/**
 * The `PATCH /devices/{id}/webhook` body.
 *
 * `webhook_url` is always present: it is a required field whose empty value is
 * *meaningful*, so the payload-cleaning helper in `@/api/request` — which drops
 * `undefined` **and** `''` — would turn a deletion into a no-op body. This
 * module builds the payload literally for the same reason `src/api/accounts.ts`
 * refuses that helper across its whole surface.
 *
 * The secret travels back unchanged when the operator did not replace it. The
 * reference does not say what an *omitted* `webhook_secret` does to the stored
 * one, and guessing "it is kept" would silently destroy a customer's signing
 * secret on every unrelated save if the guess were wrong. Round-tripping the
 * value is the only behaviour that is safe under both readings.
 *
 * **All six keys, always.** The four above are replace-on-send and the two
 * authentication keys are absent-preserving — omitting them keeps what is
 * stored. Sending every key explicitly makes the body a full statement of the
 * form, so what is stored after a save is exactly what the operator saw; the
 * absent-preserving rule is never relied on. Inherit and a blank header are an
 * explicit `null`, the documented reset.
 *
 * **A deletion resets the authentication keys too.** An empty URL erases the
 * URL, the secret and the event list; leaving a custom header and mode behind
 * would make the "reset" partial, so the clear case sends `null` for both —
 * the full reset the reference gives as its own example.
 *
 * **Under Agent HMAC v1 the hidden controls send their reset value** (z8pmx9pyre).
 * The server ignores the header name and refuses an explicit `webhook_sign:
 * false`; a control the operator cannot see contributes nothing to the body.
 * The scheme key itself follows `schemeKeyPayload`.
 */
export function webhookPayloadFrom(fields: {
  url: string
  secret: string
  events: string
  insecureSkipVerify: boolean
  headerName: string
  mode: WebhookAuthMode
  scheme: WebhookSchemeState
  /** `v1InForce(...)` for this form. */
  v1: boolean
}): UpdateDeviceWebhookPayload {
  const clearing = webhookSaveEffect(fields.url) === 'clear'
  const resetAuth = clearing || fields.v1
  const payload: UpdateDeviceWebhookPayload = {
    webhook_url: fields.url.trim(),
    webhook_secret: fields.secret,
    webhook_events: fields.events.trim(),
    webhook_insecure_skip_verify: fields.insecureSkipVerify,
    webhook_header_name: resetAuth ? null : headerNamePayload(fields.headerName),
    webhook_sign: resetAuth ? null : signFrom(fields.mode),
  }
  const scheme = schemeKeyPayload(fields.scheme, clearing)
  return scheme === undefined ? payload : { ...payload, webhook_signature_scheme: scheme }
}

/** The sentence a failed save gets when the server's own text may not be shown. */
export const WEBHOOK_SAVE_FAILED_REDACTED =
  'The webhook was not saved. The server’s reason is not shown here because this request carried the signing secret, and a rejection can quote the field it rejected. Check the URL, the secret, the signature scheme, the header name and the event list and try again.'

/**
 * May the server's own text be rendered for this failure?
 *
 * The `createFailure` / `CREATE_FAILED_REDACTED` shape from
 * `@/lib/account-lifecycle`, applied to the same hazard one surface over: a
 * `4xx` rejecting this payload may echo the field it rejected, and this payload
 * carries a signing secret. So no server text is rendered for a failed save.
 *
 * A failure with no response behind it — `status: 0`, meaning offline, DNS, or a
 * cancelled request — keeps its text: there is no response to have echoed
 * anything, and discarding the only diagnostic available would make an
 * unreachable server indistinguishable from a rejected secret.
 *
 * The client-side validators below cover every documented `400`, which makes
 * this path rare. That is **not** a reason to relax it: the rule is about what
 * the request carried, not about how likely a rejection is.
 */
export function webhookSaveFailure(error: unknown): 'server' | 'redacted' {
  return toApiError(error).status >= 400 ? 'redacted' : 'server'
}

/*
 * ---------------------------------------------------------------------------
 * Authentication: how the credential reaches the receiver (z8pmx9p135).
 *
 * `webhook_sign` is three states — signed, plain, inherit — and `null` is not
 * `false`: reading an inherited signature as "plain" would turn an HMAC into a
 * credential sent verbatim. The header name is free text whose empty value is
 * also "inherit". Both resolve against a deployment default the operator cannot
 * read, which is why the server reports the effective values and this module
 * surfaces them.
 * ---------------------------------------------------------------------------
 */

export type WebhookAuthMode = 'inherit' | 'signed' | 'plain'

export const AUTH_MODE_LABELS: Record<WebhookAuthMode, string> = {
  inherit: 'Inherit (server default)',
  signed: 'Signed (HMAC-SHA256)',
  plain: 'Plain secret',
}

/** An absent field is a deployment predating it, which behaves as inherit. */
export function authModeFrom(sign: WebhookSign | undefined): WebhookAuthMode {
  if (sign === true) return 'signed'
  if (sign === false) return 'plain'
  return 'inherit'
}

export function signFrom(mode: WebhookAuthMode): WebhookSign {
  if (mode === 'signed') return true
  if (mode === 'plain') return false
  return null
}

/** The field's text: blank for every spelling of "inherit". */
export function headerNameFrom(stored: string | null | undefined): string {
  return stored ?? ''
}

/** What the header field sends: the trimmed name, or `null` to inherit. */
export function headerNamePayload(input: string): string | null {
  const trimmed = input.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The RFC 7230 `token` alphabet, ASCII only. Written out rather than `\w` or a
 * Unicode class: either would accept letters the server refuses.
 */
const HEADER_TOKEN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/
const HEADER_NAME_MAX = 128
/** Set by the transport itself; the server refuses them as the credential header. */
const RESERVED_HEADERS = [
  'content-type',
  'content-length',
  'host',
  'connection',
  'transfer-encoding',
]

/**
 * Why this header name would be refused, or `null`.
 *
 * Validates the same trimmed string `headerNamePayload` sends. `Authorization`
 * is deliberately allowed — it is how a receiver expecting a static token in
 * the standard header is reached. A header name is not a secret, so quoting it
 * back is fine.
 */
export function headerNameError(input: string): string | null {
  const name = input.trim()
  if (name === '') return null
  if (name.length > HEADER_NAME_MAX) {
    return `A header name may be at most ${HEADER_NAME_MAX} characters.`
  }
  if (!HEADER_TOKEN.test(name)) {
    return "A header name may contain only ASCII letters, digits and ! # $ % & ' * + - . ^ _ ` | ~ — no spaces, colons or other characters."
  }
  if (RESERVED_HEADERS.includes(name.toLowerCase())) {
    return `“${name}” is set by the transport itself and cannot carry the credential. Choose another header name.`
  }
  return null
}

const SECRET_MAX = 4096
/** C0, DEL and C1. A line break in a header value is a header injection. */
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/

/**
 * Why the secret about to be sent would be refused, or `null`.
 *
 * Checks the secret **to be sent**, not only a newly typed one: a stored secret
 * written before the server enforced these rules would otherwise fail every
 * save with a rejection whose text is redacted, leaving the operator no way to
 * learn why. **No message names the secret or any part of it.**
 */
export function secretError(secret: string, source: 'replacement' | 'stored'): string | null {
  if (secret === '') return null
  const tooLong = secret.length > SECRET_MAX
  const control = CONTROL_CHARACTER.test(secret)
  if (!tooLong && !control) return null
  const rule = tooLong
    ? `be at most ${SECRET_MAX} characters`
    : 'contain no control characters (such as line breaks)'
  return source === 'stored'
    ? `The secret stored for this device does not meet the server’s rules — a secret must ${rule}. Enter a replacement to save.`
    : `The secret must ${rule}.`
}

const SIGNED_NEEDS_SECRET =
  'Signed delivery needs a secret for this device. Enter one, or choose Inherit.'

/**
 * Why this mode cannot be sent with this secret, or `null`.
 *
 * **Both** explicit modes need a secret for this device. Signed without one is
 * refused by the server. Plain without one is not — the empty device secret
 * inherits the deployment-wide secret, which would then go out verbatim to a
 * URL chosen for one customer. Inherit is never blocked: that is the
 * deployment's policy, not a choice made here.
 */
export function authSecretError(mode: WebhookAuthMode, secretToSend: string): string | null {
  if (secretToSend !== '') return null
  if (mode === 'signed') return SIGNED_NEEDS_SECRET
  if (mode === 'plain') {
    return 'Plain delivery needs a secret for this device. Without one the server would send its deployment-wide secret, verbatim, to this URL. Enter one, or choose Inherit.'
  }
  return null
}

/**
 * What Plain costs, or `null` for the other modes.
 *
 * The secret already stored — possibly an HMAC key that has never left the
 * server — becomes a header value on every event, and on a URL that is not
 * https it travels readable on every delivery and every retry.
 */
export function plainWarning(mode: WebhookAuthMode, url: string): string | null {
  if (mode !== 'plain') return null
  const base =
    'Plain sends this device’s secret — including the one already stored — verbatim in the header on every event, so anything that sees one request holds the credential. Prefer Signed unless the receiver requires a static token.'
  return webhookUrlNotice(url) === null
    ? base
    : `${base} This URL is not https, so the secret also travels in clear text on every delivery and every retry.`
}

export interface EffectiveAuth {
  headerName: string
  mode: 'signed' | 'plain'
}

/**
 * The values the server says it will actually use, or `null` when it did not
 * report both. Never filled in from a guessed default: the default lives in an
 * environment the UI cannot read, and a guessed value is a claim.
 */
export function effectiveAuthFrom(config: DeviceWebhookConfig): EffectiveAuth | null {
  const headerName = config.effective_webhook_header_name
  const sign = config.effective_webhook_sign
  if (typeof headerName !== 'string' || headerName === '' || typeof sign !== 'boolean') return null
  return { headerName, mode: sign ? 'signed' : 'plain' }
}

export const EFFECTIVE_UNKNOWN =
  'This server did not report the header and mode it will actually use. It may predate per-device authentication settings, in which case the choices below are stored but not applied.'

const INHERITED_PLAIN_DEPLOYMENT_SECRET =
  'The server default for this device is plain, and this device has no secret of its own — so the deployment-wide secret is sent verbatim to this URL. Set a secret for this device, or choose Signed.'
const INHERITED_PLAIN_OWN_SECRET =
  'The server default for this device is plain, so this device’s own secret is sent verbatim in the header on every event — anything that sees one request holds it. Choose Signed unless the receiver requires a static token.'
const LEAVING_V1_DEFAULT_MODE_UNKNOWN =
  'This dialog cannot see the server’s default mode for this device: under Agent HMAC v1 the mode the server reports is not the legacy default. If that default is plain, this device’s secret is sent verbatim in the header on every event. Choose Signed to be sure.'

/**
 * Inherit, resolving to plain: a secret goes out verbatim. Not a refusal —
 * inheriting is the deployment's policy — but the operator is told before they
 * rely on it (z8pmx9pyrj widened this from the no-secret case only).
 *
 * - **The device's own secret counts.** It is then the one sent verbatim, which
 *   is exactly the reference's warning about returning to legacy.
 * - **The effective mode is trusted only when the stored mode inherits.** Beside
 *   an explicit stored mode it is the device's own choice, and "the server
 *   default is plain" would be a claim about a value nobody reported.
 * - **Leaving v1 makes the default invisible.** Under v1 the reported mode
 *   describes nothing about the legacy default, so Inherit on the way out gets
 *   an honest "not visible, may be plain" rather than silence.
 *
 * Takes booleans, never the secret, so no secret can reach its wording.
 */
export function inheritedPlainWarning(fields: {
  mode: WebhookAuthMode
  seededSign: WebhookSign
  leavingV1: boolean
  effective: EffectiveAuth | null
  hasSecret: boolean
}): string | null {
  if (fields.mode !== 'inherit') return null
  if (fields.leavingV1) return LEAVING_V1_DEFAULT_MODE_UNKNOWN
  if (fields.seededSign !== null || fields.effective?.mode !== 'plain') return null
  return fields.hasSecret ? INHERITED_PLAIN_OWN_SECRET : INHERITED_PLAIN_DEPLOYMENT_SECRET
}

/*
 * ---------------------------------------------------------------------------
 * Signature scheme: which wire contract the delivery follows (z8pmx9pyre).
 *
 * A third axis on top of mode and header. Under `agent_hmac_v1` the mode and
 * header are ignored and three fixed headers carry an HMAC over
 * `timestamp.request_id.raw_body` — replay protection `legacy` does not have.
 *
 * The stored field reaches this module in four states, not three: the three
 * choices, plus *absent* (a server predating the field — the UI then offers no
 * control and sends no key, byte-identical to before) and *a value this UI does
 * not know* (a newer server — the key is omitted on an unrelated save, because
 * it is absent-preserving and omitting it is the one body that cannot overwrite
 * what it does not understand).
 * ---------------------------------------------------------------------------
 */

export type WebhookScheme = 'inherit' | 'legacy' | 'agent_hmac_v1'
/** What the form holds: one of the choices, or a stored state it cannot offer. */
export type WebhookSchemeState = WebhookScheme | 'unreported' | 'unrecognised'
/** What the server says it will use. `invalid` means every delivery is stopped. */
export type EffectiveScheme = 'legacy' | 'agent_hmac_v1' | 'invalid' | 'unrecognised'

export const SCHEME_OPTIONS: readonly WebhookScheme[] = ['inherit', 'legacy', 'agent_hmac_v1']

const SCHEME_LABELS: Record<WebhookScheme, string> = {
  inherit: 'Inherit',
  legacy: 'Legacy',
  agent_hmac_v1: 'Agent HMAC v1',
}

export const SCHEME_UNRECOGNISED_PLACEHOLDER = 'Unrecognised — kept as stored'

export function schemeFrom(stored: string | null | undefined): WebhookSchemeState {
  if (stored === undefined) return 'unreported'
  if (stored === null || stored === '') return 'inherit'
  if (stored === 'legacy' || stored === 'agent_hmac_v1') return stored
  return 'unrecognised'
}

/**
 * The scheme key of the body: `undefined` means "omit it".
 *
 * A server that does not report the field gets no key at all, deletion
 * included. An unrecognised stored value is kept on an unrelated save, but a
 * deletion is not an unrelated save — it is the full reset, so it sends `null`.
 */
function schemeKeyPayload(
  scheme: WebhookSchemeState,
  clearing: boolean,
): WebhookSignatureScheme | null | undefined {
  if (scheme === 'unreported') return undefined
  if (clearing) return null
  if (scheme === 'unrecognised') return undefined
  return scheme === 'inherit' ? null : scheme
}

/**
 * The scheme the server reports as effective, or `null` when it reported none.
 * An unknown string is kept apart from absent: it raises no alarm, and it is
 * not described as either known scheme.
 */
export function effectiveSchemeFrom(config: DeviceWebhookConfig): EffectiveScheme | null {
  const value = config.effective_webhook_signature_scheme
  if (typeof value !== 'string' || value === '') return null
  if (value === 'legacy' || value === 'agent_hmac_v1' || value === 'invalid') return value
  return 'unrecognised'
}

/**
 * An option's label. Inherit names what it currently resolves to **only when
 * the device inherits**: the effective value is the device's own, so beside an
 * explicit choice it says nothing about the deployment default. `invalid` is
 * not named here — the alert says it — and neither is a value this UI does not
 * know.
 */
export function schemeOptionLabel(
  option: WebhookScheme,
  seeded: WebhookSchemeState,
  effective: EffectiveScheme | null,
): string {
  if (
    option === 'inherit' &&
    seeded === 'inherit' &&
    (effective === 'legacy' || effective === 'agent_hmac_v1')
  ) {
    return `Inherit (currently: ${effective})`
  }
  return SCHEME_LABELS[option]
}

/**
 * Is Agent HMAC v1 the contract this form would be saved under?
 *
 * Chosen explicitly, or Inherit on a device that already inherits and whose
 * server said that resolves to v1. The seed rather than the live select,
 * because the effective value describes the last saved configuration.
 */
export function v1InForce(
  form: WebhookSchemeState,
  seeded: WebhookSchemeState,
  effective: EffectiveScheme | null,
): boolean {
  if (form === 'agent_hmac_v1') return true
  return form === 'inherit' && seeded === 'inherit' && effective === 'agent_hmac_v1'
}

/**
 * The mode after a scheme change.
 *
 * **Leaving v1 lands on Signed.** Under v1 the mode is sent as `null`, so the
 * way back would otherwise seed Inherit — and with a deployment default of
 * plain, the device's 32-character HMAC key would then go out verbatim in a
 * header. The reference's own instruction for returning is an explicit signed
 * mode. Set here, visibly, where the operator can still change it.
 */
export function modeAfterSchemeChange(
  wasV1: boolean,
  isV1: boolean,
  mode: WebhookAuthMode,
): WebhookAuthMode {
  return wasV1 && !isV1 ? 'signed' : mode
}

/**
 * The two headers v1 adds beside its signature header. The signature header
 * itself is described, never spelled: `source-policy.test.ts` keeps its name
 * out of the bundle (z8pmx9mw2x), and the dialog shows it only as the server
 * reports it, in `effective_webhook_header_name`.
 */
export const AGENT_HMAC_V1_HEADERS = ['X-Agent-Timestamp', 'X-Agent-Request-Id'] as const
export const AGENT_HMAC_V1_SIGNED_STRING = 'timestamp.request_id.raw_body'
export const AGENT_HMAC_V1_SECRET_MIN = 32
/** The value the server ships as its default secret, refused as a v1 key. */
const PLACEHOLDER_SECRET = 'secret'

const AGENT_SECRET_REQUIRED = `Agent HMAC v1 needs a secret of its own for this device, at least ${AGENT_HMAC_V1_SECRET_MIN} characters long. Enter one, or choose another scheme.`
const AGENT_SECRET_PLACEHOLDER = {
  replacement:
    'This is the placeholder value the server ships with, which Agent HMAC v1 refuses. Enter a real secret.',
  stored:
    'The secret stored for this device is the placeholder value the server ships with, which Agent HMAC v1 refuses. Enter a replacement to save.',
}
const AGENT_SECRET_SHORT = {
  replacement: `An Agent HMAC v1 secret must be at least ${AGENT_HMAC_V1_SECRET_MIN} characters long, not counting spaces at either end.`,
  stored: `The secret stored for this device is shorter than the ${AGENT_HMAC_V1_SECRET_MIN} characters Agent HMAC v1 requires. Enter a replacement to save.`,
}

/**
 * Why this secret cannot be an Agent HMAC v1 key, or `null`.
 *
 * The rules the browser can check; the server's `AGENT_CALLBACK_KEY` rule it
 * cannot. The server keys the HMAC on the **trimmed** secret, so both checks
 * run on it. The placeholder check comes first, or `" secret "` would be told
 * it is too short. Length is counted in code points — the smallest of the
 * counts a server might use — so nothing passes here that a server refuses.
 * Every message is a constant: none names the secret or any part of it.
 */
export function agentSecretError(secret: string, source: 'replacement' | 'stored'): string | null {
  const key = secret.trim()
  if (key === '') return AGENT_SECRET_REQUIRED
  if (key === PLACEHOLDER_SECRET) return AGENT_SECRET_PLACEHOLDER[source]
  if ([...key].length < AGENT_HMAC_V1_SECRET_MIN) return AGENT_SECRET_SHORT[source]
  return null
}

/**
 * Inherit resolving to v1, with a secret v1 would refuse: not a refusal —
 * inheriting is the deployment's policy — but the operator is told that the
 * save leaves this device's delivery stopped.
 */
export function inheritedV1Notice(
  scheme: WebhookSchemeState,
  v1: boolean,
  replacementSecret: string,
  storedSecret: string,
): string | null {
  if (scheme !== 'inherit' || !v1) return null
  const replacing = replacementSecret !== ''
  const reason = agentSecretError(
    replacing ? replacementSecret : storedSecret,
    replacing ? 'replacement' : 'stored',
  )
  return reason === null
    ? null
    : `The server default for this device is Agent HMAC v1, so with this secret its delivery stays stopped. ${reason}`
}

export const SCHEME_INVALID_WARNING =
  'The server reports this device’s signature configuration as invalid, so no events are delivered for this device until the configuration is fixed. Someone allowed to change this webhook must correct the signature scheme or the secret.'

/**
 * The "currently sent" line: a header to name, and the sentence after it.
 *
 * One arm per thing the server can report, so the line cannot contradict the
 * alert above it: under `invalid` nothing is sent, and a scheme this UI does
 * not know is not described as one it does.
 */
export function effectiveSummary(
  auth: EffectiveAuth | null,
  scheme: EffectiveScheme | null,
): { headerName: string | null; text: string } {
  if (scheme === 'invalid') {
    return {
      headerName: null,
      text: 'Nothing is being sent for this device: the server reports its signature configuration as invalid.',
    }
  }
  if (scheme === 'unrecognised') {
    return {
      headerName: null,
      text: 'This server reports a signature scheme this dialog does not know, so what it sends is not described here.',
    }
  }
  if (auth === null) return { headerName: null, text: EFFECTIVE_UNKNOWN }
  const how =
    scheme === 'agent_hmac_v1'
      ? `signed under Agent HMAC v1 (sha256= HMAC of ${AGENT_HMAC_V1_SIGNED_STRING}, with X-Agent-Timestamp and X-Agent-Request-Id)`
      : auth.mode === 'signed'
        ? 'signed (sha256= HMAC of the body)'
        : 'plain (the secret verbatim)'
  return {
    headerName: auth.headerName,
    text: `${how}. This reflects the last saved configuration.`,
  }
}

/*
 * ---------------------------------------------------------------------------
 * Switching scheme: confirmed before it goes live (z8pmx9pyrj).
 *
 * A scheme change applies to the next event after the save. The backend has no
 * grace window and cannot send both schemes, so a receiver not yet verifying
 * the new one fails every delivery from that moment. The confirmation is owed
 * when the scheme deliveries are *signed under* changes — not when the select
 * merely moves — and when the dialog cannot tell, it asks with "may".
 * ---------------------------------------------------------------------------
 */

export type ResolvedScheme = 'legacy' | 'agent_hmac_v1'

/** Either end is `null` when this dialog cannot see which scheme it is. */
export interface SchemeSwitch {
  from: ResolvedScheme | null
  to: ResolvedScheme | null
}

/**
 * The scheme a form state is signed under. Inherit resolves only on a device
 * that already inherits, by the rule `schemeOptionLabel` and `v1InForce` use:
 * beside an explicit choice the effective value is the device's own.
 */
function resolvedScheme(
  form: WebhookSchemeState,
  seeded: WebhookSchemeState,
  effective: EffectiveScheme | null,
): ResolvedScheme | null {
  if (form === 'legacy' || form === 'agent_hmac_v1') return form
  if (form === 'inherit' && seeded === 'inherit') {
    if (effective === 'legacy' || effective === 'agent_hmac_v1') return effective
  }
  return null
}

/**
 * The switch this save would make, or `null` when no confirmation is owed.
 *
 * None for a deletion (it has its own confirmation), for a server that does
 * not report the field, for an unrecognised value the save leaves alone, for a
 * select that was not moved, and for a move between two options that resolve
 * to the same scheme. An end that cannot be resolved is kept as `null` and
 * confirmed — skipping it would fail open on the case the operator cannot see.
 */
export function schemeSwitchFrom(fields: {
  url: string
  scheme: WebhookSchemeState
  seeded: WebhookSchemeState
  effective: EffectiveScheme | null
}): SchemeSwitch | null {
  const { scheme, seeded, effective } = fields
  if (webhookSaveEffect(fields.url) === 'clear') return null
  if (scheme === 'unreported' || scheme === 'unrecognised' || scheme === seeded) return null
  const from = resolvedScheme(seeded, seeded, effective)
  const to = resolvedScheme(scheme, seeded, effective)
  return from !== null && from === to ? null : { from, to }
}

const SWITCH_IMMEDIATE =
  'The change takes effect on the next event after you save. There is no grace period, and the server cannot send both schemes at once.'
const SWITCH_ONE_SCHEME =
  'A receiver must accept only one scheme per endpoint: one that also accepts the other can be downgraded by anyone able to send it a request signed the weaker way.'
const SWITCH_FROM_UNKNOWN =
  'The scheme this device uses today is not visible here, so this may or may not change what the receiver gets.'
const SWITCH_TO_V1 = `Your receiver must already verify all three Agent HMAC v1 headers — the signature header, ${AGENT_HMAC_V1_HEADERS.join(' and ')} — with the HMAC computed over ${AGENT_HMAC_V1_SIGNED_STRING}. If it does not, every delivery from that moment fails.`
const SWITCH_TO_LEGACY =
  'Your receiver must already accept Legacy deliveries — the header and mode below — and stop requiring the Agent HMAC v1 headers. Legacy has no replay protection: a captured request can be sent again and still verifies.'
const SWITCH_TO_UNKNOWN =
  'Inherit follows the deployment’s default scheme, which this dialog cannot see until the change is saved — so the scheme deliveries are signed under may change on the next event. Make sure the receiver is ready for whichever it is.'

export interface SchemeSwitchCopy {
  title: string
  lines: string[]
  action: string
}

/**
 * What the confirmation says, for one direction. `warning` is the verbatim
 * warning for a Legacy or unresolved target, the exposed-secret warning for a
 * v1 target, and is appended last so it is the line read just before Confirm.
 */
export function schemeSwitchConfirmation(
  change: SchemeSwitch,
  warning: string | null,
): SchemeSwitchCopy {
  const from = change.from === null ? [SWITCH_FROM_UNKNOWN] : []
  const tail = [SWITCH_IMMEDIATE, SWITCH_ONE_SCHEME, ...(warning === null ? [] : [warning])]
  if (change.to === 'agent_hmac_v1') {
    return {
      title: 'Switch this device to Agent HMAC v1?',
      lines: [SWITCH_TO_V1, ...from, ...tail],
      action: 'Switch to Agent HMAC v1 and save',
    }
  }
  if (change.to === 'legacy') {
    return {
      title: 'Switch this device to Legacy?',
      lines: [SWITCH_TO_LEGACY, ...from, ...tail],
      action: 'Switch to Legacy and save',
    }
  }
  return {
    title: 'Change this device’s signature scheme?',
    lines: [SWITCH_TO_UNKNOWN, ...tail],
    action: 'Change the scheme and save',
  }
}

const EXPOSED_SECRET =
  'The secret stored for this device is sent verbatim under its current mode, so anyone who saw one of those deliveries holds it — and under Agent HMAC v1 it would be the signing key. Enter a new secret before switching, and give it to the receiver.'

/**
 * A switch to v1 keeping a key that has already travelled as a header value.
 * v1's signature proves nothing when whoever saw one legacy delivery holds the
 * key, so the confirmation asks for a new secret. Not a refusal: rotating may
 * have to be coordinated with the receiver. Booleans only — no secret enters.
 */
export function exposedSecretWarning(fields: {
  to: ResolvedScheme | null
  seededSign: WebhookSign
  seededV1: boolean
  effective: EffectiveAuth | null
  replacing: boolean
  hasStoredSecret: boolean
}): string | null {
  if (fields.to !== 'agent_hmac_v1' || fields.replacing || !fields.hasStoredSecret) return null
  if (fields.seededSign === false) return EXPOSED_SECRET
  const inheritedPlain =
    fields.seededSign === null && !fields.seededV1 && fields.effective?.mode === 'plain'
  return inheritedPlain ? EXPOSED_SECRET : null
}

/*
 * ---------------------------------------------------------------------------
 * Events: a fixed catalogue, and the stored names it does not know.
 * ---------------------------------------------------------------------------
 */

export const WEBHOOK_EVENTS = [
  { name: 'message', description: 'Text, media, contacts and locations' },
  { name: 'message.reaction', description: 'Emoji reactions' },
  { name: 'message.revoked', description: 'Deleted for everyone' },
  { name: 'message.edited', description: 'Edited messages' },
  { name: 'message.ack', description: 'Delivery and read receipts' },
  { name: 'message.deleted', description: 'Deleted for me' },
  { name: 'chat_presence', description: 'Typing and recording' },
  { name: 'group.participants', description: 'Members joined, left or promoted' },
  { name: 'group.joined', description: 'Added to a group' },
  { name: 'label.edit', description: 'Label edited' },
  { name: 'label.association', description: 'Label added to or removed from a chat' },
  { name: 'newsletter.joined', description: 'Channel subscribed' },
  { name: 'newsletter.left', description: 'Channel unsubscribed' },
  { name: 'newsletter.message', description: 'New channel message' },
  { name: 'newsletter.mute', description: 'Channel mute changed' },
  { name: 'call.offer', description: 'Incoming call' },
] as const

const CATALOGUE = new Map(WEBHOOK_EVENTS.map((event) => [event.name.toLowerCase(), event.name]))

/**
 * Split a stored event list into catalogue names and names the catalogue does
 * not know.
 *
 * Matching is case-insensitive with surrounding whitespace ignored, as the
 * server matches. **Unknown names are kept, never dropped**: they may be events
 * a newer server added, and dropping them on an unrelated save would silently
 * narrow what the receiver gets. Empty segments and case-insensitive duplicates
 * are removed — a normalisation the server cannot tell apart.
 */
export function parseWebhookEvents(stored: string): { selected: string[]; unknown: string[] } {
  const selected: string[] = []
  const unknown: string[] = []
  const seen = new Set<string>()
  for (const raw of stored.split(',')) {
    const name = raw.trim()
    const key = name.toLowerCase()
    if (name === '' || seen.has(key)) continue
    seen.add(key)
    const known = CATALOGUE.get(key)
    if (known) selected.push(known)
    else unknown.push(name)
  }
  return { selected, unknown }
}

/** Catalogue names in catalogue order, then the kept unknown names. `""` is "all events". */
export function serializeWebhookEvents(
  selected: readonly string[],
  unknown: readonly string[],
): string {
  const chosen = new Set(selected)
  return [
    ...WEBHOOK_EVENTS.map((event) => event.name).filter((name) => chosen.has(name)),
    ...unknown,
  ].join(',')
}

/*
 * ---------------------------------------------------------------------------
 * The seed: what the form was filled from, and whether a later read differs.
 *
 * The dialog fills its form once per open. A later read — the dialog's own
 * delivery toggle, or another operator's save broadcast over the WebSocket —
 * must neither overwrite an edit in progress nor raise an alarm about a change
 * that touched nothing on the form. So the comparison covers the seven
 * configuration fields and nothing else: `webhook_enabled` and `effective_*`
 * are not on the form.
 * ---------------------------------------------------------------------------
 */

export interface WebhookFields {
  url: string
  secret: string
  events: string
  insecureSkipVerify: boolean
  headerName: string
  sign: WebhookSign
  scheme: WebhookSchemeState
}

export function webhookFieldsFrom(config: DeviceWebhookConfig): WebhookFields {
  return {
    url: config.webhook_url,
    secret: config.webhook_secret,
    events: config.webhook_events,
    insecureSkipVerify: config.webhook_insecure_skip_verify,
    headerName: headerNameFrom(config.webhook_header_name),
    sign: config.webhook_sign ?? null,
    scheme: schemeFrom(config.webhook_signature_scheme),
  }
}

/** Do two reads differ on anything the form shows? The secret included. */
export function webhookFieldsDiffer(a: WebhookFields, b: WebhookFields): boolean {
  return (
    a.url !== b.url ||
    a.secret !== b.secret ||
    serializeWebhookEvents(...eventsOf(a.events)) !==
      serializeWebhookEvents(...eventsOf(b.events)) ||
    a.insecureSkipVerify !== b.insecureSkipVerify ||
    a.headerName.trim() !== b.headerName.trim() ||
    a.sign !== b.sign ||
    a.scheme !== b.scheme
  )
}

function eventsOf(stored: string): [string[], string[]] {
  const { selected, unknown } = parseWebhookEvents(stored)
  return [selected, unknown]
}

/**
 * Has the operator changed anything since the form was seeded?
 *
 * A replacement secret being typed counts as an edit; the stored secret is not
 * on the form and cannot be edited.
 */
export function webhookFormEdited(
  seed: WebhookFields,
  form: Omit<WebhookFields, 'secret' | 'sign'> & {
    replacementSecret: string
    mode: WebhookAuthMode
  },
): boolean {
  return (
    form.replacementSecret !== '' ||
    webhookFieldsDiffer(seed, {
      url: form.url,
      secret: seed.secret,
      events: form.events,
      insecureSkipVerify: form.insecureSkipVerify,
      headerName: form.headerName,
      sign: signFrom(form.mode),
      scheme: form.scheme,
    })
  )
}

/**
 * Every reason the form may not be saved, as one value the dialog renders and
 * the submit handler reads — so the message shown and the request refused
 * cannot disagree.
 *
 * The confirmed deletion (an empty URL) is checked against nothing: it sends
 * no credential configuration worth validating, and blocking it on a header the
 * deletion is about to reset would make the destructive path the only one that
 * cannot be completed.
 *
 * With Agent HMAC v1 in force the header name and mode are hidden and sent as
 * their reset value, so neither is validated — an error the operator cannot see
 * must not block the save. The secret's format rule still runs first; the v1
 * key rules **block** only when v1 was chosen explicitly. An inherited v1 is the
 * deployment's policy, and `inheritedV1Notice` says what it costs instead.
 */
export function webhookFormErrors(fields: {
  url: string
  headerName: string
  mode: WebhookAuthMode
  scheme: WebhookSchemeState
  v1: boolean
  replacementSecret: string
  storedSecret: string
}): { headerName: string | null; secret: string | null; auth: string | null } {
  if (webhookSaveEffect(fields.url) === 'clear') {
    return { headerName: null, secret: null, auth: null }
  }
  const replacing = fields.replacementSecret !== ''
  const secretToSend = replacing ? fields.replacementSecret : fields.storedSecret
  const source = replacing ? 'replacement' : 'stored'
  const format = secretError(secretToSend, source)
  if (fields.v1) {
    return {
      headerName: null,
      secret:
        format ??
        (fields.scheme === 'agent_hmac_v1' ? agentSecretError(secretToSend, source) : null),
      auth: null,
    }
  }
  return {
    headerName: headerNameError(fields.headerName),
    secret: format,
    auth: authSecretError(fields.mode, secretToSend),
  }
}

/*
 * ---------------------------------------------------------------------------
 * Server rejections, per field (z8pmx9pyrj).
 *
 * A `400` from this save names the field it rejects, in a fixed catalogue
 * (reference §11). Its text is still never rendered — this request carried the
 * secret — so a **known** message is answered with this module's own sentence
 * under the field it names, and everything else keeps the redacted sentence.
 * ---------------------------------------------------------------------------
 */

export type WebhookField = 'url' | 'secret' | 'scheme' | 'sign' | 'headerName'

export interface WebhookRejection {
  field: WebhookField
  text: string
}

const SCHEME_NOT_ACCEPTED =
  'The server did not accept this signature scheme. Choose Inherit, Legacy or Agent HMAC v1, and save again.'

/**
 * The catalogue, as exact prefixes. Case-sensitive and untrimmed: it is the
 * server's fixed text, and a looser match is how a message meant for one field
 * lands under another. The callback-key row stops before the server's
 * environment-variable name, which this bundle does not spell.
 */
const REJECTIONS: readonly { prefix: string; field: WebhookField; text: string }[] = [
  {
    prefix: 'webhook_url is required',
    field: 'url',
    text: 'The server did not receive a webhook URL. Enter the URL to deliver this device’s events to, and save again.',
  },
  {
    prefix: 'webhook_signature_scheme must be one of',
    field: 'scheme',
    text: SCHEME_NOT_ACCEPTED,
  },
  {
    prefix: 'webhook_signature_scheme must be a string or null',
    field: 'scheme',
    text: SCHEME_NOT_ACCEPTED,
  },
  {
    prefix: 'webhook_signature_scheme agent_hmac_v1 requires a webhook_secret',
    field: 'secret',
    text: AGENT_SECRET_REQUIRED,
  },
  {
    prefix: 'webhook_secret: an agent_hmac_v1 key must be at least 32 characters',
    field: 'secret',
    text: `The server refused this secret: an Agent HMAC v1 key must be at least ${AGENT_HMAC_V1_SECRET_MIN} characters, not counting spaces at either end. Enter a new, longer secret.`,
  },
  {
    prefix: 'webhook_secret: an agent_hmac_v1 key may not be the shipped placeholder',
    field: 'secret',
    text: 'The server refused this secret: it is the placeholder value the server ships with. Enter a new secret.',
  },
  {
    prefix: 'webhook_secret: an agent_hmac_v1 key may not equal an ',
    field: 'secret',
    text: 'The server refused this secret because it is already in use as a key for calls into this server. A delivery secret must be unique — enter a new one for this device.',
  },
  {
    prefix: 'webhook_signature_scheme agent_hmac_v1 cannot be combined with webhook_sign=false',
    field: 'sign',
    text: 'The server applies Agent HMAC v1 to this device, which cannot be combined with Plain. Choose Signed or Inherit, and save again.',
  },
  {
    prefix: 'webhook_sign must be true, false or null',
    field: 'sign',
    text: 'The server did not accept this mode. Choose Inherit, Signed or Plain, and save again.',
  },
  {
    prefix: 'webhook_sign requires a non-empty webhook_secret',
    field: 'secret',
    text: SIGNED_NEEDS_SECRET,
  },
  {
    prefix: 'webhook_secret must be at most 4096 characters',
    field: 'secret',
    text: `The server refused this secret: a secret may be at most ${SECRET_MAX} characters.`,
  },
  {
    prefix: 'webhook_secret must not contain control characters',
    field: 'secret',
    text: 'The server refused this secret: it must contain no control characters, such as line breaks.',
  },
  {
    prefix: 'webhook_header_name must be at most 128 characters',
    field: 'headerName',
    text: `The server refused this header name: it may be at most ${HEADER_NAME_MAX} characters.`,
  },
  {
    prefix: 'webhook_header_name must be a valid HTTP header field name',
    field: 'headerName',
    text: "The server refused this header name: it may contain only ASCII letters, digits and ! # $ % & ' * + - . ^ _ ` | ~.",
  },
  {
    prefix: 'webhook_header_name may not be "',
    field: 'headerName',
    text: 'The server refused this header name: it is set by the transport itself and cannot carry the credential. Choose another.',
  },
]

/**
 * The field a failed save names, and this module's sentence for it — or `null`
 * for anything that is not a known `400 BAD_REQUEST`, which then keeps
 * `webhookSaveFailure`'s redaction.
 *
 * Reads the HTTP status and the body `code` only; a body `status` is never
 * consulted (reference §5.2). The server's message is only ever an argument to
 * `startsWith`: what is returned is a constant from the table above. The type
 * checks keep a malformed body from throwing inside a mutation's `onError`.
 */
export function webhookRejectionFrom(error: unknown): WebhookRejection | null {
  const { status, code, message } = toApiError(error)
  if (typeof code !== 'string' || typeof message !== 'string') return null
  if (status !== 400 || code !== 'BAD_REQUEST') return null
  const hit = REJECTIONS.find((entry) => message.startsWith(entry.prefix))
  return hit ? { field: hit.field, text: hit.text } : null
}

/**
 * Where a rejection is shown: under its field, or beside Save when that field
 * is not on screen — the mode and header are not rendered under v1, and the
 * scheme is not rendered for a server that does not report it.
 */
export function rejectionShownAt(
  field: WebhookField,
  form: { v1: boolean; schemeShown: boolean },
): WebhookField | 'form' {
  if ((field === 'headerName' || field === 'sign') && form.v1) return 'form'
  if (field === 'scheme' && !form.schemeShown) return 'form'
  return field
}

const WEBHOOK_FIELD_LABELS: Record<WebhookField, string> = {
  url: 'Webhook URL',
  secret: 'Secret',
  scheme: 'Signature scheme',
  sign: 'Mode',
  headerName: 'Header name',
}

/** The line beside Save when the sentence itself is under a field. */
export function rejectionPointer(field: WebhookField): string {
  return `The webhook was not saved — see the message under “${WEBHOOK_FIELD_LABELS[field]}”.`
}

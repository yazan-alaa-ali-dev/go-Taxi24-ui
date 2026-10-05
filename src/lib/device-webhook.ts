import type { DeviceWebhookConfig, UpdateDeviceWebhookPayload, WebhookSign } from '@/api/devices'
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
 */
export function webhookPayloadFrom(fields: {
  url: string
  secret: string
  events: string
  insecureSkipVerify: boolean
  headerName: string
  mode: WebhookAuthMode
}): UpdateDeviceWebhookPayload {
  const clearing = webhookSaveEffect(fields.url) === 'clear'
  return {
    webhook_url: fields.url.trim(),
    webhook_secret: fields.secret,
    webhook_events: fields.events.trim(),
    webhook_insecure_skip_verify: fields.insecureSkipVerify,
    webhook_header_name: clearing ? null : headerNamePayload(fields.headerName),
    webhook_sign: clearing ? null : signFrom(fields.mode),
  }
}

/** The sentence a failed save gets when the server's own text may not be shown. */
export const WEBHOOK_SAVE_FAILED_REDACTED =
  'The webhook was not saved. The server’s reason is not shown here because this request carried the signing secret, and a rejection can quote the field it rejected. Check the URL, the header name and the event list and try again.'

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
  if (mode === 'signed') {
    return 'Signed delivery needs a secret for this device. Enter one, or choose Inherit.'
  }
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

/**
 * Inherit, resolving to plain, with no device secret: the deployment-wide
 * secret goes out verbatim to this URL. Not a refusal — inheriting is the
 * deployment's policy — but the operator is told before they rely on it.
 */
export function inheritedPlainWarning(
  mode: WebhookAuthMode,
  effective: EffectiveAuth | null,
  secretToSend: string,
): string | null {
  if (mode !== 'inherit' || effective?.mode !== 'plain' || secretToSend !== '') return null
  return 'The server default for this device is plain, and this device has no secret of its own — so the deployment-wide secret is sent verbatim to this URL. Set a secret for this device, or choose Signed.'
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
 * that touched nothing on the form. So the comparison covers the six
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
}

export function webhookFieldsFrom(config: DeviceWebhookConfig): WebhookFields {
  return {
    url: config.webhook_url,
    secret: config.webhook_secret,
    events: config.webhook_events,
    insecureSkipVerify: config.webhook_insecure_skip_verify,
    headerName: headerNameFrom(config.webhook_header_name),
    sign: config.webhook_sign ?? null,
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
    a.sign !== b.sign
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
 */
export function webhookFormErrors(fields: {
  url: string
  headerName: string
  mode: WebhookAuthMode
  replacementSecret: string
  storedSecret: string
}): { headerName: string | null; secret: string | null; auth: string | null } {
  if (webhookSaveEffect(fields.url) === 'clear') {
    return { headerName: null, secret: null, auth: null }
  }
  const replacing = fields.replacementSecret !== ''
  const secretToSend = replacing ? fields.replacementSecret : fields.storedSecret
  return {
    headerName: headerNameError(fields.headerName),
    secret: secretError(secretToSend, replacing ? 'replacement' : 'stored'),
    auth: authSecretError(fields.mode, secretToSend),
  }
}

---
ticket: z8pmx9pyre
stage: spec
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyre"
  github: ""
---

# Specification — Device webhook: choose the signature scheme and see the effective scheme

## Business goal

The backend added a per-device `webhook_signature_scheme`
(`docs/webhook-signature-agent-hmac-v1.html`, backend ticket z8pmx9p93v). Under
`agent_hmac_v1` every delivery carries three fixed headers — `X-Agent-Signature`,
`X-Agent-Timestamp`, `X-Agent-Request-Id` — and the HMAC-SHA256 covers
`timestamp.request_id.raw_body`. That gives the receiver replay protection that
`legacy` (an HMAC of the body only, or the secret sent verbatim) does not.

The webhook dialog knows only the legacy controls. An operator cannot move a
receiver to the replay-protected scheme, and cannot see the server's
`effective_webhook_signature_scheme` — including the `invalid` value, which
means **every delivery for that device is stopped**. Today that state is
invisible: the dialog looks healthy while the customer's receiver gets nothing.

## User story

As an operator managing a WhatsApp number, I want to choose the webhook
signature scheme for each device and see the scheme the server will actually
use, so that I can move a receiver to replay-protected signatures
(`agent_hmac_v1`) and immediately notice when a device's delivery is stopped by
an invalid configuration.

## Functional requirements

- **REQ-1** — The webhook read model carries `webhook_signature_scheme` (stored;
  `""`/`null` = inherit) and `effective_webhook_signature_scheme` (`GET` only),
  each tolerated as absent. The update payload accepts `webhook_signature_scheme`
  as `"legacy" | "agent_hmac_v1" | null`.
- **REQ-2** — The dialog offers a closed **Signature scheme** choice of exactly
  three options: Inherit / Legacy / Agent HMAC v1.
- **REQ-3** — The Inherit option names the scheme the server reports as
  effective, but only when that report actually describes the inherited value.
- **REQ-4** — When the server reports the effective scheme as `invalid`, the
  dialog shows a red, non-dismissible warning that no events are delivered for
  this device until the configuration is fixed.
- **REQ-5** — Under Agent HMAC v1, the controls the server ignores (auth mode,
  header name) are hidden, and the fixed wire contract is shown read-only.
- **REQ-6** — Under Agent HMAC v1, the client mirrors the server's secret rules
  that are checkable in a browser (non-empty, trimmed length ≥ 32, not the
  placeholder `secret`) and blocks the save when they fail.
- **REQ-7** — The save body states the scheme explicitly, keeps the existing
  "all keys, always" rule, never sends `webhook_sign: false` under v1, and resets
  the scheme together with the other authentication keys on a deletion.
- **REQ-8** — The scheme takes part in edit detection and in the
  changed-elsewhere seed comparison.
- **REQ-9** — A server that predates the field behaves exactly as today.

## Non-functional requirements and constraints

- **NFR-1** — No regression of the existing webhook safeguards: the delivery
  switch stays separate from Save; the empty-URL deletion warning and its
  confirmation remain; the stored secret is never rendered; secret-carrying
  failures are redacted; the changed-elsewhere hold remains.
- **NFR-2** — No validation message quotes the secret or any part of it.
- **NFR-3** — Every decision is a pure, unit-tested function; the component binds
  state to those functions (the repository has no DOM renderer in its tests —
  markup questions are answered through `react-dom/server`).
- **NFR-4** — No new request, no polling, no new dependency, no deployment
  runtime file change.
- **NFR-5** — `typecheck`, `lint` and `test` pass (`ui-source` profile).

## Acceptance criteria

- **AC-1** (REQ-1, REQ-2) — On open, the stored scheme is shown: `""` / `null` →
  Inherit, `"legacy"` → Legacy, `"agent_hmac_v1"` → Agent HMAC v1.
- **AC-2** (REQ-3) — When the stored scheme is inherit and the server reports an
  effective scheme, the Inherit option reads `Inherit (currently: <effective>)`,
  e.g. `Inherit (currently: legacy)`. When the server does not report it — or the
  stored scheme is explicit, so the effective value describes the device's own
  choice rather than the inherited default — or the effective value is `invalid`
  or unrecognised, the option reads `Inherit` with no guessed value.
- **AC-3** (REQ-4) — When `effective_webhook_signature_scheme` is `invalid`, a red
  warning with `role="alert"` states that no events are delivered for this device
  until the configuration is fixed. It has no dismiss control and is shown to a
  read-only viewer too; its wording does not assume the reader can edit. Any
  other value, or none, shows no such warning.
- **AC-4** (REQ-5) — With Agent HMAC v1 in force — selected, or Inherit on a
  device that inherits and whose effective scheme is `agent_hmac_v1` — the auth-mode and header-name
  controls are not rendered, and the dialog shows the three fixed headers — the
  signature header described by function, `X-Agent-Timestamp` and
  `X-Agent-Request-Id` by name — and the signed string
  `timestamp.request_id.raw_body`. The signature header's *name* is never spelled
  in source: the absolute `z8pmx9mw2x` rule keeps it out of the bundle (owner
  decision, 2026-10-29); the dialog shows it only as the server reports it in
  `effective_webhook_header_name`. Otherwise the legacy controls render
  as before and the v1 description does not.
- **AC-5** (REQ-6, NFR-2) — With Agent HMAC v1 selected, the save is blocked with
  an inline message under the secret when the secret to be sent (replacement,
  else stored) is empty, equals `secret` after trimming, or has a trimmed length
  below 32 counted in Unicode code points. The placeholder message wins over the length message. No message
  quotes the secret; for a stored secret the message asks for a replacement.
- **AC-6** (REQ-5) — Under Agent HMAC v1 a header-name value the form still holds
  never blocks the save (the field is hidden and the server ignores it).
- **AC-7** (REQ-7) — Every non-clearing save to a server that reports the field
  sends `webhook_signature_scheme` explicitly: `"legacy"`, `"agent_hmac_v1"`, or
  `null` for Inherit, together with the four replace-group fields.
- **AC-8** (REQ-7) — Under Agent HMAC v1 the body sends `webhook_sign: null` and
  `webhook_header_name: null` — never `false`, and never a value from a hidden
  control.
- **AC-9** (REQ-7) — Saving an empty URL (the confirmed deletion) sends
  `webhook_signature_scheme: null` along with the other reset authentication keys
  (also when the stored value was unrecognised), and is not blocked by the v1
  secret rules. A server that does not report the field gets no scheme key.
- **AC-10** (REQ-1, NFR-1) — After a successful save the device's webhook query is
  invalidated, so the effective scheme, header and sign shown are re-read from the
  server (the `PATCH` response carries no `effective_*`).
- **AC-11** (REQ-8) — Changing only the scheme marks the form as edited; a re-read
  that changes only the stored scheme is detected by the seed comparison (re-seeded
  silently when unedited, the changed-elsewhere hold when edited).
- **AC-12** (REQ-9) — A server that omits `webhook_signature_scheme` behaves
  exactly as today: no scheme control, no warning, the legacy controls visible,
  and a save body with exactly the six keys it has today.
- **AC-13** (REQ-1) — A stored scheme value this UI does not recognise is never
  overwritten by an unrelated save: the scheme key is omitted (absent-preserving)
  until the operator explicitly chooses one of the three options.
- **AC-14** (REQ-5) — The "currently sent" summary describes Agent HMAC v1 as an
  HMAC of `timestamp.request_id.raw_body` when the server reports that effective
  scheme, rather than as an HMAC of the body. For `invalid` it says nothing is
  being sent; for an unrecognised value it says the scheme is not known here and
  describes nothing.
- **AC-15** (REQ-7, NFR-1) — When a scheme change takes Agent HMAC v1 out of
  force (to Legacy, or to an Inherit not known to resolve to v1), the
  authentication mode is set to Signed, visibly, so leaving v1 never silently
  lands on an inherited or stored plain mode that would send the key verbatim.
- **AC-16** (REQ-6) — Under an inherited Agent HMAC v1 (AC-4's second arm) the v1
  secret rules are shown as a non-blocking notice: inheriting is the deployment's
  policy, but the operator is told the save would leave delivery stopped.

## Test cases

- **TC-1** (AC-1) — `schemeFrom`: `""`, `null` → inherit; `legacy`;
  `agent_hmac_v1`; absent → unreported; `agent_hmac_v2` → unrecognised.
- **TC-2** (AC-2) — the Inherit label with stored inherit + effective `legacy` →
  `Inherit (currently: legacy)`; effective absent, `invalid` or unrecognised →
  `Inherit`; stored `agent_hmac_v1` + effective `agent_hmac_v1` → `Inherit`.
- **TC-3** (AC-3) — `effectiveSchemeFrom`: the three documented values are read;
  absent and an unknown string → `null`; the warning renders for `invalid` with
  `role="alert"` and no `<button`, and renders nothing for `legacy`.
- **TC-4** (AC-4) — rendered authentication section under v1 has no
  `device-webhook-mode` / `device-webhook-header` ids and contains
  `X-Agent-Timestamp`, `X-Agent-Request-Id`, a signature-header line and the
  signed string; under legacy it is the reverse.
- **TC-5** (AC-5) — v1 + 31 characters → length message; 32 characters inside
  surrounding spaces → valid only if 32 remain after trim; `" secret "` →
  placeholder message; empty → secret-required message; a stored short secret →
  asks for a replacement; 31 astral characters (62 UTF-16 units) → length
  message; no message contains any 4-character substring of the secret.
- **TC-6** (AC-6) — v1 + an invalid header name in the form → no header error.
- **TC-7** (AC-7, AC-8) — payload for Inherit / Legacy / v1: the key is present
  every time, `null` for Inherit; under v1 `webhook_sign` and
  `webhook_header_name` are `null` whatever the form held.
- **TC-8** (AC-9) — empty-URL payload with v1 selected → `webhook_signature_scheme:
  null`; v1 secret rules return no error.
- **TC-9** (AC-10) — source rule: the save mutation's `onSuccess` invalidates
  `deviceWebhookKey(deviceId)`.
- **TC-10** (AC-11, AC-12, AC-13) — the seed comparator sees a scheme-only
  difference; `webhookFormEdited` sees a scheme-only edit; an unreported or
  unrecognised scheme omits the key and yields today's six keys; the
  authentication section renders no scheme control when unreported.
- **TC-11** (AC-14) — the effective summary for effective v1 names
  `timestamp.request_id.raw_body`; `invalid` says nothing is sent; unrecognised
  describes nothing; legacy signed and plain are unchanged.
- **TC-12** (AC-15) — leaving v1 for Legacy or a non-v1 Inherit with mode
  inherit/plain → signed; staying in v1, or changing between non-v1 schemes →
  mode unchanged.
- **TC-13** (AC-4, AC-16) — stored inherit + effective v1 + form Inherit → v1 in
  force, legacy controls hidden, a short secret yields a notice and no blocking
  error; the same with form Legacy → not in force.

## Out of scope

- Generating or copying a secret, and a secret length counter (ticket 16).
- A confirmation before switching scheme, and mapping a server `400` message to
  the field it names (ticket 17).
- `POST /devices` webhook fields — the create dialog intentionally has none.
- Receiver-side verification code.
- Backend behaviour, the `AGENT_CALLBACK_KEY` equality rule (server-only), and
  deployment runtime files.

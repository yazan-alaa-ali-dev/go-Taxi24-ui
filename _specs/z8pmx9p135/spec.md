---
ticket: z8pmx9p135
stage: spec
mode: standard
status: complete
owner: developer
updated: 2026-10-05
links:
  clickup: "https://app.clickup.com/t/z8pmx9p135"
  github: ""
---

# Specification — Device webhook: authentication mode, custom header, effective values and events picker

## Business goal

The backend extended the per-device webhook contract
(`docs/device-webhook-frontend-guide.md`). A device's webhook can now choose
**how** it authenticates to its receiver — an HMAC signature (`signed`), the
secret sent verbatim (`plain`), or the server default (`inherit`) — and **which
HTTP header** carries that credential. The server also reports the *effective*
values it will actually use after inheritance.

The dashboard exposes none of this. An operator who must connect a number to a
partner that verifies `X-Hub-Signature-256`, or to an AI agent that expects a
static token in `X-Agent-Signature`, cannot do it from the UI, and cannot see
what the server will send, because the server defaults live in a `.env` the
operator never sees.

The `PATCH` contract is also **mixed**: four fields are *replace* (omitted =
cleared) and the two new ones are *absent-preserving* (omitted = unchanged,
explicit `null` = reset to inherit). A UI that sends a partial body silently
destroys configuration; a UI that omits the new fields cannot ever reset them.

## User story

As an operator managing a WhatsApp number, I want to choose how the number's
webhook authenticates (signed, plain, or inherit the server default) and which
header carries the credential, and see the effective values the server will
use, so that I can connect each number to its receiver with that receiver's
exact authentication requirements — without losing any stored configuration.

## Functional requirements

- **REQ-1** — The webhook read model carries `webhook_header_name`,
  `webhook_sign`, `effective_webhook_header_name` and `effective_webhook_sign`,
  each tolerated as absent (a deployment predating the contract omits them).
- **REQ-2** — The dialog shows an authentication-mode control with exactly
  three choices — Inherit (default) / Signed (HMAC) / Plain secret — mapped to
  `null` / `true` / `false`.
- **REQ-3** — The dialog shows a header-name field; empty means inherit.
- **REQ-4** — The dialog shows, read-only, the effective header name and the
  effective mode the server reported, and says so when the server reported none.
- **REQ-5** — Every save sends all six configuration fields explicitly, so the
  stored configuration equals what the operator sees after the save.
- **REQ-6** — Client-side validation mirrors the documented server rules for
  the header name, the new secret, and the signed-requires-secret rule, and
  blocks the request when it fails.
- **REQ-7** — Choosing Plain shows a security warning.
- **REQ-8** — Events are picked from the documented catalogue rather than typed;
  values stored that the catalogue does not know are preserved, not dropped.
- **REQ-9** — The UI reacts to `DEVICE_WEBHOOK_CONFIG_UPDATED` by refreshing
  that device's cached webhook configuration, without discarding an operator's
  unsaved edits.
- **REQ-10** — The create-device request type accepts the two new fields.
- **REQ-11** — Copy that is no longer true under the new contract (the secret
  "signs payloads (X-Hub-Signature-256)", "no secret means not signed") is
  corrected.

## Non-functional requirements and constraints

- **NFR-1** — No regression of the existing webhook safeguards: the enabled
  switch stays separate from Save; the empty-URL deletion warning and its
  confirmation step remain; the stored secret is never rendered.
- **NFR-2** — No regression of error redaction: a failed save whose request
  carried a secret never renders server text.
- **NFR-3** — Every decision is a pure, unit-tested function (the repository has
  no DOM renderer in its tests); components only bind state to those functions.
- **NFR-4** — No new dependency; no deployment runtime file changes.
- **NFR-5** — `typecheck`, `lint` and `test` pass (`ui-source` profile).

## Acceptance criteria

- **AC-1** (REQ-1, REQ-2, REQ-3) — On open, the stored `webhook_sign` is shown as
  Inherit for `null`/absent, Signed for `true`, Plain for `false`; the header
  field is empty for `""`/`null`/absent and shows the stored name otherwise.
- **AC-2** (REQ-4) — The effective header name and effective mode are shown
  read-only next to the controls; when the server did not report them, the
  dialog says the effective value is unknown rather than guessing a default.
- **AC-3** (REQ-5) — A save body always contains all six keys: `webhook_url`,
  `webhook_secret` (the stored value round-tripped unless replaced),
  `webhook_events`, `webhook_insecure_skip_verify`, `webhook_header_name`
  (`null` when the field is blank) and `webhook_sign` (`null` for Inherit).
- **AC-4** (REQ-6) — With Signed **or Plain** selected and no secret that would
  be sent (no stored secret and no replacement), the form shows an inline error
  and sends nothing. (Plain with an empty device secret would make the server
  send the deployment-wide secret verbatim to this device's URL.)
- **AC-5** (REQ-6) — The header name is validated before submit: at most 128
  characters; RFC 7230 token characters only; `Content-Type`, `Content-Length`,
  `Host`, `Connection`, `Transfer-Encoding` refused case-insensitively;
  `Authorization` accepted. A failure shows inline and sends nothing.
- **AC-6** (REQ-6) — The secret that would be sent (replacement, else stored) is
  validated before submit: at most 4096 characters and no control characters.
  A failure shows inline and sends nothing; the error text never quotes the
  secret, and for a stored secret it asks for a replacement.
- **AC-7** (REQ-7) — Plain shows a warning that the secret (including the one
  already stored) travels verbatim with every event; with a non-https URL the
  warning states the secret then travels in clear text. Absent for Signed and
  Inherit.
- **AC-8** (REQ-8) — Events are a list of the 16 documented events; stored
  values are pre-selected case-insensitively with whitespace trimmed; the body
  carries a comma-separated string in catalogue order; no selection sends `""`
  (all events); stored names outside the catalogue are listed as kept and are
  sent back unchanged.
- **AC-9** (REQ-9) — `DEVICE_WEBHOOK_CONFIG_UPDATED` with a `device_id`
  invalidates that device's webhook query (only `device_id` is read from the
  event). The form is seeded once per open, after the open's first fetch
  settles. A later read whose six configuration fields equal the seed (e.g. the
  dialog's own enabled toggle) changes nothing; one that differs while the form
  is unedited re-seeds silently; one that differs while the form is edited keeps
  the edits and shows a "changed elsewhere" notice.
- **AC-10** (REQ-10) — `AddDevicePayload` accepts `webhook_header_name` and
  `webhook_sign`.
- **AC-11** (REQ-11) — The secret's help text no longer names a fixed header nor
  claims that no secret means unsigned delivery.
- **AC-12** (NFR-1, NFR-2) — Existing behaviour holds: switch separate from
  Save, deletion warning on empty URL, stored secret never rendered, secret-
  carrying failures redacted.
- **AC-13** (NFR-3, NFR-5) — Unit tests cover mode mapping, header payload,
  validators, events parse/serialise and the six-key payload; `typecheck`,
  `lint`, `test` pass.

- **AC-14** (REQ-5, NFR-1) — While the "changed elsewhere" notice is shown, Save
  is blocked; *Reload* re-seeds every field, including the stored secret.
- **AC-15** (REQ-5, NFR-1) — Saving an empty URL (the confirmed deletion) sends
  `webhook_header_name: null` and `webhook_sign: null` (the guide's full reset)
  and is not blocked by the authentication validators.
- **AC-16** (NFR-1) — A viewer without `devices.webhook.write` sees every new
  control disabled.
- **AC-17** (REQ-7) — When Inherit is selected, the server reports the effective
  mode as plain, and the device has no secret, a warning says the
  deployment-wide secret would be sent verbatim.

## Test cases

- **TC-1** (AC-1) — `null`/absent/`true`/`false` → inherit/inherit/signed/plain;
  header `""`/`null`/absent → `""`.
- **TC-2** (AC-2) — config without `effective_*` → summary reports unknown.
- **TC-3** (AC-3) — payload from a form with blank header and Inherit has six
  keys with `webhook_header_name: null`, `webhook_sign: null`.
- **TC-4** (AC-4, AC-17) — Signed/Plain + empty stored + empty replacement →
  error; with a stored secret → no error; Inherit never errors; inherited-plain
  warning only for inherit + effective plain + no secret.
- **TC-5** (AC-5) — `Host`, `content-type`, `X Bad`, 129 chars, `X:Y`, `X-Ünï` →
  error; `Authorization`, `X-Agent-Signature`, 128 chars → valid.
- **TC-6** (AC-6) — secret with `\n`, `\r`, `\0`, 4097 chars → error; message
  does not contain the secret.
- **TC-7** (AC-7) — warning only for plain; the clear-text variant for plain +
  non-https.
- **TC-8** (AC-8) — `" Message, message.ack ,custom.x"` → known
  {message, message.ack}, unknown [custom.x]; serialise back in catalogue order
  with `custom.x` appended; `"a,,A, b"` dedupes and drops empties; none
  selected and no unknown → `""`.
- **TC-9** (AC-9, AC-14) — the seed comparator: equal when only
  `webhook_enabled`/`effective_*` differ; different when any of the six fields
  differ (including the secret); the stale-save decision blocks while edited +
  remote-changed.
- **TC-11** (AC-15) — the clear payload has `null` header and sign whatever the
  form held.
- **TC-10** (AC-11, AC-12) — existing `device-webhook.test.ts` suite still
  passes; copy assertions updated.

## Out of scope

- Backend behaviour, server defaults, the `GET /devices` list.
- Rendering the stored secret.
- Delivery logs, retries, test-send.
- Deployment runtime files.

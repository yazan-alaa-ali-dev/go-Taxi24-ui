---
ticket: z8pmx9pyrj
stage: spec
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyrj"
  github: ""
---

# Specification — Device webhook: confirm a signature-scheme switch and explain server rejections per field

## Business goal

A signature-scheme change takes effect on the **next event** after the `PATCH`
(`docs/webhook-signature-agent-hmac-v1.html` §8.3). The backend has no grace
window and cannot send both schemes at once, so a receiver that does not yet
verify the Agent HMAC v1 headers fails every delivery from that moment. The
reverse switch to `legacy` can start sending the secret verbatim when the stored
or inherited `webhook_sign` is `false` (§6). Today the dialog saves either switch
with one click and says nothing.

Separately, every `4xx` on save shows one redacted sentence, because the request
carries the secret and raw server text must never be rendered. The reference
documents a fixed catalogue of `400` messages that each name the field they
reject (§11), and asks the UI to show the rejection under that field (§8.2).
The UI can do so **with its own fixed copy**, keyed on the known message, while
keeping the redaction for everything else.

## User story

As an operator, I want to be warned before a signature-scheme change goes live
and to see which field the server rejected, so that I do not break a working
receiver by accident and can fix a refused save without guessing.

## Functional requirements

- **REQ-1** — A save that would change the scheme deliveries are signed under
  is held behind a confirmation that states the change is immediate, what the
  receiver must already verify, and that a receiver must accept only one scheme
  per endpoint.
- **REQ-2** — A save that does not change the scheme is not held.
- **REQ-3** — The confirmation can be cancelled without sending anything, and
  confirming sends exactly the save that was confirmed.
- **REQ-4** — Leaving Agent HMAC v1 pre-selects the Signed mode (delivered by
  ticket 15, kept), and the dialog warns before saving whenever the resulting
  legacy mode would send a secret verbatim — chosen Plain, or Inherit resolving
  to plain.
- **REQ-5** — A `400 BAD_REQUEST` whose message is in the reference catalogue is
  shown as a fixed client sentence under the field it names.
- **REQ-6** — Any other failure keeps today's behaviour: the redacted sentence
  for every other `4xx`/`5xx`, the transport text for a failure with no response.
- **REQ-7** — Error handling reads the HTTP status and the body `code` only.
- **REQ-8** — A server that predates the signature-scheme field behaves exactly
  as today.

## Non-functional requirements and constraints

- **NFR-1** — No server text is ever rendered for a failed save, and no message
  quotes the secret or any part of it. The existing safeguards stay: the stored
  secret is never rendered, the empty-URL deletion keeps its own confirmation,
  the changed-elsewhere hold remains, the delivery switch stays separate.
- **NFR-2** — Every decision is a pure, unit-tested function; markup claims are
  answered through `react-dom/server` (the repository has no DOM renderer).
- **NFR-3** — No new request, no new dependency, no deployment runtime file
  change.
- **NFR-4** — The signature header's name stays out of source (the absolute
  `z8pmx9mw2x` rule); it is described by function.
- **NFR-5** — `typecheck`, `lint` and `test` pass (`ui-source` profile).

## Acceptance criteria

- **AC-1** (REQ-1, REQ-3) — Saving a change that alters the scheme in force
  shows a confirmation explaining that the change is immediate (next event, no
  grace window) and what the receiver must already verify; Cancel sends nothing
  and closes the confirmation; Confirm sends one save.
- **AC-2** (REQ-1) — The confirmation names the direction: switching to Agent
  HMAC v1 lists the three v1 headers (the signature header by function) and the
  signed string; switching to Legacy says Legacy has no replay protection; a
  switch whose target or origin the dialog cannot resolve (Inherit with an
  unknown deployment default, or an unrecognised stored scheme) says the scheme
  *may* change. Every direction states that a receiver must accept only one
  scheme per endpoint.
- **AC-3** (REQ-2) — A save that does not change the selected scheme (e.g. only
  the URL or events), or that changes it to an option resolving to the same
  scheme already in force (e.g. Inherit resolving to Legacy → Legacy), shows no
  scheme confirmation.
- **AC-4** (REQ-3) — A confirmation is bound to the switch it describes: if the
  scheme is changed again before Confirm, the shown confirmation no longer
  applies and the next save asks again. The empty-URL deletion keeps its own
  confirmation and never shows the scheme one.
- **AC-5** (REQ-4) — Changing the scheme from `Agent HMAC v1` to `Legacy` sets
  the mode to `Signed`.
- **AC-6** (REQ-4) — Choosing `Plain` shows the verbatim-secret warning before
  save. Choosing `Inherit` on a device whose stored mode inherits and whose
  server reports the effective mode as plain shows a verbatim warning too — for
  the device's own secret when it has one, for the deployment-wide secret when
  it has none. A device whose stored mode is explicit gets no claim about the
  default it cannot see. A save that leaves Agent HMAC v1 with the mode set
  back to `Inherit` warns that the default mode is not visible here and may be
  plain — under v1 the server's effective mode does not describe the legacy
  default.
- **AC-7** (REQ-4, REQ-1) — When a switch to Legacy — or to a target the dialog
  cannot resolve — is being confirmed while a verbatim warning applies, that
  warning is repeated inside the confirmation. A switch to Agent HMAC v1 never
  carries the verbatim warning (the mode is not used there); it carries AC-14's
  instead.
- **AC-8** (REQ-5) — Each message in the reference catalogue (§11) except the
  `POST`-only `Invalid request body` maps to its field — `url`, `secret`,
  `scheme`, `sign` or `headerName` — and a fixed client sentence; the sentence
  is shown under that field, and a short pointer to it is shown beside Save.
  The two secret-rule rejections (`at least 32 characters`, `may not equal an
  AGENT_CALLBACK_KEY entry`) ask for a new secret.
- **AC-9** (REQ-5) — When the named field is not on screen (the mode or header
  name under Agent HMAC v1, the scheme on a server that does not report it),
  the sentence is shown beside Save instead.
- **AC-10** (REQ-5, NFR-1) — A field rejection disappears once that field is
  changed, and any rejection disappears on the next save attempt; it never
  blocks Save.
- **AC-11** (REQ-6, NFR-1) — A `400` whose message is not in the catalogue, a
  `400` whose `code` is not `BAD_REQUEST`, and every other `4xx`/`5xx` show the
  existing redacted sentence; no server text is rendered in any case. A failure
  with no response (`status 0`) keeps its current text.
- **AC-12** (REQ-7) — Error handling relies on the HTTP status and the body
  `code` only: a response with HTTP `400` and a body `status: 200` is an error,
  and a body `status` never makes a failure look like a success or changes its
  classification.
- **AC-13** (REQ-8) — A server that omits `webhook_signature_scheme` shows no
  scheme confirmation, and its save body is unchanged.
- **AC-14** (REQ-1, NFR-1) — A switch to Agent HMAC v1 that keeps a stored
  secret already sent verbatim — stored mode Plain, or stored mode Inherit with
  the server reporting the effective mode as plain outside v1 — says inside the
  confirmation that the key is exposed and asks for a new secret. Typing a
  replacement removes the line. It never blocks the save.
- **AC-15** (REQ-3) — While the confirmation is shown, Save is disabled and
  only its Confirm button sends; Confirm is disabled while the save is pending
  or the form is blocked, and after a failed confirmed save the confirmation
  stays open with the rejection shown.

## Test cases

- **TC-1** (AC-1, AC-3) — the switch decision: stored legacy + form v1 →
  confirmation; stored v1 + form legacy → confirmation; form equal to the seed →
  none; stored inherit resolving to legacy + form Legacy → none; empty URL →
  none.
- **TC-2** (AC-2) — the confirmation copy per direction: v1 names
  `X-Agent-Timestamp`, `X-Agent-Request-Id` and `timestamp.request_id.raw_body`;
  legacy says "no replay protection"; unresolved says "may"; every direction
  contains the one-scheme-per-endpoint sentence and the immediacy sentence.
- **TC-3** (AC-4, AC-1) — the switch identity: two different switches are not
  the same confirmation; the rendered confirmation panel has a Cancel button of
  `type="button"` and a `role="alert"` container.
- **TC-4** (AC-5) — v1 → Legacy with mode inherit or plain → Signed.
- **TC-5** (AC-6) — `plainWarning` for Plain; the inherited-plain warning for
  stored-inherit + effective plain with and without a device secret; stored
  explicit + effective plain + form Inherit → no warning; leaving v1 with mode
  Inherit → the unknown-default warning.
- **TC-6** (AC-7) — the legacy confirmation includes the supplied verbatim
  warning; the v1 confirmation never does.
- **TC-7** (AC-8, NFR-1) — table-driven over every catalogue message (with a
  secret-like suffix appended where the server appends detail): expected field
  and sentence; the output contains neither the message nor the suffix; every
  message matches exactly one entry.
- **TC-8** (AC-9, AC-10) — placement: `headerName`/`sign` under v1 → beside
  Save; `scheme` when unreported → beside Save; otherwise the field.
- **TC-9** (AC-11, AC-12) — unknown `400` text, a `400` with code `HTTP_ERROR`,
  a `403` and a `500` → no field rejection and the redacted sentence; `status 0`
  → `server`; an `AxiosError` with HTTP `400` and body `{ status: 200, code:
  "BAD_REQUEST", message: <catalogue> }` → a field rejection; the same cases as
  the plain `ApiError` the interceptor rejects with; a non-string `message` or
  `code` → no rejection and no throw.
- **TC-10** (AC-13) — unreported scheme → no switch, whatever the form holds.
- **TC-11** (AC-14) — `exposedSecretWarning`: to v1 + stored sign `false` +
  stored secret → warning; stored inherit + effective plain (not v1) → warning;
  a replacement typed, no stored secret, stored sign `true`, or a target other
  than v1 → none.
- **TC-12** (AC-15, AC-4) — source rules: `onSubmit` reaches no `save.mutate()`
  while `schemeSwitch` is set; the confirm handler guards on the shown panel,
  the block and `isPending`; the close effect resets the confirmation and the
  rejection; the rendered Confirm carries `disabled` when told.

## Out of scope

- Server-side secret rotation or a grace window (not supported by the backend).
- A `Generate secret` button and a length counter (ticket 16).
- `PATCH /devices/{id}/webhook/enabled`.
- Receiver-side verification code.
- Mapping `400` messages on any other surface.

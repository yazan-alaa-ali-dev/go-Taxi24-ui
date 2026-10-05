---
ticket: z8pmx9p135
stage: plan
mode: standard
status: complete
owner: developer
updated: 2026-10-05
links:
  clickup: "https://app.clickup.com/t/z8pmx9p135"
  github: ""
---

# Plan — Device webhook: authentication mode, custom header, effective values and events picker

> **Revision 2.** The advisory panel (`senior-reviewer`, `security-reviewer`,
> `performance-reviewer`) reviewed revision 1 before any code was written. It
> returned **26 findings**, 3 of them major. Every finding is answered under
> **Panel response** below. Seventeen changed the design. Those changes are
> folded into the sections here and into `spec.md`: `AC-4`, `AC-6`, `AC-7`,
> `AC-8` and `AC-9` were reworded, `AC-14`–`AC-17` and `TC-11` were added, and
> `TC-9` was replaced.
>
> All three lenses raised the same problem. As revision 1 wrote it, the "changed
> elsewhere" notice would have fired on the dialog's own enabled toggle, and on
> its own save when read from a stale cache. Saving while that notice showed
> would also have silently restored a secret that was rotated elsewhere.

## Approach

The surface around the new fields already exists:

- the dialog;
- the separate enabled switch;
- the confirmation before an empty URL deletes the configuration;
- the rule that the stored secret is never rendered;
- the redacted message for a failed save.

This ticket extends that surface instead of rebuilding it. Types go in one file
and decisions in one pure module. The dialog binds state to them, `App.tsx`
gains one WebSocket case, and one source-policy rule is extended.

The repository's tests have no DOM renderer. So every decision is a pure
function in `src/lib/device-webhook.ts` with a colocated test, and the dialog
only binds state to those functions.

### Deliberate decision — the create-device dialog stays without webhook fields

The ClickUp task asked for authentication controls on the create dialog. An
earlier ticket deliberately removed **all** webhook fields from that dialog (see
its header comment). It was the one place where a signing secret was typed and
never shown again, and the webhook now has its own surface with the
enable/delete distinction.

Adding only mode and header there would be incoherent. `webhook_sign: true`
requires a secret in the same request, so the dialog would need URL and secret
again, which reopens the hazard the earlier ticket closed. So the request
**type** gains the two fields (REQ-10 / AC-10), and the UI keeps a single path:
create the device, then configure it from its webhook dialog.

### Send all six fields, always

For `PATCH`, four fields are replaced on every request and two keep their stored
value when absent. Sending all six explicitly makes the body a complete
statement of the form, so the plan never relies on the absent-preserving
behaviour. Inherit and a blank header send `null`, which is the guide's
documented reset.

### Stored values outside the catalogue are kept

`webhook_events` is free text on the server. Older configurations may hold names
that are missing from the 16-event catalogue, or that differ only in case. If an
unrelated save dropped them, the receiver would silently get fewer events than
before.

So the parser splits stored values into catalogue matches and unknown names. It
drops empty segments and removes duplicates case-insensitively. The dialog lists
unknown names as "kept", and the serializer writes them back unchanged after the
catalogue names, which come out in catalogue order. This rewrites case and order
on save. The change has no effect on behaviour, because the server matches event
names case-insensitively.

### A WebSocket refresh must not overwrite an edit in progress

The dialog copies `config.data` into form state. Wiring
`DEVICE_WEBHOOK_CONFIG_UPDATED` to an invalidation means a refetch can land
while the operator is typing. So:

- The form is seeded **once per open, after that open's first fetch settles**
  (`config.data && !config.isFetching`). Until then the dialog shows its
  spinner, so it never seeds from a stale cached copy.
- The seed is a snapshot of the **six configuration fields**: URL, secret,
  events, insecure, header and sign. A pure `webhookFieldsDiffer(a, b)` compares
  each new read against the snapshot. It ignores `webhook_enabled` and
  `effective_*`, so the dialog's own toggle never triggers the notice.
- If the new read differs and the form is **unedited** (form state equals the
  seed), the form re-seeds silently.
- If the new read differs and the form is **edited**, the edits stay, the notice
  shows, and **Save is blocked** until the operator presses *Reload*. Reload
  re-seeds every field, including the stored secret. A save where the last
  writer silently wins the secret is never offered.
- The snapshot and the flag are cleared in the existing close effect, so no copy
  of the credential outlives the dialog.

### Validation mirrors the server, and blocks only what the server would refuse

**Header name:**

- Trimmed, and validated on exactly the trimmed string that is sent.
- At most 128 characters.
- ASCII-only token characters, checked with ``/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/``.
- Reserved names refused case-insensitively. `Authorization` is allowed.

**Secret:** the check runs on the secret **to be sent**, which is the
replacement if one was typed, otherwise the stored one. It must be at most 4096
characters with no C0, DEL or C1 control characters. Checking the stored secret
too means a legacy secret that breaks the new rules produces an "enter a
replacement" message instead of an opaque redacted 400. Messages never include
the secret itself.

**Signed and Plain** both require a non-empty secret to be sent. Plain with an
empty device secret would make the server send the deployment-wide secret
verbatim to this customer's URL. Inherit is never blocked, because that choice
belongs to the server's policy. When the server reports
`effective_webhook_sign === false` and the device has no secret, a warning says
so.

The confirmed **deletion** (empty URL) skips the authentication validators and
sends `webhook_header_name: null, webhook_sign: null`, the guide's full reset
(§13 D). A deletion is therefore never blocked and leaves nothing behind.

The URL keeps its "notice, never refusal" rule. Plain shows a warning that the
stored secret goes out verbatim. With a non-https URL, the warning adds that the
secret then travels in clear text on every delivery and every retry.

### Error redaction unchanged

Every save body carries the secret, round-tripped from the stored value, so
`webhookSaveFailure` stays `redacted` for any 4xx. This deliberately deviates
from guide §14 ("show the 400 message as is"), and the deviation is recorded in
`implement.md`. A comment at the decision states that client-side validation is
**not** a reason to relax the redaction. The redacted message is widened to
mention the header name.

## Steps

1. **`src/api/devices.ts`**
   - Add `WebhookSign = boolean | null`.
   - Add optional `webhook_header_name?: string | null` and
     `webhook_sign?: WebhookSign` to `DeviceWebhookSettings`,
     `UpdateDeviceWebhookPayload` and `AddDevicePayload`.
   - Add optional `effective_webhook_header_name?: string` and
     `effective_webhook_sign?: boolean` to `DeviceWebhookConfig` (GET only).
2. **`src/lib/device-webhook.ts`** — add:
   - `WebhookAuthMode`, `authModeFrom(sign)`, `signFrom(mode)`.
   - `headerNameFrom(stored)`, which maps `null` or absent to `''`, and
     `headerNamePayload(input)`, which maps a trimmed `''` to `null`.
   - The validators `headerNameError`, `secretError(secretToSend, source)` and
     `authSecretError(mode, secretToSend)`. Each returns `string | null`.
   - The warnings `plainWarning(mode, url)` and `inheritedPlainWarning(mode,
     effective, secretToSend)`.
   - `effectiveAuthFrom(config)`, returning `{ headerName, mode } | null`.
   - `WEBHOOK_EVENTS` (16 `{ name, description }` entries),
     `parseWebhookEvents` and `serializeWebhookEvents`.
   - `webhookFieldsFrom(config)` (the six-field snapshot) and
     `webhookFieldsDiffer(a, b)`.
   - Extend `webhookPayloadFrom` to always send six keys. In the clear case it
     sends `null` for header and sign.
   - Widen the `WEBHOOK_SAVE_FAILED_REDACTED` message, and add the comment that
     client-side validation does not relax redaction.
3. **`src/lib/device-webhook.test.ts`** — add tests for every function above
   and for the six-key and clear payloads, and update the existing payload
   tests.
4. **`src/features/devices/webhook-dialog.tsx`**
   - Add an Authentication block:
     - a shadcn `Select` for the mode;
     - an `Input` for the header name;
     - a line showing the effective values;
     - the Plain warning and the inherited-Plain warning;
     - inline errors.
   - Replace the events input with a checkbox grid that shows each event's
     description, plus a "kept" list for unknown names.
   - Seed the form after the open's first fetch.
   - Add the "changed elsewhere" notice with Reload, and block Save while it
     shows.
   - Block submit while any validation error stands.
   - Set `disabled={!mayWrite}` on **every new control**.
   - Correct the secret help text.
   - Render header names, effective values and kept event names as JSX text
     only.
5. **`src/App.tsx`** — add `case 'DEVICE_WEBHOOK_CONFIG_UPDATED'`.
   - Read only `device_id`, inline, in the style of the neighbouring
     `DEVICE_REMOVED` case, with a `typeof === 'string'` guard.
   - Invalidate `deviceWebhookKey(id)` with `cancelRefetch: false`, so the
     request joins the dialog's own in-flight refetch instead of aborting it.
   - Never call `setQueryData` from the event. Do nothing when the event carries
     no id.
6. **`src/lib/source-policy.test.ts`** — extend the stored-secret rule:
   - no `value=` binding for `secretToSend`;
   - no template or toast that includes `secretToSend`;
   - `src/lib/device-webhook.ts` puts no secret parameter into a message.

## Files to change

- `src/api/devices.ts`
- `src/lib/device-webhook.ts`
- `src/lib/device-webhook.test.ts`
- `src/features/devices/webhook-dialog.tsx`
- `src/App.tsx`
- `src/lib/source-policy.test.ts`
- `_specs/z8pmx9p135/*` (ticket record)

No deployment runtime file is touched.

## Validation strategy

Profile **`ui-source`**: `npm run typecheck`, `npm run lint` and `npm test`.
`npm run build` also runs once, as a smoke check of the bundle.

## Rollback

Revert the single commit. The change is UI-only and only adds to the wire: a
backend that predates the two new keys ignores them. No data migration is
involved.

## Out of scope

- Create-device UI changes (see the decision above).
- The backend and `GET /devices`.
- Rendering the stored secret.
- Delivery logs and test-send.
- Deployment runtime files.

## Traceability

| AC | Step |
|---|---|
| AC-1, AC-2 | 1, 2 (`authModeFrom`, `headerNameFrom`, `effectiveAuthFrom`), 4 |
| AC-3 | 2 (`webhookPayloadFrom`), 3, 4 |
| AC-4, AC-5, AC-6 | 2 (validators), 3, 4, 6 |
| AC-7 | 2 (`plainWarning`), 3, 4 |
| AC-8 | 2 (events), 3, 4 |
| AC-9 | 2 (`webhookFieldsDiffer`), 4, 5 |
| AC-10 | 1 |
| AC-11 | 4 |
| AC-12 | 3 (existing suite), 4, 6 |
| AC-13 | 3, validation strategy |
| AC-14 | 2 (`webhookFieldsDiffer`), 3, 4 |
| AC-15 | 2 (clear payload), 3, 4 |
| AC-16 | 4 |
| AC-17 | 2 (`inheritedPlainWarning`), 3, 4 |

## Panel response

Each finding is marked with one of these outcomes:

- **changed** — the design changed.
- **doc** — the finding is recorded, with no design change.
- **proceed** — the finding confirms the plan and needs no action.
- **declined** — the finding is rejected, with the reason.

### Senior lens (10)

1. *major — the notice fires on the dialog's own toggle and on a stale cache.*
   **changed**: the form seeds after the first fetch settles, compares only the
   six fields, and re-seeds silently when unedited (AC-9).
2. *A stale save restores the secret.* **changed**: Save is blocked while the
   notice shows, and Reload re-seeds the secret too (AC-14).
3. *A deletion is blocked, or leaves header and sign behind.* **changed**: the
   clear case skips the auth validators and sends `null`/`null` (AC-15, TC-11).
4. *A viewer can toggle the checkboxes.* **changed**: every new control is
   disabled without write permission (AC-16).
5. *The events normalisation is undocumented.* **changed**: it is documented in
   AC-8, and dropping empty segments and the case-insensitive dedupe are
   tested.
6. *The header regex should be ASCII-only.* **changed**: an explicit ASCII
   regex is used, and TC-5 has a non-ASCII case.
7. *A second device-id reader duplicates the existing one.* **changed**: the
   read is inlined in `App.tsx` in the neighbouring style, and TC-9 now tests
   the seed comparator instead.
8. *An older backend silently ignores the mode.* **changed** (copy only): when
   the effective values are unknown, the text says the server may not support
   these settings.
9. *Redaction conflicts with guide §14.* **doc**: the deviation is recorded in
   `implement.md`.
10. *The create dialog gets a type-only change.* **proceed**.

### Security lens (10)

1. *major — Plain with an empty secret sends the global secret.* **changed**:
   Plain requires a secret to send, and a warning covers inherited Plain with no
   secret (AC-4, AC-17). A backend follow-up is noted in `implement.md`.
2. *major — a stale form wins.* **changed**: same fix as senior 2 (AC-14).
3. *Plain reuses the stored HMAC key, which travels in clear text over http.*
   **changed**: the Plain warning names the stored secret, and a clear-text
   variant covers non-https URLs (AC-7). Requiring a fresh secret when switching
   from Signed to Plain is **declined**: it would force a rotation on the
   receiver during a legitimate migration, and the warning already puts that
   choice in front of the operator.
4. *A legacy stored secret causes an opaque 400.* **changed**: the secret to be
   sent is validated, with a "replace it" message for the stored one (AC-6).
5. *The source-policy rule is not extended.* **changed**: step 6 extends it, and
   the file is added to the list.
6. *Handling of the WebSocket payload.* **changed**: only `device_id` is read,
   and the event only triggers an invalidation.
7. *Redaction must not be relaxed later.* **changed**: a comment is added at the
   decision.
8. *Server strings must render as text.* **proceed**: they render as JSX text
   only, and the existing rule already covers `dangerouslySetInnerHTML`.
9. *C1 control characters are not covered.* **changed**: the C1 range is
   included.
10. *The create dialog and runtime files are unaffected.* **proceed**.

### Performance lens (6)

1. *Double GET: one from the mutation, one from the WebSocket echo.*
   **changed**: the WebSocket invalidation uses `cancelRefetch: false`.
2. *The notice fires on the dialog's own toggle.* **changed**: same fix as
   senior 1.
3. *Closed dialogs are not refetched.* **proceed**: the key stays per device.
4. *Closed cards re-run the parsing.* **proceed**: the catalogue is a module
   constant, and no memoisation is needed.
5. *No bundle weight is added.* **proceed**: the existing `Select` and
   `Checkbox` are used.
6. *The snapshot must be cleared on close.* **changed**: the snapshot and the
   flag are reset in the close effect.

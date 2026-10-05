---
ticket: z8pmx9p135
stage: implement
mode: standard
status: complete
owner: developer
updated: 2026-10-05
links:
  clickup: "https://app.clickup.com/t/z8pmx9p135"
  github: ""
---

# Implementation — Device webhook: authentication mode, custom header, effective values and events picker

The implementation follows `plan.md` revision 2. It is on branch
`ticket/z8pmx9p135`, cut from the tip of `ticket/z8pmx9mw2x` (the last delivered
ticket). The pull request targets `main`. Per the workflow, this stage creates
no commit; `/publish-pr` creates the single publishable commit.

## Files changed

All files below are edits; no file was added.

- `src/api/devices.ts`
  - Adds the `WebhookSign` type (`boolean | null`).
  - Adds `webhook_header_name` and `webhook_sign` to the read, update and create
    types.
  - Adds `effective_webhook_header_name` and `effective_webhook_sign` to the
    `GET` shape.
  - Every new field is optional, so a deployment that predates the backend
    change still typechecks against the real response.
- `src/lib/device-webhook.ts`
  - Mode mapping: `authModeFrom` and `signFrom`.
  - Header-name helpers: `headerNameFrom`, `headerNamePayload` and the
    validator `headerNameError`.
  - Secret checks: `secretError` and `authSecretError`.
  - Warnings: `plainWarning` and `inheritedPlainWarning`.
  - Effective values: `effectiveAuthFrom` and the `EFFECTIVE_UNKNOWN` text.
  - Events: the `WEBHOOK_EVENTS` catalogue, `parseWebhookEvents` and
    `serializeWebhookEvents`.
  - Seed logic: `webhookFieldsFrom`, `webhookFieldsDiffer` and
    `webhookFormEdited`.
  - Form validation: `webhookFormErrors`.
  - `webhookPayloadFrom` now always sends all six keys, with `null`/`null` on a
    deletion.
  - The redacted save-failure text is widened, and a comment explains why
    redaction stays.
- `src/lib/device-webhook.test.ts`
  - 29 new tests, plus the two existing payload tests updated to the new
    signature.
- `src/features/devices/webhook-dialog.tsx`
  - New Authentication block: the mode `Select`, the header-name input, the
    effective values, the Plain warning, the inherited-Plain warning and inline
    errors.
  - The events input is replaced by a checkbox catalogue, with a "kept" line
    listing stored names outside the catalogue.
  - The form is seeded once per open, after the first fetch settles.
  - A "changed elsewhere" notice offers Reload and holds Save until the operator
    reloads.
  - Save is disabled while any validation error stands.
  - Every new control is disabled without `devices.webhook.write`.
  - The secret help text is corrected.
- `src/App.tsx`
  - Adds a `DEVICE_WEBHOOK_CONFIG_UPDATED` case. It reads only `device_id`,
    validates it as a string, and invalidates that device's webhook query with
    `cancelRefetch: false`.
- `src/lib/source-policy.test.ts`
  - The stored-secret rule now also covers `secretToSend`.
  - It also asserts that `src/lib/device-webhook.ts` interpolates no secret into
    a template.

No deployment runtime file was touched, and no dependency was added.

## Deviations from the plan

1. **The effective-values line says "This reflects the last saved
   configuration."** The plan did not specify this copy. It was added because
   the line shows the server's values, which do not follow unsaved edits in the
   form.
2. **One lint-suppression comment on the seed effect**
   (`react-hooks/exhaustive-deps`). The effect has to run on a new read only.
   `fill` and `edited` are derived on every render, so adding them as
   dependencies would run the effect on every keystroke. The comment states the
   reason.

## Deliberate deviations from the guide and the ClickUp task

These were decided in `plan.md` and are recorded here as the plan requires:

- **Guide §14 says to show the server's 400 `message` as is.** Every save body
  carries the secret (round-tripped from the stored value), so a save failure
  stays redacted. Instead, client-side validation now covers every documented
  400.
- **ClickUp AC-9 asked for authentication controls on the create-device
  dialog.** Only the request type changes. An earlier ticket removed all webhook
  fields from that dialog on purpose, and Signed requires a secret in the same
  request. The rationale is in `plan.md`.
- **Backend follow-up, not a frontend change:** with Plain and an empty device
  secret, the server inherits the deployment-wide secret and sends it verbatim.
  The UI now refuses that combination, and warns when Inherit resolves to plain
  without a device secret. The backend should consider refusing the combination
  as well.

## Validation run

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS. Four pre-existing `only-export-components` warnings, none in a touched file |
| Tests | `npm test` | PASS: 43 files, **853 tests** (baseline 824) |
| Build | `npm run build` | PASS: `dist/index.html` 1,132.75 kB (gzip 447.53 kB) |
| Format | `prettier --check` | Touched files are formatted. `source-policy.test.ts` already failed this check before the ticket, so it was not reformatted wholesale |

## Mutation testing

Seven mutants were introduced into `src/lib/device-webhook.ts`, one at a time,
and each was reverted after its run. All seven were killed.

| # | Mutant | Killed by |
|---|---|---|
| M1 | Plain with no secret allowed | `authSecretError` test |
| M2 | Deletion keeps `webhook_sign` | clear-payload test |
| M3 | Seed comparator ignores the secret | six-field differ test |
| M4 | Unknown events dropped | two events tests |
| M5 | Control-character class narrowed to `\u0000-\u0009` | two secret tests |
| M6 | Header name validated untrimmed | trimmed-validation test |
| M7 | `null` sign read as plain | mode-mapping test |

## Notes for the verifier

- The repository has no DOM test renderer. The dialog's behaviour is therefore
  proven through the pure functions it binds to, together with the
  source-policy rule that pins secret handling in the dialog.
- The seed and changed-elsewhere logic runs on settled reads only, so the
  dialog's own toggle refetch cannot raise the notice. This is covered by the
  test "ignores the delivery switch and the effective values".

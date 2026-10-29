---
ticket: z8pmx9pyrj
stage: implement
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyrj"
  github: ""
---

# Implementation — 17 · Device webhook: confirm a scheme switch, explain rejections per field

Implemented on branch `ticket/device-webhook-scheme-confirm-field-errors` (cut
from `main` at `fd9a473`) per `plan.md` revision 2. **No commit was created**:
the changes are uncommitted working-tree edits, and the one publishable commit
is made by `/publish-pr`.

## Files changed

| # | File | Change |
|---|---|---|
| 1 | `src/lib/device-webhook.ts` | New "Switching scheme" section: `ResolvedScheme`, `SchemeSwitch`, `schemeSwitchFrom`, `SchemeSwitchCopy`, `schemeSwitchConfirmation`, `exposedSecretWarning`. New "Server rejections, per field" section: `WebhookField`, `WebhookRejection`, the `REJECTIONS` table, `webhookRejectionFrom`, `rejectionShownAt`, `rejectionPointer`. `inheritedPlainWarning` takes an object (booleans only) and covers the own-secret and leaving-v1 cases; `SIGNED_NEEDS_SECRET` extracted so `authSecretError` and the table share one sentence. |
| 2 | `src/lib/device-webhook.test.ts` | The three existing `inheritedPlainWarning` assertions moved to the object signature (+2 cases); 9 new `describe` blocks (TC-1, 2, 4–11). |
| 3 | `src/features/devices/webhook-authentication.tsx` | `SchemeSwitchConfirmation` export (hook-free, `role="alert"`, two `type="button"` buttons); `schemeError` prop under the scheme select, with `aria-invalid`. |
| 4 | `src/features/devices/webhook-authentication.test.tsx` | Default `schemeError={null}`; 2 new `describe` blocks (TC-3, TC-12 markup). |
| 5 | `src/features/devices/webhook-dialog.tsx` | `confirmingScheme` / `rejection` state; `blocked`, `schemeSwitch`, `showSwitch`; `onSubmit` opens the confirmation instead of sending; `confirmSwitch`; the `onError` split; `clearRejection`; `onModeChange` / `onHeaderNameChange` wrappers; resets in `fill`, the close effect, `onSchemeChange` and the URL `onChange`; field sentences under the URL and secret, pointer/sentence beside Save; footer Save disabled on `showSwitch`. |
| 6 | `src/lib/source-policy.test.ts` | The no-interpolation rule widened to any `${…}` naming a secret, for the module and the dialog; three new rules in the z8pmx9pyre block (save-scoped classification + no `toApiError` in the dialog; Save never sends a switch; the close effect resets both states). |

## Deviations

1. **Intended visible change in the always-on notices** (senior 8). Because the
   dialog's authentication notices and the confirmation share
   `inheritedPlainWarning`, a device that inherits a plain default and has its
   own secret now shows a red notice it did not show before; a device whose
   stored mode is explicit no longer shows the "server default is plain" claim,
   which described its own choice rather than the default. Both follow AC-6.
2. **The mode `Select` keeps no `aria-invalid`** (senior 6, partly accepted, as
   recorded in the plan): its message renders directly beneath it, as it did
   before this ticket.
3. **TC-7's "exactly one entry"** is asserted through behaviour, not by reading
   the table (which stays private): every catalogue message is pinned to its
   expected field, and near-misses in spacing or case match nothing. The test
   is named for what it checks.

## Validation run

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | exit 0; only the pre-existing `only-export-components` warnings, none in a touched file |
| `npm run test` | **942 passed, 44 files** (baseline 895 / 44) |
| `npm run build` | `dist/index.html` 1,146.00 kB (gzip 450.88 kB) — +8 kB of copy |
| Mutation pass | 14/14 killed — see `verify.md` |

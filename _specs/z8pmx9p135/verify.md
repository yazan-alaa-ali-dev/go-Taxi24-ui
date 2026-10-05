---
ticket: z8pmx9p135
stage: verify
mode: standard
status: complete
owner: developer
updated: 2026-10-05
links:
  clickup: "https://app.clickup.com/t/z8pmx9p135"
  github: ""
---

# Verification — Device webhook: authentication mode, custom header, effective values and events picker

**Outcome: PASSED.** Every one of the 17 acceptance criteria and the 11 test
cases maps to an executed result below. Verification depth is `all-ac`.

## Validation profile `ui-source`

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | **PASS**, no output |
| Lint | `npm run lint` | **PASS**. Four `react(only-export-components)` warnings, all pre-existing (`button.tsx`, `badge.tsx`, `tabs.tsx`, `use-device-guard.tsx`); none is in a touched file |
| Tests | `npm test` | **PASS**: 43 files, **853 tests**, against a baseline of 824 on the parent tip |
| Build | `npm run build` | **PASS**: one `dist/index.html`, 1,132.75 kB (gzip 447.53 kB) |

## Runtime-impact statement

**No.** No deployment runtime file was modified: `.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json` and
`index.html` are all untouched. No dependency was added. On the wire, the change
only adds the two new keys, which a backend that predates them ignores.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC-1 | PASS | "the three authentication modes are three, not two" (mode and header mapping); the dialog seeds `mode` and `headerName` through them |
| AC-2 | PASS | "the effective values are reported, never guessed"; the dialog renders `effectiveAuthFrom` or `EFFECTIVE_UNKNOWN` |
| AC-3 | PASS | "every save states all six fields": six keys, and `null` for inherit and a blank header |
| AC-4 | PASS | "a mode that needs a secret refuses to go without one"; Save is disabled and `onSubmit` returns while `errors.auth` is set |
| AC-5 | PASS | "the header name is checked the way the server checks it": length, ASCII token, reserved names in any casing, `Authorization` allowed, trimmed |
| AC-6 | PASS | "the secret is checked without ever being quoted": C0, DEL and C1 characters, 4096 limit, stored-secret replacement message, no message contains the secret; the source-policy rule is extended |
| AC-7 | PASS | "Plain is warned about": Plain only, names the stored secret, clear-text variant for a URL that is not https |
| AC-8 | PASS | "events come from the catalogue and nothing stored is lost": 16 events, case-insensitive match, unknown names kept, empty segments and duplicates dropped, catalogue order |
| AC-9 | PASS | `App.tsx` reads only `device_id` and only invalidates; seed after a settled read; "a later read only matters when it changes the form" |
| AC-10 | PASS | `AddDevicePayload` declares `webhook_header_name` and `webhook_sign`; typecheck passes |
| AC-11 | PASS | The secret help text in `webhook-dialog.tsx` names no fixed header and no longer says "not signed" |
| AC-12 | PASS | The existing suite is unchanged and green (deletion warning, switch semantics, redaction); the switch keeps its own mutation, separate from Save; the source-policy secret rule passes |
| AC-13 | PASS | 29 new unit tests; typecheck, lint and test pass |
| AC-14 | PASS | `webhookFieldsDiffer` and `webhookFormEdited` are tested; the dialog disables Save while `changedElsewhere`; Reload calls `fill` with the current read, which re-seeds the stored secret |
| AC-15 | PASS | "resets header and mode on a deletion"; "blocks nothing on a deletion" |
| AC-16 | PASS | The mode `Select`, every event `Checkbox` (`disabled={!mayWrite}`) and the header `Input` (`readOnly={!mayWrite}`) are guarded; the replacement-secret input still renders only for writers |
| AC-17 | PASS | "warns when inherit resolves to plain and the device has no secret of its own" |

## Test cases

| TC | Result |
|---|---|
| TC-1 | PASS |
| TC-2 | PASS |
| TC-3 | PASS |
| TC-4 | PASS |
| TC-5 | PASS: includes the non-ASCII case `X-Ünï` |
| TC-6 | PASS |
| TC-7 | PASS |
| TC-8 | PASS |
| TC-9 | PASS |
| TC-10 | PASS: the existing suite is green with updated copy |
| TC-11 | PASS |

## Implementation evidence

`implement.md` lists six edited files and records the validation run. Seven
mutants were introduced and all seven were killed. As the workflow requires, no
commit was created before `/publish-pr`.

## Known limits, carried forward rather than hidden

1. No DOM renderer exists in the test environment. The dialog's bindings are
   proven through the pure functions and the source-policy rule, not by
   rendering the dialog.
2. The backend still accepts Plain with an empty device secret and sends the
   deployment-wide secret. The UI refuses that combination; the backend
   follow-up is noted in `implement.md`.

## Decision

**PASSED.** 17 of 17 acceptance criteria and 11 of 11 test cases are mapped to a
result, `ui-source` is green, and the runtime impact is **no**. The ticket
transitions `implemented → verified → closed`.

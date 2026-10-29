---
ticket: z8pmx9pyrj
stage: verify
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyrj"
  github: ""
---

# Verification — 17 · Device webhook: confirm a scheme switch, explain rejections per field

**Outcome: PASSED.** Profile `ui-source` green, build green, every AC mapped to
an executed result, 14/14 mutants killed.

## Commands

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | exit 0 (pre-existing warnings only, none in a touched file) |
| `npm run test` | 942 passed / 44 files — baseline 895 / 44 |
| `npm run build` | passes |

## Acceptance criteria

Test names are from `src/lib/device-webhook.test.ts` unless marked (A) —
`webhook-authentication.test.tsx` — or (P) — `source-policy.test.ts`.

| AC | Evidence | Result |
|---|---|---|
| AC-1 | › "a scheme switch is owed a confirmation only when the scheme changes" (both directions); (A) › "is announced, lists every line, and offers Cancel and the named action"; (P) › "Save never sends a scheme switch; only the confirmation does" | PASS |
| AC-2 | › "the confirmation says what the switch does, per direction" (v1 headers + signed string, Legacy no replay protection, unresolved "may"; shared immediacy and one-scheme lines) | PASS |
| AC-3 | › "does not ask when the select was not moved"; › "does not ask when both options resolve to the scheme already in force" | PASS |
| AC-4 | › "never asks on the deletion…"; (P) › "closing the dialog drops the confirmation and the rejection"; reset on scheme/URL change (mutant 12) | PASS |
| AC-5 | › "leaving v1 for Legacy lands on Signed" | PASS |
| AC-6 | › "warns when inherit resolves to plain, for whichever secret goes out"; › "makes no claim about a default an explicit stored mode hides"; › "says the default is not visible when Inherit is chosen on the way out of v1"; `plainWarning` cases (existing) | PASS |
| AC-7 | › "to Legacy: no replay protection, and the verbatim warning when one applies" | PASS |
| AC-8 | › "a catalogued 400 is shown under its field, in this app's words" (15 rows, `it.each`); › "asks for a new secret for the two secret-rule rejections" | PASS |
| AC-9 | › "a rejection is shown where its field is on screen"; (A) › "has nowhere to render it when the server does not report the scheme" | PASS |
| AC-10 | `clearRejection` per field + reset on submit/confirm (dialog); rejection never feeds `invalid` (Save's `disabled` reads `blocked`); (P) close-effect rule | PASS |
| AC-11 | › "maps no unknown 400, no other code, and no other status" (unknown text, `Invalid request body`, `HTTP_ERROR`, 403, 500, status 0; redacted / server classification unchanged) | PASS |
| AC-12 | › "reads the HTTP status, never a status in the body" (HTTP 400 + body `status: 200`); › "works on the plain ApiError the interceptor actually rejects with" | PASS |
| AC-13 | › "never asks for a server that does not report the field…"; existing `OLD_SERVER` payload tests unchanged | PASS |
| AC-14 | › "switching to v1 with a key that already travelled verbatim asks for a new one" | PASS |
| AC-15 | (A) › "has no submit button…"; (A) › "disables Confirm when told…"; (P) › "Save never sends a scheme switch…" (`onSubmit` order, confirm guard, `disabled={blocked \|\| save.isPending}`) | PASS |

Every TC (TC-1 … TC-12) is exercised by the tests named above.

## Mutation pass

Each mutant was applied alone, the three test files run, and the source
restored.

| # | Mutant | Result |
|---|---|---|
| 1 | a catalogue prefix reworded | killed |
| 2 | the `code === 'BAD_REQUEST'` check dropped | killed |
| 3 | the `typeof` guard dropped | killed |
| 4 | the server message returned instead of the constant | killed |
| 5 | the `scheme === seeded` short-circuit dropped | killed |
| 6 | the same-resolution short-circuit dropped | killed |
| 7 | `onSubmit` sends after opening the confirmation | killed |
| 8 | Confirm's `isPending` guard dropped | killed |
| 9 | the `seededSign` guard dropped | killed |
| 10 | the leaving-v1 branch dropped | killed |
| 11 | the exposed-secret `seededSign === false` arm dropped | killed |
| 12 | the close-effect confirmation reset dropped | killed |
| 13 | header-name placement under v1 ignored | killed |
| 14 | Confirm made a submit button | killed |

## Scope check

`git status` on `src/` and the runtime files: exactly the six files in
`plan.md > Files to change`. Nothing else under `src/` changed.

## Runtime impact (TR-3)

**No.** No deployment runtime file changed (`.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json`,
`index.html`). No new dependency, no new request, no change to the save body.

## Recorded risks

- **Catalogue drift**: a reworded backend message falls back to the redacted
  sentence — fail-safe, never a wrong field.
- **Callback-key oracle** (security 9): the per-field sentence makes an existing
  API-level equality check easier to read; the server remains the control.
- **"May change" prompts**: moving an explicit device to Inherit always asks,
  because the default is not visible.

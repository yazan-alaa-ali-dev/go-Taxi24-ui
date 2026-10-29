---
ticket: z8pmx9pyre
stage: verify
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyre"
  github: ""
---

# Verification — 15 · Device webhook: the signature scheme, and the effective scheme

**Outcome: PASSED.** Profile `ui-source` green, build green, every AC mapped to
an executed result, 14/14 mutants killed.

## Commands

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (4 pre-existing warnings, none in a touched file) |
| `npm run test` | 895 passed / 44 files — baseline 853 / 43 |
| `npm run build` | passes |

## Acceptance criteria

| AC | Evidence | Result |
|---|---|---|
| AC-1 | `device-webhook.test.ts` › "the stored scheme reaches the form in four states" | PASS |
| AC-2 | › "names the inherited scheme only when the device actually inherits" (incl. explicit, `invalid`, unrecognised, absent → bare `Inherit`) | PASS |
| AC-3 | `webhook-authentication.test.tsx` › "the invalid scheme is an alert nobody can dismiss"; source rule "the invalid-scheme alert is rendered for every viewer"; `SCHEME_INVALID_WARNING` wording test | PASS |
| AC-4 | `webhook-authentication.test.tsx` › "the scheme in force decides which controls exist" (v1, inherited v1, legacy) — as amended, see `implement.md` deviation 1 | PASS |
| AC-5 | › "an Agent HMAC v1 key is checked the way the server keys it" (trim, code points, placeholder-before-length, required, stored → replacement, no 4-char fragment quoted) | PASS |
| AC-6 | › "the form errors follow the scheme in force" › hidden controls ignored | PASS |
| AC-7 | › "the scheme is stated on every save" › key per choice, `null` for Inherit | PASS |
| AC-8 | › "sends the hidden controls as their reset value under v1 — never sign false" | PASS |
| AC-9 | › "resets the scheme on a deletion…"; › "blocks nothing on a deletion, v1 included" | PASS |
| AC-10 | source rule "a successful save invalidates exactly this device's webhook read" (scoped to the save block) | PASS |
| AC-11 | › "the scheme takes part in edit detection" | PASS |
| AC-12 | existing z8pmx9p135 payload tests on `OLD_SERVER` (six keys); › "omits the key for a server that predates it"; markup › "renders no scheme control for a server that predates it" | PASS |
| AC-13 | › "omits the key … for a value it does not know"; markup › unrecognised placeholder | PASS |
| AC-14 | › "\"currently sent\" cannot contradict the server"; markup › "says nothing is sent when the scheme is invalid" | PASS |
| AC-15 | › "leaving v1 lands on Signed" | PASS |
| AC-16 | › "does not block an inherited v1, and says what it costs instead"; markup › inherited v1 hides the legacy controls | PASS |

Every TC (TC-1 … TC-13) is exercised by the tests named above.

## Mutation pass

Each mutant was applied alone, the three relevant test files run, and the file
restored (`git diff --stat` confirmed the restore; the full suite was green
afterwards).

| # | Mutant | Result |
|---|---|---|
| 1 | placeholder check after the length check | killed |
| 2 | trim removed | killed |
| 3 | UTF-16 units instead of code points | killed |
| 4 | `unreported` sends the key | killed |
| 5 | `unrecognised` overwritten on an unrelated save | killed |
| 6 | `webhook_sign` under v1 taken from the mode | killed |
| 7 | Inherit suffix for an explicit scheme | killed |
| 8 | scheme dropped from the seed comparison | killed |
| 9 | inherited-v1 arm removed | killed |
| 10 | leaving-v1 preset removed | killed |
| 11 | `invalid` summary arm removed | killed |
| 12 | legacy controls rendered under v1 | killed |
| 13 | the save's invalidation removed | killed |
| 14 | the alert gated on `mayWrite` | killed |

## Scope check

`git status` on `src/` and the runtime files: exactly the seven files in
`plan.md > Files to change`. Nothing else under `src/` changed.

## Runtime impact (TR-3)

**No.** No deployment runtime file changed (`.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json`,
`index.html`). No new dependency, no new request.

## Recorded risks

- **Rollback** (security 8 / senior 12): a reverted UI misreports devices on
  v1. Move them back through the API first (`plan.md > Rollback`).
- **Pre-existing** (performance 5): `device-card.tsx` keeps one closed dialog
  mounted per card. Out of scope.
- **Not checkable in a browser**: the server's `AGENT_CALLBACK_KEY` rule. Its
  `400` is redacted, and the redacted sentence now points at the secret and the
  scheme. Mapping it to the field is ticket 17.

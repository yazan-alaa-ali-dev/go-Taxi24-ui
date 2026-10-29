---
ticket: z8pmx9pyre
stage: implement
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyre"
  github: ""
---

# Implementation — 15 · Device webhook: the signature scheme, and the effective scheme

Implemented on branch `ticket/device-webhook-signature-scheme` (cut from `main`
at `a50589c`) per `plan.md` revision 2. **No commit was created**: the changes
are uncommitted working-tree edits, and the one publishable commit is made by
`/publish-pr`.

## Files changed

| # | File | Change |
|---|---|---|
| 1 | `src/api/devices.ts` | `WebhookSignatureScheme`; `webhook_signature_scheme` on the read shape (as `string \| null`), `effective_webhook_signature_scheme` on `GET`, `webhook_signature_scheme` on the update payload. |
| 2 | `src/lib/device-webhook.ts` | New "Signature scheme" section: `schemeFrom`, `schemeKeyPayload`, `effectiveSchemeFrom`, `schemeOptionLabel`, `v1InForce`, `modeAfterSchemeChange`, `agentSecretError`, `inheritedV1Notice`, `effectiveSummary` and their constants. `webhookPayloadFrom`, `WebhookFields`/`webhookFieldsFrom`/`webhookFieldsDiffer`/`webhookFormEdited` and `webhookFormErrors` take the scheme. `WEBHOOK_SAVE_FAILED_REDACTED` names the secret and the scheme. |
| 3 | `src/lib/device-webhook.test.ts` | Existing z8pmx9p135 cases run on the old-server path (`OLD_SERVER`), which is AC-12's own assertion; 10 new `describe` blocks. |
| 4 | `src/features/devices/webhook-authentication.tsx` | **New.** `SchemeInvalidWarning` and `WebhookAuthentication`, hook-free; no secret crosses in. |
| 5 | `src/features/devices/webhook-authentication.test.tsx` | **New.** `renderToStaticMarkup` assertions. |
| 6 | `src/features/devices/webhook-dialog.tsx` | Scheme state seeded in `fill`; `v1InForce`; `onSchemeChange` with the leaving-v1 preset; `<SchemeInvalidWarning>` unguarded after the delivery switch; the Authentication box replaced by `<WebhookAuthentication>`; one help-text clause. |
| 7 | `src/lib/source-policy.test.ts` | One `describe`, three rules (save-scoped invalidation, unguarded alert, no secret in the section). |

## Deviations

1. **The signature header's name is never spelled in source** (owner decision,
   2026-10-29). The existing `z8pmx9mw2x` rule (`source-policy.test.ts:1928`)
   bans the string `X-Agent-Signature` from every shipped file, with an exemption
   list meant to stay empty forever. AC-4 as first written asked the dialog to
   show it by name; the first full run failed that rule. Asked whether to narrow
   the rule, the owner chose to **keep it as it is**. So the v1 contract lists
   "the signature header" by function and `X-Agent-Timestamp` /
   `X-Agent-Request-Id` by name; the signature header's name appears only as
   runtime data, in "Currently sent", from the server's
   `effective_webhook_header_name`. `spec.md` AC-4 and TC-4 were amended to say
   so. `AGENT_HMAC_V1_HEADERS` holds the two other headers only.
2. **The legacy notices moved below the controls.** The plain and
   inherited-plain warnings previously sat directly under the mode select; they
   now render in the section's notice list, beneath the header field — one list
   for both schemes, so the v1 notice (AC-16) has the same place. Wording
   unchanged.

## Validation run

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors; the 4 `only-export-components` warnings are pre-existing, none in a touched file |
| `npm run test` | **895 passed, 44 files** (baseline 853 / 43) |
| `npm run build` | `dist/index.html` 1,137.88 kB (gzip 448.93 kB) |
| Mutation pass | 14/14 killed — see `verify.md` |

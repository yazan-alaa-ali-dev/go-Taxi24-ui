---
ticket: z8pmx9pyre
stage: plan
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyre"
  github: ""
---

# Plan — 15 · Device webhook: the signature scheme, and the effective scheme

> **Revision 2.** Revision 1 was authored for the advisory review panel
> (`senior-reviewer`, `security-reviewer`, `performance-reviewer`) before any
> code was written. The panel returned **30 findings** across three lenses —
> **two major** — and every one is answered in **Panel response** at the end of
> this file. Eleven changed the design and are folded into the sections below;
> eight changed `spec.md` (`AC-15`, `AC-16` added; `AC-2`, `AC-3`, `AC-4`, `AC-5`,
> `AC-9`, `AC-14` reworded; `TC-12`, `TC-13` added).
>
> The findings that mattered most, each verified against the real files before
> being accepted:
>
> - **Leaving v1 silently downgrades to a verbatim secret** (security 1 / senior
>   3, raised independently). Revision 1 sent `webhook_sign: null` under v1, so a
>   later switch back seeds the mode as Inherit. When the deployment's
>   `WHATSAPP_WEBHOOK_SIGN` is `false`, the 32-character HMAC key then goes out
>   verbatim in a header — the exact case the reference warns about (§6, "send
>   `webhook_sign: true` explicitly when returning"). Neither existing safeguard
>   can see it: `inheritedPlainWarning` needs an *empty* secret and an effective
>   mode of plain, and under v1 the effective sign is always `true`.
> - **The AC-3 test had no settled home, and its fallback could not work**
>   (senior 1). `SOURCES` strips `role=` attributes (`stripAriaRole`,
>   `source-policy.test.ts:42`), so no source rule can see `role="alert"`, and
>   "not inside a `mayWrite` branch" was close to vacuous.
> - **The AC-10 rule would have been vacuous** (senior 2): the dialog calls
>   `invalidateQueries({ queryKey: deviceWebhookKey(deviceId) })` twice — in the
>   save and in the toggle — so a rule that only checks presence passes after the
>   save's call is deleted.

## Approach

Ticket 14 left the webhook surface in a shape this ticket only has to extend:
`src/api/devices.ts` types the read and write shapes, `src/lib/device-webhook.ts`
owns every decision as pure functions with a colocated test, and
`src/features/devices/webhook-dialog.tsx` binds state to them.

So the ticket is: **two optional read fields and one write field on the API
types, one more axis in the decision module, one extracted presentational
section, and the tests that keep them true.** No new request, no new dependency.

### The stored scheme has four reachable states, not three

| Stored `webhook_signature_scheme` | Form state | Select | Unrelated save | Deletion |
|---|---|---|---|---|
| `""` or `null` | `inherit` | Inherit | `null` | `null` |
| `"legacy"` / `"agent_hmac_v1"` | same | Legacy / Agent HMAC v1 | the value | `null` |
| **absent** (server predates the field) | `unreported` | **not rendered** | key **omitted** | key **omitted** |
| any other string (a newer server) | `unrecognised` | placeholder *"Unrecognised — kept as stored"* (`value=""`) | key **omitted** | `null` |

`unreported` makes AC-12 literal: a control the server would ignore is a claim
the UI cannot back, and omitting the key keeps the body at today's six keys —
including on a deletion (senior 5). `unrecognised` makes AC-13 safe: the key is
absent-preserving, so omitting it is the one body that cannot overwrite a value
this UI does not understand; but a **deletion** is not an unrelated save — it is
the full reset AC-9 asks for, so it sends `null` (senior 5). Once the operator
picks an option, the only way back to "kept as stored" is Reload or closing the
dialog; that is acceptable and stated (senior 8).

### The scheme in force decides which controls exist

Revision 1 tied the controls to the *selected* option only. That left Inherit
resolving to v1 showing legacy controls the server ignores — where choosing Plain
sends `webhook_sign: false`, which v1 rejects with a `400` the dialog must redact
(security 4, senior 6). Revision 2 decides from the **scheme in force**:

```ts
v1InForce(form, seeded, effective) =
  form === 'agent_hmac_v1' ||
  (form === 'inherit' && seeded === 'inherit' && effective === 'agent_hmac_v1')
```

The second arm is only known when the device *already* inherits and the server
said what that resolves to; the seed, not the live select, because the effective
value describes the last saved configuration. When v1 is in force:

- the mode select and header input are not rendered; the fixed v1 contract is;
- the body sends `webhook_sign: null` and `webhook_header_name: null` — a control
  the operator cannot see contributes nothing to the body;
- the header-name and mode validators return nothing.

Only an **explicit** Agent HMAC v1 **blocks** on the secret rules. Under an
inherited v1 the same rules render as a non-blocking notice (AC-16): inheriting is
the deployment's policy, as `authSecretError` already records for Inherit, but an
operator about to save a device into `invalid` is told before it happens.

### Leaving v1 lands on Signed, explicitly (the major)

When a scheme change takes v1 out of force, the mode is set to **Signed** in the
same state update (`modeAfterSchemeChange`, AC-15). The ticket's
`webhook_sign: null` under v1 is kept; the fix is where the downgrade actually
happens — on the way out. Signed is the reference's own instruction, it is
visible on screen, the operator can still choose another mode, and `plainWarning`
fires if they choose Plain. A device that already had a secret (every v1 device)
passes `authSecretError` for Signed.

### "Inherit (currently: X)" is only true when the device inherits

`effective_webhook_signature_scheme` is the **device's** effective scheme. The
suffix appears only when the seeded scheme is `inherit` and the effective value
is `legacy` or `agent_hmac_v1` — never `invalid` (the red alert already says it,
senior 7) and never an unrecognised string.

### The effective scheme read has five outcomes

`effectiveSchemeFrom` → `'legacy' | 'agent_hmac_v1' | 'invalid' | 'unrecognised' |
null`. An unknown string is kept apart from absent (security 3): it renders no
alert and no guessed description — the summary says the server reported a scheme
this dialog does not know. The "Currently sent" summary is one function,
`effectiveSummary`, with an arm per outcome; for `invalid` it says nothing is
being sent, so the screen cannot contradict the alert above it (security 2 /
senior 4).

### Validation layering

`webhookFormErrors` keeps its single-return shape and takes `scheme` and
`v1InForce`. Under an explicit v1: `headerName` → `null`; `auth` → `null`;
`secret` → the existing format rule (`secretError`) **first**, then
`agentSecretError`: empty → required; trimmed `=== 'secret'` → placeholder;
trimmed length in **code points** below 32 → length. Placeholder precedes length,
or `" secret "` would get the length message. Code points (`[...s].length`), not
UTF-16 units (security 5): of the three counts a server might use (code points,
UTF-16 units, bytes), code points is the smallest, so the client never accepts a
secret any of them would reject. Every message is a module constant, never a
template (security 7).

## Steps

### 1 — API types (`src/api/devices.ts`)

```ts
export type WebhookSignatureScheme = 'legacy' | 'agent_hmac_v1'
// DeviceWebhookSettings — read as a string: a newer server may send a value we do not know
webhook_signature_scheme?: string | null
// DeviceWebhookConfig — GET only
effective_webhook_signature_scheme?: string
// UpdateDeviceWebhookPayload — absent-preserving, like the header and sign
webhook_signature_scheme?: WebhookSignatureScheme | null
```

`AddDevicePayload` is not touched (out of scope).

### 2 — Decisions (`src/lib/device-webhook.ts`, a new "Signature scheme" section)

```ts
export type WebhookScheme = 'inherit' | 'legacy' | 'agent_hmac_v1'
export type WebhookSchemeState = WebhookScheme | 'unreported' | 'unrecognised'
export type EffectiveScheme = 'legacy' | 'agent_hmac_v1' | 'invalid' | 'unrecognised'

export const SCHEME_OPTIONS: readonly WebhookScheme[]
export const SCHEME_UNRECOGNISED_PLACEHOLDER: string
export function schemeFrom(stored: string | null | undefined): WebhookSchemeState
export function effectiveSchemeFrom(config: DeviceWebhookConfig): EffectiveScheme | null
export function schemeOptionLabel(option: WebhookScheme, seeded: WebhookSchemeState, effective: EffectiveScheme | null): string
export function v1InForce(form: WebhookSchemeState, seeded: WebhookSchemeState, effective: EffectiveScheme | null): boolean
export function modeAfterSchemeChange(wasV1: boolean, isV1: boolean, mode: WebhookAuthMode): WebhookAuthMode
export const AGENT_HMAC_V1_HEADERS, AGENT_HMAC_V1_SIGNED_STRING, AGENT_HMAC_V1_SECRET_MIN
export function agentSecretError(secret: string, source: 'replacement' | 'stored'): string | null
export const SCHEME_INVALID_WARNING: string
export function effectiveSummary(auth: EffectiveAuth | null, scheme: EffectiveScheme | null): { headerName: string | null; text: string }
```

Changes to existing functions, each additive:

- `webhookPayloadFrom` takes `scheme` and `v1: boolean` and applies the table
  above; under `v1` header and sign are `null`.
- `WebhookFields` gains `scheme`; `webhookFieldsFrom` fills it; `webhookFieldsDiffer`
  compares it; `webhookFormEdited` takes the form's `scheme`.
- `webhookFormErrors` takes `scheme` and `v1` and applies the layering above.
- `WEBHOOK_SAVE_FAILED_REDACTED` names the secret and the signature scheme among
  the things to check (security 6) — the likeliest v1 rejection is the
  server-only `AGENT_CALLBACK_KEY` rule, and the old sentence pointed at the
  header, which v1 hides.

`SCHEME_INVALID_WARNING` is neutral about who fixes it, because a read-only viewer
sees it too (security 9): *"The server reports this device's signature
configuration as invalid, so no events are delivered for this device until the
configuration is fixed. Someone allowed to change this webhook must correct the
signature scheme or the secret."*

### 3 — The section (`src/features/devices/webhook-authentication.tsx`, new)

Two hook-free exports, both testable through `react-dom/server`:

- **`SchemeInvalidWarning({ effective })`** — `null` unless `invalid`; otherwise a
  destructive box with `role="alert"`, `AlertTriangle` and the constant. No
  button, no dismiss (senior 1).
- **`WebhookAuthentication({...})`** — the "Authentication" box moved out of the
  dialog: the scheme select (absent when `unreported`;
  `value={scheme === 'unrecognised' ? '' : scheme}` so the placeholder shows),
  then either the fixed v1 contract (+ the AC-16 notice) or the existing mode
  select, its notices and the header input — moved verbatim, ids unchanged — then
  the summary from `effectiveSummary`. Props are booleans, strings, setters and
  error strings; **no secret** crosses into it (security 7). Setters are passed
  directly, no `memo` (performance 1, 2).

### 4 — The dialog (`src/features/devices/webhook-dialog.tsx`)

- `useState<WebhookSchemeState>('unreported')`, filled in `fill`.
- `effectiveScheme`, `v1 = v1InForce(scheme, seed.scheme, effectiveScheme)`.
- `onSchemeChange(next)` sets the scheme and `setMode(modeAfterSchemeChange(v1,
  v1InForce(next, …), mode))`.
- `<SchemeInvalidWarning effective={effectiveScheme} />` right after the delivery
  switch block, unguarded.
- `scheme`/`v1` passed to `webhookFormEdited`, `webhookFormErrors`,
  `webhookPayloadFrom`; the plain notices only when `!v1`.
- The secret help text gains: *"Agent HMAC v1 uses it as the HMAC key and needs at
  least 32 characters."*

### 5 — Tests

**`src/lib/device-webhook.test.ts`** (extended): TC-1, TC-2 (incl. `invalid` →
bare), TC-3 reader, TC-5 (incl. code points; every message checked against a
distinctive secret for any 4-character substring), TC-6, TC-7, TC-8, TC-10,
TC-11, TC-12, TC-13. The existing six-key test passes with `scheme:
'unreported'` — that **is** AC-12's body assertion.

**`src/features/devices/webhook-authentication.test.tsx`** (new): TC-3 markup
(`invalid` → `role="alert"`, no `<button`; `legacy` / `null` → `''`), TC-4 (v1
hides `device-webhook-mode` and `device-webhook-header`, shows the three headers
and the signed string; legacy the reverse; inherited v1 hides them too), TC-10
(no `device-webhook-scheme` when unreported; the placeholder when unrecognised).

**`src/lib/source-policy.test.ts`** (one new `describe`, three rules):

- the save mutation's own `onSuccess` invalidates `deviceWebhookKey(deviceId)` —
  matched inside the `const save = useMutation(` block up to `const toggle`
  (senior 2), exact key, not a prefix (performance 3);
- the dialog renders `<SchemeInvalidWarning` and the match is not preceded by
  `mayWrite &&`;
- `webhook-authentication.tsx` binds no secret identifier (`secret`,
  `secretToSend`, `replacementSecret`) (security 7).

## Files to change

| # | File | Change |
|---|---|---|
| 1 | `src/api/devices.ts` | **Edit.** One type alias, three optional fields. |
| 2 | `src/lib/device-webhook.ts` | **Edit.** New "Signature scheme" section; four functions take the scheme; one sentence widened. |
| 3 | `src/lib/device-webhook.test.ts` | **Edit.** New cases; existing calls gain `scheme`/`v1`. |
| 4 | `src/features/devices/webhook-authentication.tsx` | **New.** `SchemeInvalidWarning` and `WebhookAuthentication`, no hooks. |
| 5 | `src/features/devices/webhook-authentication.test.tsx` | **New.** Markup assertions. |
| 6 | `src/features/devices/webhook-dialog.tsx` | **Edit.** Scheme state, warning, section extracted, help-text clause. |
| 7 | `src/lib/source-policy.test.ts` | **Edit.** One `describe`, three rules. |
| 8 | `_specs/z8pmx9pyre/*` | The ticket artifacts. |

**Not touched:** `AddDevicePayload` / `create-device-dialog.tsx`, the query keys,
the WebSocket invalidation, `src/lib/permissions.ts`, every deployment runtime
file (NFR-4).

## Validation strategy

Profile **`ui-source`** (`typecheck`, `lint`, `test`) plus `npm run build`.
`verify.md` records: the suite against the baseline (**853 tests, 43 files**);
every AC mapped (`all-ac`); a **mutation pass** — placeholder check after the
length check, trim removed, `.length` for code points, `unreported` sending the
key, `unrecognised` sending `null` on an unrelated save, `webhook_sign` under v1
from the mode, the Inherit suffix for an explicit scheme, the scheme dropped from
the seed comparison, legacy controls under v1, the leaving-v1 preset removed, the
save's invalidation removed, the warning gated on `mayWrite` — each must fail the
suite; a `git diff --stat` against the list above; the runtime-impact statement.

## Rollback

`git revert` of the single publishable commit. The server-facing change is one
absent-preserving key, so an older UI keeps whatever is stored. **But a reverted
UI cannot read v1 devices** (security 8, senior 12): it shows legacy controls the
server ignores, describes `X-Agent-Signature` as an HMAC of the body, hides
`invalid`, and a Plain save gets a redacted `400`. Before reverting, devices on v1
should be moved back through the API (`webhook_signature_scheme: "legacy"` with
`webhook_sign: true`) — or that state accepted knowingly.

## Out of scope

As `spec.md > Out of scope`: secret generation and length counter (16), the
switch confirmation and per-field `400` mapping (17), `POST /devices`, receiver
code.

## Panel response

30 findings. **11 changed the design**, **8 changed `spec.md`**, the rest were
accepted as wording, test or constraint changes, or confirmed without change; **1 sub-point was declined with a reason**,
and **1 was recorded as risk**. Two lenses independently raised the leaving-v1
downgrade (security 1 / senior 3), the invalid-summary contradiction (security 2 /
senior 4), the Inherit-resolving-to-v1 gap (security 4 / senior 6) and the
rollback consequence (security 8 / senior 12). All four are fixed.

### senior-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | AC-3's markup test has no home; `stripAriaRole` makes a source rule blind to `role="alert"`; the `mayWrite` rule is near-vacuous. | **Accepted, design changed.** Verified `source-policy.test.ts:42,61`. `SchemeInvalidWarning` is a hook-free export render-tested for `role="alert"` / no `<button`; the source rule only pins that the dialog renders it unguarded. |
| 2 | minor | The AC-10 rule passes after deleting the save's invalidation — the toggle has the same call. | **Accepted, design changed.** Verified `webhook-dialog.tsx:211,232`. The match is scoped to the `save` block; "remove it" joins the mutation pass. |
| 3 | minor | Leaving v1 seeds Inherit and can put the key on the wire verbatim. | **Accepted, design changed** — see security 1. `modeAfterSchemeChange` presets Signed; AC-15, TC-12. |
| 4 | minor | `invalid` summary undefined; can read "signed" under a red alert. | **Accepted, design changed.** `effectiveSummary` has an `invalid` arm; AC-14 / TC-11 extended. |
| 5 | minor | Deletion vs `unreported`/`unrecognised` precedence unstated. | **Accepted.** Stated in the table and tested: clear + unreported omits; clear + unrecognised sends `null`. AC-9 reworded. |
| 6 | minor | Inherit-resolving-to-v1 + Plain gets an unreadable redacted `400`. | **Accepted, design changed** (beyond the suggested "record it"): v1 in force hides the legacy controls, so Plain cannot be chosen there; see security 4. |
| 7 | nit | "Inherit (currently: invalid)". | **Accepted.** Bare `Inherit`; TC-2 extended. |
| 8 | nit | The unrecognised→`value=""` mapping and no-way-back. | **Accepted.** Stated in Step 3 and the Approach; the placeholder is asserted. |
| 9 | info | Extraction justified; adding the file to the secret rule guards nothing as is. | **Confirmation.** Replaced with a rule that the section binds no secret identifier (security 7). |
| 10 | info | Scheme/seed integration sound; Reload re-seeds the scheme; clear skips validators. | **Confirmation, no change.** |
| 11 | info | `webhook_header_name: null` under v1 is consistent. | **Confirmation, no change.** |
| 12 | info | Rollback leaves v1 devices the old UI misreports. | **Accepted.** Rollback section rewritten. |

### security-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | v1 → legacy/inherit downgrade sends the v1 key verbatim when the inherited sign is false; no safeguard fires. | **Accepted, design changed.** Verified `device-webhook.ts:228-232, 376-383` and doc §6. Of the two fixes offered, presetting Signed on the way out was chosen over sending `webhook_sign: true` under v1: the ticket specifies `null` under v1, and the preset fixes the downgrade at the moment it happens, visibly. AC-15, TC-12. |
| 2 | minor | `invalid` summary contradicts the alert. | **Accepted** — see senior 4. |
| 3 | minor | An unknown effective value fails open to the legacy wording. | **Accepted, design changed.** `'unrecognised'` is a fifth outcome with its own neutral summary; no alert. |
| 4 | minor | Inherit can be saved into `invalid` unnoticed; Plain under inherited v1 is rejected. | **Accepted, design changed.** `v1InForce` covers inherited v1: legacy controls hidden, `agentSecretError` as a non-blocking notice. AC-16, TC-13. |
| 5 | minor | Trim explained but not enforced; `.length` counts UTF-16 units. | **Partly accepted.** Code-point counting adopted (AC-5, TC-5). Rejecting surrounding whitespace is **declined**: the ticket's TC-5 requires "32 chars with surrounding spaces counted after trim", and the server keys on the trimmed value. |
| 6 | minor | The redacted failure sentence points at the header, which v1 hides. | **Accepted.** The sentence names the secret and the signature scheme; still quotes nothing. |
| 7 | minor | The secret rule is narrower than the new code. | **Accepted.** v1 messages are constants; TC-5 checks every message against all 4-character substrings of a distinctive secret; a source rule bars secret identifiers from the section. |
| 8 | minor | Rollback misreports v1 devices. | **Accepted** — Rollback rewritten. |
| 9 | nit | "Check … the secret below" shown to read-only viewers. | **Accepted.** The wording is neutral about who fixes it. |
| 10 | nit | The AC-3 regex is formatting-fragile. | **Accepted** — see senior 1. |
| 11 | info | Unrecognised stored handling is fail-safe. | **Confirmation, no change.** |
| 12 | info | Not rendering the secret beats doc §8.1's mask/reveal. | **Confirmation, no change.** |
| 13 | info | Low blast radius; no runtime file. | **Confirmation, no change.** |

### performance-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | info | New per-render work is O(1); no `useMemo`. | **Confirmation, no change.** |
| 2 | info | Extraction is cost-neutral; no `memo`; pass setters directly. | **Accepted** as a constraint in Step 3. |
| 3 | info | No new request; fan-out stays one exact key. | **Accepted.** The AC-10 rule pins the exact key, not a prefix. |
| 4 | info | Bundle impact negligible; reuse `lucide-react`. | **Confirmation, no change.** |
| 5 | nit | `device-card.tsx` keeps one closed dialog per card mounted. | **Recorded as risk, out of scope.** Pre-existing; a separate ticket if the grid grows. |

---
ticket: z8pmx9pyrj
stage: plan
mode: standard
status: complete
owner: developer
updated: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyrj"
  github: ""
---

# Plan — 17 · Device webhook: confirm a scheme switch, explain rejections per field

> **Revision 2.** Revision 1 was reviewed by the advisory panel
> (`senior-reviewer`, `security-reviewer`, `performance-reviewer`) before any
> code was written. The panel returned **31 findings** (2 major); every one is
> answered in **Panel response** at the end. The ones that changed the design:
>
> - **The confirmation is a boolean, reset on every scheme or URL change**
>   (senior 1, 2; security 3, 4; performance 1, 4). Revision 1 stored the
>   switch and matched it by value; the footer Save could be left disabled with
>   no panel on screen, and an old panel could re-appear without a new Save
>   press. One predicate — `showSwitch` — now drives the panel, the footer
>   Save's disabling and the Confirm guard, and Confirm is also disabled while
>   the save is pending.
> - **Switching to v1 with a secret already sent verbatim** (security 1, major)
>   now asks for a new secret inside the confirmation: v1's signature proves
>   nothing when the key has travelled as a header value.
> - **The confirmation copy is computed live**, every render the panel is shown
>   (security 5, performance 3), so it never describes a stale mode or secret.
> - **`webhookRejectionFrom` type-checks `code` and `message`** (security 6) and
>   is tested against the plain `ApiError` the interceptor actually rejects with
>   (security 7, senior 4). The callback-key prefix no longer spells the server
>   environment variable (security 10).

## Approach

Ticket 15 left the surface in the shape this ticket extends:
`src/lib/device-webhook.ts` owns every decision as a pure function with a
colocated test, `src/features/devices/webhook-authentication.tsx` is the
hook-free section `react-dom/server` can render, and
`src/features/devices/webhook-dialog.tsx` binds state to both.

So the ticket is **three more decisions in the module, one more presentational
block, and the dialog wiring** — no new request, no new dependency, no runtime
file.

### 1. Which scheme is in force — before and after the save

A confirmation is owed when the scheme deliveries are *signed under* changes,
not when the select merely moves. So both ends are resolved to a concrete scheme
or to "not known here":

```ts
type ResolvedScheme = 'legacy' | 'agent_hmac_v1'

// form ∈ legacy | agent_hmac_v1 → itself
// form = inherit → the effective value, only when the seed inherits and the
//                  server reported legacy / agent_hmac_v1 (same rule as
//                  schemeOptionLabel and v1InForce); otherwise null
// unreported / unrecognised → null
resolvedScheme(form, seeded, effective): ResolvedScheme | null

interface SchemeSwitch { from: ResolvedScheme | null; to: ResolvedScheme | null }

schemeSwitchFrom({ url, scheme, seeded, effective }): SchemeSwitch | null
```

`schemeSwitchFrom` returns `null` (no confirmation) when:

- the URL is empty — the deletion has its own confirmation, and stacking a
  second one on the destructive path adds nothing (AC-4);
- the server does not report the field (`scheme === 'unreported'`) (AC-13);
- the form is `unrecognised` (the key is omitted — nothing changes);
- `scheme === seeded` — the select was not moved (AC-3, "URL only");
- both ends resolve and are equal — e.g. a device inheriting Legacy set to
  Legacy explicitly (AC-3).

Otherwise it returns `{ from: resolvedScheme(seeded, seeded, effective), to:
resolvedScheme(scheme, seeded, effective) }`. A `null` end means "may change":
moving an explicit device to Inherit (the deployment default is not visible),
or choosing a scheme on a device whose stored value is unrecognised or whose
inherited default was never reported. Those are confirmed with "may" wording
rather than skipped — skipping would be fail-open on exactly the case the
operator cannot see.

### 2. The confirmation copy is a function of the switch

`schemeSwitchConfirmation(sw, warning)` returns `{ title, lines, action }`, all
constants plus the passed-in warning (`warning` is the verbatim warning for a
Legacy or unresolved target, and the exposed-secret warning for a v1 target —
§3). The v1 copy reuses `AGENT_HMAC_V1_HEADERS` / `AGENT_HMAC_V1_SIGNED_STRING`
rather than repeating the literals.

| `to` | Title | Specific line(s) | Action label |
|---|---|---|---|
| `agent_hmac_v1` | Switch this device to Agent HMAC v1? | receiver must already verify the signature header (described by function — NFR-4), `X-Agent-Timestamp`, `X-Agent-Request-Id`, HMAC over `timestamp.request_id.raw_body`; otherwise every delivery fails | Switch to Agent HMAC v1 and save |
| `legacy` | Switch this device to Legacy? | receiver must accept Legacy deliveries (the header and mode below); Legacy has no replay protection; + `verbatimWarning` | Switch to Legacy and save |
| `null` | Change this device's signature scheme? | Inherit follows a deployment default this dialog cannot see, so the scheme may change; + `verbatimWarning` | Change the scheme and save |

Every variant also carries two shared lines: **immediacy** ("takes effect on
the next event after you save; no grace period, and the server cannot send both
schemes at once") and **one scheme per endpoint** ("a receiver that accepts
both can be downgraded by anyone able to send it a legacy-signed request").

### 3. The verbatim warning — complete, and never a guess

Leaving v1 already presets Signed (`modeAfterSchemeChange`, ticket 15; AC-5 is
covered and re-asserted). What is missing is the warning when the legacy mode
would still put a secret on the wire verbatim (AC-6):

- **Plain chosen** — `plainWarning` (unchanged).
- **Inherit resolving to plain** — `inheritedPlainWarning` is widened:

```ts
inheritedPlainWarning({ mode, seededSign, leavingV1, effective, secretToSend })
//  mode !== 'inherit'                       → null
//  leavingV1                                → UNKNOWN_DEFAULT_MODE warning
//  seededSign !== null                      → null  (effective is the device's own)
//  effective?.mode !== 'plain'              → null
//  secretToSend === ''                      → today's deployment-wide sentence
//  otherwise                                → NEW: this device's own secret verbatim
```

Two corrections to today's function are deliberate and recorded:

1. Today it returns `null` when the device **has** a secret — but that secret is
   then the one sent verbatim, which is the exact risk §6 describes. It now
   warns.
2. Today it trusts `effective_webhook_sign` even when the stored sign is
   explicit, where that value describes the device's own choice, not the
   default; the "server default is plain" claim could then be false. It now
   requires `seededSign === null`, the same rule `schemeOptionLabel` uses.

`leavingV1` is `v1InForce(seeded, seeded, effective) && !v1`: under v1 the
server's effective sign describes nothing about the legacy default, so a switch
back with the mode returned to Inherit gets an honest "not visible here, may be
plain — choose Signed to be sure" warning instead of silence.

The confirmation receives `plainWarning(...) ?? inheritedPlainWarning(...)` for
the `legacy` and `null` targets (AC-7).

**The reverse direction: a key that has already travelled verbatim** (security
1). Switching *to* v1 while keeping a secret that was sent as a plain header
value leaves v1's signature worthless — whoever saw one legacy delivery holds
the HMAC key. So the v1 confirmation carries a constant warning asking for a new
secret when:

```ts
exposedSecretWarning({ to, seededSign, seededV1, effective, replacing, hasStoredSecret })
//  to !== 'agent_hmac_v1' || replacing || !hasStoredSecret   → null
//  seededSign === false                                      → EXPOSED_SECRET
//  seededSign === null && !seededV1 && effective?.mode === 'plain' → EXPOSED_SECRET
//  otherwise                                                 → null
```

It takes booleans, never the secret, so no secret identifier crosses into it.
Not blocking — the operator may rotate on the receiver later — but stated at the
moment of the decision (AC-14, TC-11).

### 4. Server rejections per field — a fixed table, keyed on the message prefix

```ts
type WebhookField = 'url' | 'secret' | 'scheme' | 'sign' | 'headerName'
interface WebhookRejection { field: WebhookField; text: string }

const REJECTIONS: readonly { prefix: string; field: WebhookField; text: string }[]

webhookRejectionFrom(error): WebhookRejection | null
//   const { status, code, message } = toApiError(error)
//   typeof code / message !== 'string'                 → null  (a malformed body never throws in onError)
//   status !== 400 || code !== 'BAD_REQUEST'          → null
//   first REJECTIONS entry with message.startsWith(prefix) → { field, text }
//   otherwise                                          → null
```

The table (reference §11; `Invalid request body` is `POST`-only and stays
redacted):

| Prefix | Field | Client sentence (gist) |
|---|---|---|
| `webhook_url is required` | url | the server received no URL — enter one |
| `webhook_signature_scheme must be one of` | scheme | choose Inherit, Legacy or Agent HMAC v1 |
| `webhook_signature_scheme must be a string or null` | scheme | same |
| `webhook_signature_scheme agent_hmac_v1 requires a webhook_secret` | secret | v1 needs this device's own secret, ≥ 32 characters, or choose another scheme |
| `webhook_secret: an agent_hmac_v1 key must be at least 32 characters` | secret | refused as too short — enter a new secret of ≥ 32 characters |
| `webhook_secret: an agent_hmac_v1 key may not be the shipped placeholder` | secret | the placeholder is refused — enter a real secret |
| `webhook_secret: an agent_hmac_v1 key may not equal an ` (the server's environment-variable name is deliberately not spelled in the bundle) | secret | already used as an inbound callback key — enter a new secret unique to this device |
| `webhook_signature_scheme agent_hmac_v1 cannot be combined with webhook_sign=false` | sign | the scheme in force for this device is v1, which refuses Plain — choose Signed or Inherit |
| `webhook_sign must be true, false or null` | sign | choose Inherit, Signed or Plain |
| `webhook_sign requires a non-empty webhook_secret` | secret | Signed needs a secret for this device |
| `webhook_secret must be at most 4096 characters` | secret | at most 4096 characters |
| `webhook_secret must not contain control characters` | secret | no line breaks or other control characters |
| `webhook_header_name must be at most 128 characters` | headerName | at most 128 characters |
| `webhook_header_name must be a valid HTTP header field name` | headerName | letters, digits and the token symbols only |
| `webhook_header_name may not be "` | headerName | set by the transport — choose another (the name is **not** quoted back from the server text) |

Rules that keep NFR-1 true:

- The output is `hit.text` — a module constant. The server's message is only
  ever an argument to `startsWith`; it reaches no return value.
- Prefixes are compared exactly (case-sensitive, no trimming): the catalogue is
  the server's fixed text, and a looser match is how a message meant for one
  field lands under another. `webhook_sign ` (with the space) never matches
  `webhook_signature_scheme …`; a unit test asserts every catalogue message
  matches **exactly one** prefix.
- Matching requires HTTP `400` **and** `code === 'BAD_REQUEST'` (AC-12).
  `toApiError` already takes `status` from `error.response.status`, never from
  the body; a test pins that a body `status: 200` changes nothing.
- `webhookSaveFailure` and `WEBHOOK_SAVE_FAILED_REDACTED` are unchanged and
  still decide everything that is not a field rejection (AC-11).

Placement (AC-9) is a pure function too:

```ts
rejectionShownAt(field, { v1, schemeShown }): WebhookField | 'form'
//  headerName | sign under v1      → 'form'  (those controls are not rendered)
//  scheme when !schemeShown        → 'form'
//  otherwise                       → field
```

Beside Save the dialog shows either the sentence itself (`'form'`) or a pointer
`The webhook was not saved — see the message under “<label>”.` using a fixed
label map.

### 5. Dialog wiring

New state: `rejection: WebhookRejection | null` and `confirmingScheme: boolean`.

```ts
const schemeSwitch = schemeSwitchFrom({ url, scheme, seeded: seededScheme, effective: effectiveScheme })
// ONE predicate for the panel, the footer Save's disabling and the Confirm guard.
const showSwitch = confirmingScheme && schemeSwitch !== null
const blocked = invalid || changedElsewhere

onSubmit:
  setFailure(null); setRejection(null)
  if (blocked) return
  if (clear && !confirmingClear) { setConfirmingClear(true); return }   // unchanged
  if (schemeSwitch) { setConfirmingScheme(true); return }               // NEW — never sends
  save.mutate()

confirmSwitch (panel button):
  if (!showSwitch || blocked || save.isPending) return
  setFailure(null); setRejection(null)
  save.mutate()
cancelSwitch (panel button): setConfirmingScheme(false)
```

- **A scheme switch is sent only from the panel's Confirm button.** `onSubmit`
  never sends while `schemeSwitch` is set, so a double-click on Save or Enter in
  a text field cannot confirm. The footer Save is disabled on `showSwitch` (and
  on its existing conditions); Confirm is disabled on `blocked ||
  save.isPending`, and its handler re-checks all three.
- **The confirmation is reset on every scheme change and every URL change**
  (`onSchemeChange`, the URL `onChange`), and by `fill()` and the close effect.
  An old panel therefore never re-appears without a new Save press (AC-4), and
  moving the scheme back to the seed cannot leave Save disabled with no panel —
  `schemeSwitch` becomes `null`, so `showSwitch` is false. A WebSocket re-read
  that re-resolves the ends simply changes the live copy (or, under an edit,
  triggers the existing changed-elsewhere hold, which sets `blocked`).
- **The copy is live.** `schemeSwitchConfirmation(schemeSwitch, warning)` is
  called only inside the `showSwitch` render branch, every render — a mode or
  secret changed under an open panel is reflected in its warning.
- **After a failed confirmed save the panel stays open** with the rejection
  shown, so the operator fixes the field and presses Confirm again; Confirm
  clears the old rejection before sending.

`onError` of the save:

```ts
const rejected = webhookRejectionFrom(error)
if (rejected) setRejection(rejected)
else setFailure(webhookSaveFailure(error) === 'redacted' ? WEBHOOK_SAVE_FAILED_REDACTED : toActionErrorMessage(error))
```

A rejection is cleared when its field changes (AC-10), with a functional update
that returns the same reference when nothing matches, so a keystroke adds no
render (performance 2):

```ts
const clearRejection = (...fields: WebhookField[]) =>
  setRejection((current) => (current && fields.includes(current.field) ? null : current))
```

Called from the URL `onChange`, the replacement-secret `onChange`,
`onSchemeChange` (`'scheme', 'sign'` — a scheme change can move the mode), and
two **new wrapper handlers** `onModeChange` (`'sign'`) and
`onHeaderNameChange` (`'headerName'`) replacing today's direct `setMode` /
`setHeaderName` pass-through (senior 7). A rejection never feeds `invalid`, so
it never disables Save.

Rendering: the URL and secret sentences render in the dialog; the secret input's
`aria-invalid` becomes `errors.secret !== null || rejectedAt === 'secret'`
(senior 6). `WebhookAuthentication` gets a `schemeError` prop rendered under the
select, which also gets `aria-invalid`; the existing `authError` /
`headerNameError` props receive `client error ?? field rejection`. Beside Save:
the sentence itself when `rejectedAt === 'form'`, else the pointer.

### 6. The confirmation block is a hook-free export

`SchemeSwitchConfirmation({ title, lines, action, onCancel, onConfirm,
disabled })` in `webhook-authentication.tsx`, beside `SchemeInvalidWarning`:
`role="alert"` so a screen reader announces it, the lines as a list, Cancel
`type="button" variant="outline"`, Confirm `type="button" variant="destructive"`
showing the action label. Every string arrives as a prop built in
`device-webhook.ts`; the file's whole-word ban on secret identifiers
(`source-policy.test.ts:2155-2163`) keeps holding, and the field-placement logic
stays in the dialog (security 10).

## Steps

1. `device-webhook.ts` — `ResolvedScheme`, `SchemeSwitch`, `schemeSwitchFrom`,
   `schemeSwitchConfirmation`, `exposedSecretWarning`; widen
   `inheritedPlainWarning` to the object signature; `WebhookField`,
   `WebhookRejection`, `REJECTIONS`, `webhookRejectionFrom`, `rejectionShownAt`,
   the label map and the pointer sentence.
2. `device-webhook.test.ts` — TC-1, TC-2, TC-4…TC-11; move the existing
   `inheritedPlainWarning` assertions to the new signature (the own-secret case
   flips from `null` to the new warning — intended).
3. `webhook-authentication.tsx` — `schemeError` prop (+ `aria-invalid`);
   `SchemeSwitchConfirmation` export.
4. `webhook-authentication.test.tsx` — TC-3: `role="alert"`, both buttons
   `type="button"`, the action label, the lines, Confirm `disabled` when told;
   `schemeError` renders under the select only when the select exists.
5. `webhook-dialog.tsx` — §5: the two states, `showSwitch`, `confirmSwitch` /
   `cancelSwitch`, the resets (scheme change, URL change, `fill`, close), the
   `onError` split, `clearRejection` and the two wrapper handlers, the render.
6. `source-policy.test.ts`:
   (a) scoped to the save's `useMutation` block, `onError` calls
   `webhookRejectionFrom(error)` and `webhookSaveFailure(error)`; the dialog
   contains no `toApiError` at all (senior 5);
   (b) inside the extracted `onSubmit` block, `if (schemeSwitch)` precedes
   `save.mutate()` (senior 11);
   (c) the close effect resets `setConfirmingScheme(false)` and
   `setRejection(null)` (performance 8);
   (d) the no-interpolation rule is widened to any `${…}` expression naming
   `secret`, `secretToSend`, `replacementSecret` or `storedSecret`, for
   `device-webhook.ts` and the dialog (security 2).
7. `typecheck`, `lint`, `test`; mutation pass.

## Files to change

| File | Change |
|---|---|
| `src/lib/device-webhook.ts` | edit — decisions above |
| `src/lib/device-webhook.test.ts` | edit — TC-1, 2, 4–11 |
| `src/features/devices/webhook-authentication.tsx` | edit — `schemeError`, `SchemeSwitchConfirmation` |
| `src/features/devices/webhook-authentication.test.tsx` | edit — TC-3 |
| `src/features/devices/webhook-dialog.tsx` | edit — wiring |
| `src/lib/source-policy.test.ts` | edit — four rules |

No deployment runtime file. No new file.

## Validation strategy

Profile `ui-source` (`typecheck`, `lint`, `test`). Every AC is mapped to a test
case in `spec.md`; `verify.md` maps each to its result. A mutation pass confirms
the tests bite: flip a prefix; drop the `code` check; drop the `typeof` guard;
return the message instead of the text; remove the `scheme === seeded`
short-circuit; send from `onSubmit`; drop the Confirm `isPending` guard; drop
the `seededSign` guard; drop the leaving-v1 branch; drop the exposed-secret
`seededSign === false` arm; remove a close-effect reset.

## Rollback

Revert the single commit. The change is UI-only and stateless: no stored value
is written differently (the payload builder is untouched), so a rollback
restores the one-click save and the single redacted sentence with nothing to
migrate.

## Risks

- **Catalogue drift.** If the backend rewords a message, it silently falls back
  to the redacted sentence — fail-safe, never a wrong field. Recorded, not
  mitigated beyond the exact-prefix table.
- **"May change" fatigue.** Moving an explicit device to Inherit always asks,
  because the default is invisible. Acceptable: a scheme switch is rare and its
  failure mode is every delivery failing.

## Out of scope

As `spec.md`: no `Generate secret`, no grace window, no change to the delivery
switch, no other surface.

## Panel response

Every finding was checked against the real files before being answered.

### senior-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | Footer Save disabled on `confirmingSwitch !== null` can lock the form after the scheme is moved back; Confirm does not re-check the switch. | **Accepted, design changed.** `confirmingScheme` is a boolean reset on every scheme/URL change; one predicate `showSwitch` drives panel, Save disabling and the Confirm guard (§5). `sameSchemeSwitch` dropped. |
| 2 | minor | Value-matched binding re-opens an old panel without a new Save press. | **Accepted** — fixed by the same reset (AC-4). |
| 3 | minor | Confirm does not clear `failure`/`rejection`; panel state after a failed save unstated. | **Accepted.** Confirm clears both before sending; the panel stays open after a failure (§5). |
| 4 | minor | TC-9 tests `AxiosError`, but `onError` receives the interceptor's plain `ApiError`. | **Accepted.** TC-9 runs both shapes; spec TC-9 extended. |
| 5 | minor | "Never reads `.message`" is bypassable by destructuring. | **Accepted.** Rule (a): the dialog contains no `toApiError`; assertions scoped to the save block. |
| 6 | minor | `aria-invalid` does not follow for the secret, mode and scheme. | **Partly accepted.** Secret input and scheme select gain it. The mode `Select` keeps none, as today — its message renders directly beneath it; recorded. |
| 7 | minor | Mode/header handlers are direct setters today. | **Accepted.** Two wrapper handlers listed in Step 5. |
| 8 | info | `inheritedPlainWarning` change is visible in the always-on notices. | **Accepted.** Recorded as an intended visible change in `implement.md`. |
| 9 | info | Switch resolution and deletion path sound. | **Confirmation, no change.** |
| 10 | info | Prefixes match §11; `webhook_url is required` unreachable but harmless. | **Confirmation.** Kept (AC-8); the two scheme-type rows kept separate for a 1:1 table with §11. |
| 11 | info | Rule 6(b) is regex-fragile; assert ordering inside `onSubmit`. | **Accepted.** Rule (b) asserts `if (schemeSwitch)` precedes `save.mutate()` within `onSubmit`; the mutation pass proves it. |
| 12 | info | Rollback and the no-secret rule for the section hold. | **Confirmation, no change.** |

### security-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | major | Switching to v1 keeps a secret already sent verbatim; v1's protection is then illusory. | **Accepted, design changed.** `exposedSecretWarning` (booleans only) adds a "enter a new secret" line to the v1 confirmation. Spec: AC-7 reworded, AC-14 and TC-11 added. Not blocking — rotation may be coordinated with the receiver. |
| 2 | minor | The object signature weakens the no-interpolation regex. | **Accepted.** Rule (d) widened to any `${…}` naming a secret identifier. |
| 3 | minor | Confirm not disabled while pending. | **Accepted** (also performance 1). |
| 4 | minor | Panel / Save / Confirm on different predicates. | **Accepted** — single `showSwitch` (senior 1). |
| 5 | minor | Copy may be stale if computed at open. | **Accepted.** Computed live, every render of the panel. |
| 6 | minor | `startsWith` on an unchecked body field can throw. | **Accepted.** `typeof` guards; TC-9 covers non-string `message`/`code`. |
| 7 | minor | TC-9 misses the production error shape. | **Accepted** (senior 4). |
| 8 | info | No server text reaches the DOM. | **Confirmation.** TC-7 keeps "exactly one prefix" and "no message/suffix in output", with a secret-like suffix. |
| 9 | info | Callback-key equality is an oracle. | **Recorded.** It already exists at the API; the server is the control. Out of scope. |
| 10 | info | Avoid spelling the server env-var name; keep `'secret'` literals out of the section file. | **Accepted.** Prefix truncated before the name; placement stays in the dialog. |
| 11 | info | Downgrade cases otherwise covered; extend the mutation pass. | **Accepted.** Mutation list extended. |

### performance-reviewer

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | minor | Confirm can fire twice while pending. | **Accepted.** `disabled={blocked \|\| save.isPending}` plus a handler guard; "Confirm fires twice" in the mutation pass. |
| 2 | minor | `clearRejection` per keystroke must not force a render. | **Accepted.** Functional update returning the same reference. |
| 3 | info | Build the confirmation lazily. | **Accepted.** Only inside the `showSwitch` branch. |
| 4 | info | Derived state is right; compare by value. | **Superseded** by the boolean (senior 1) — no comparison remains. |
| 5 | info | A WebSocket re-read can change the panel. | **Accepted, recorded.** The copy is live; under an edit the changed-elsewhere hold blocks Confirm. |
| 6 | info | No new request or fan-out. | **Confirmation, no change.** |
| 7 | info | Bundle negligible; reuse the v1 constants. | **Accepted.** |
| 8 | nit | Reset both new states in `fill()` and on close. | **Accepted.** Rule (c) pins the close effect. |

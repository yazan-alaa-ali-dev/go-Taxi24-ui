---
ticket: z8pmx9mw2x
stage: plan
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mw2x"
  github: ""
---

# Plan — 14 · Toggling the agent's debug collection for one number

> **Revision 2.** Revision 1 was authored for the advisory review panel
> (`senior-reviewer`, `security-reviewer`, `performance-reviewer` — the lenses
> `/review` dispatches) before any code was written. The panel returned **36
> findings** across the three lenses, **five of them raised independently by two
> or three lenses**, and every one is answered in **Panel response** at the end of
> this file. Twenty-one changed the design and those changes are folded into the
> sections below; five changed `spec.md` (`AC-3`, `AC-13` and `AC-36` reworded,
> `AC-50` and `AC-51` added with `TC-11` and `TC-12`, and `REQ-13` realigned).
>
> The findings raised more than once are the ones that mattered most:
>
> - **A rule that contradicted the plan's own code** (senior 1 / security 4) —
>   revision 1 banned the agent's environment-variable names across `src/` with
>   an allowlist "expected to stay empty forever", and then specified a rendered
>   sentence containing two of them as string literals. It would have failed on
>   the commit that introduced it.
> - **"Nothing changed" claimed for failures nobody classified** (senior 2 /
>   security 2) — the axios client times out at 45 s and a proxy in front of GOWA
>   can mint a 5xx with no envelope, both of which can happen *after* the command
>   reached the agent. Revision 1 reported all of them as `applied: 'no'`, which
>   is the exact false claim `AC-39` exists to prevent.
> - **A rendering test that would have thrown rather than asserted** (senior 3 /
>   security 12) — `ChatControls` calls `useQueryClient()` above its early return,
>   so `renderToStaticMarkup` without a provider throws. Copying
>   `message-diagnostics.test.tsx`'s "no provider is itself the assertion"
>   comment would have been wrong here.
> - **A UI decision taken from untrusted server prose** (senior 10 / security 9) —
>   deciding *where* to render a message by substring-matching the server's own
>   wording lets whatever answered the request choose the UI's layout.
> - **The expiry timer** (performance 2 / senior 6 / security 5) — three lenses,
>   three different objections, and the answer changed the design three ways.

## Approach

Everything this ticket needs already exists except the call itself: the
permission constant (`PERMISSIONS.ADMIN_DEBUG_TOGGLE`), the same-origin axios
client that attaches `X-Device-Id` and the bearer, the error envelope reader
(`toApiError`), the text-sanitising cap (`displayText`), the dialog primitives,
and the actions menu the control belongs in. So the ticket is: **one API module,
one pure decision module, one JID helper, one dialog, and three small edits**.

The dominant constraint is the same one tickets 12 and 13 were shaped by: **this
repository has no component renderer in its test environment** — no jsdom, no
React Testing Library, and adding one would add a dependency to a build that
inlines everything into a single `dist/index.html`. A decision written inline in
JSX is a decision no test can reach. So every decision this feature makes is a
pure function with a colocated test, and the claims that are genuinely about
*output* are asserted on real markup through `react-dom/server`, as
`message-diagnostics.test.tsx` does.

Nine decisions are forks this ticket could have taken, and the reasons it did
not:

1. **The surface is an action, not a switch — and the component shape enforces
   it.** There is no endpoint that reads "is debug on for this number", so a
   `<Switch>` would be a control whose position is a claim the UI cannot
   support, and whose `onCheckedChange` would send an `enabled` inferred from
   that claim. The menu therefore offers **two separately-labelled items** that
   each carry their own literal `enabled`, and the word "on"/"off" the operator
   read is the word that travels. This is AC-10 and AC-23 expressed as a shape
   rather than as a comment.

2. **`enabled` is a required field of the request type, and the duration is a
   *parsed* type rather than a number.** `toggleAgentDebug` takes
   `{ phone, enabled: boolean, ttl: TtlField }`, where `TtlField` is
   `{ kind: 'omit' } | { kind: 'minutes'; minutes: number }`. A call site that
   forgets `enabled` does not compile; a call site that hand-rolls a duration
   (`+raw`, `raw * 1`, `~~raw`, a literal) does not compile either. Revision 1
   defended both with a textual rule banning `Number(`/`parseInt(`/`parseFloat(`
   in the dialog, which is shape-matched and trivially evadable (security 6): a
   rule that bans three spellings of a thing the type system can forbid outright
   is decoration. The textual rule survives as a second line of defence, not as
   the guarantee.

3. **The wire spelling `ttl_minutes` exists in exactly one file.** `src/api/agent.ts`
   translates the parsed `TtlField` into the body — `ttl_minutes` present only
   for the `minutes` arm, the key **absent** otherwise. This is the containment
   `include_debug` already has one ticket over (senior 8), and for the same
   reason: a rule stated in prose decays, and the translation makes the rule true
   rather than allowlisted.

4. **The chat actions menu owns its own absence, gains a second reason to exist,
   and is memoised.** `ChatControls` is rendered today only when `mayWriteChats`
   — so an administrator holding `admin.debug.toggle` but not `chats.write` would
   have no menu to put the item in. Those are independent permissions (AC-8 makes
   the same point about `messages.debug.read`), and a permission set is not
   derivable from a role name. So `MessageView` renders `<ChatControls>`
   unconditionally and the component returns `null` when it has nothing to offer.
   Because it now mounts for **every** principal inside a component that
   re-renders on every composer keystroke, it is wrapped in `memo()`
   (performance 1, 3): `chat` is `selected`, a `useState` object with a stable
   identity, and the other two props are bare booleans — the memo holds exactly
   as `MessageBubble`'s does.

5. **The phone is derived by the JID module, not by a second parser, and the
   allow-list is tighter than revision 1's.** `src/lib/jid.ts` already owns this
   vocabulary — `JID_TYPES`, `composeJid`, `isStatus` — and a second module that
   also splits on `@` is the duplication that eventually disagrees with the
   first. `phoneFromJid` is `composeJid`'s inverse and lives beside it. Two
   tightenings came from the security lens (finding 10): the local part is cut at
   the first `.` **or** `:`, because the whatsmeow/Baileys spelling of an
   agent-suffixed JID is `<digits>.<agent>:<device>@s.whatsapp.net` and AC-15
   names the agent suffix; and a local part with a **leading zero** is refused,
   because `0096393…` prefixed with `+` is not E.164 and a malformed guess here
   is a request against somebody else's phone.

6. **The failure vocabulary is data, and its default is "unknown".** The
   reference's error table for this endpoint is fixed (§12) and is mapped in the
   decision module the way `auth-messages.ts` maps §02's table. Revision 1's
   default arm claimed `applied: 'no'` for anything it did not recognise; that is
   now inverted (senior 2, security 1, security 2). **`'no'` is claimed only for
   the failures the reference documents as happening before the upstream call.**
   Everything else — a client abort at the 45-second axios budget (`status: 0`),
   a proxy's envelope-less 5xx, `AGENT_UPSTREAM_TIMEOUT`, and
   `AGENT_UPSTREAM_INVALID_RESPONSE` (a **2xx** whose body was unreadable, so the
   omni accepted the command) — is reported as **unknown**. Telling an operator
   that nothing changed is a claim, and this UI makes it only where the server's
   own catalogue supports it.

7. **Nothing this UI renders about the number comes from untrusted text.** Two
   changes, both from the security lens. The echoed `phone` is accepted only when
   it is itself well-formed E.164 (finding 3), otherwise the value the UI sent is
   shown — so a bidi override or a five-kilobyte string in an upstream body this
   proxy returns *unmodified* cannot land in the one sentence naming which
   customer's number was changed. And the `VALIDATION_ERROR` arm no longer
   decides *where* to render its message by substring-matching the server's own
   prose (finding 9, senior 10): the field placement is gone, and AC-34's
   "otherwise as a general failure" is what is implemented.

8. **The dialog latches its number when it opens.** `useState(() => phone)`, the
   same latch `DiagnosticsPanel` uses for its source and for the same reason: it
   makes "the number shown is the number sent" true by construction rather than
   by relying on `key={selected.jid}` in `chats.tsx` to remount the subtree
   (security 8). The `key` is additionally asserted in the source block, because
   an invariant worth depending on is an invariant worth pinning.

9. **The expiry is forgotten by one pure decision and one effect, and forgetting
   it drops the whole claim.** Three lenses disagreed here and the answer took
   something from each: the delay decision is lifted into a pure, unit-tested
   `expiryDelay` (performance 2 — revision 1's `2 ** 31 - 1` overflow branch was
   an unreachable component branch, and senior 6 was right that an unreachable
   branch is not a guarantee; as a pure function it is simply a test case); the
   timer is armed in a `useEffect` keyed on the epoch **with a cleanup**, so a
   *Try again* or a second success in the same dialog cannot race two timers
   (performance 2); and when it fires the **entire** success sentence is replaced,
   not just the timestamp line (security 5) — "diagnostics collection is on"
   beside a window that has demonstrably passed is exactly the persistent-state
   claim AC-23 forbids.

### Accepted risk, recorded rather than implicit

This surface performs a **privileged, audited, upstream-visible action on a
customer's phone number**, and the UI is deliberately not the authority on any of
it. What the UI controls, and does: the number is shown in the exact form it will
be transmitted before anything is sent; one confirmation is required; every
control that can send a request is disabled while one is in flight and the dialog
cannot be dismissed then; nothing is retried automatically anywhere; and the
number never reaches a URL, a query string, a cURL surface or a log.

Three things the UI does **not** control, named here rather than discovered at
verification:

- **The permission is the whole blast radius** (security 11). `X-Device-Id` does
  not scope this action — the target is a global phone number and GOWA does not
  constrain it to the selected device's chats — so "one number, the conversation
  you have open" is an *affordance*, not a control. Anyone holding
  `admin.debug.toggle` can toggle collection for any number whose JID they can
  get on screen. The server is the authority; this is why `AC-3` was reworded.
- **"One action, one request" has one pre-existing exception** (senior 15). The
  401 interceptor in `src/lib/http.ts` replays the original config once after a
  successful refresh, so a toggle can leave the browser twice on the wire — the
  first refused before it reached a handler. That is the session layer's
  documented behaviour and this ticket adds no bespoke 401 handling (AC-35).
- **Whether the toggle took effect upstream**, in the `unknown` arms above, and
  **for how long** — the TTL is the omni's, and the reported `expires_at` is a
  cache this session forgets.

## Steps

### 1 — `src/lib/jid.ts`: the inverse of `composeJid`

```ts
/**
 * A WhatsApp user part is a full international number in digits: a country code
 * and a subscriber number, with no leading zero and no punctuation.
 */
const PHONE_LOCAL = /^[1-9][0-9]{4,19}$/

/**
 * The phone number behind a one-to-one conversation, in E.164 form with the
 * leading plus — or `null` when the JID does not describe one.
 */
export function phoneFromJid(jid: string): string | null {
  const trimmed = jid.trim()
  const at = trimmed.indexOf('@')
  if (at === -1) return null
  // The FIRST `@` decides the split, so `a@b@s.whatsapp.net` fails the domain
  // comparison rather than being read as a number in a nested domain.
  if (trimmed.slice(at) !== JID_TYPES.user) return null
  // `:` is the device suffix and `.` the agent one — `<digits>.0:12@…` is the
  // whatsmeow spelling, and AC-15 names both.
  const local = trimmed.slice(0, at).split(/[.:]/)[0]
  return PHONE_LOCAL.test(local) ? `+${local}` : null
}
```

Group, newsletter, `@lid` and `status@broadcast` all fail the domain comparison,
so they need no special case; the test asserts each one by name anyway, because
AC-20 and AC-21 name them. The leading-`[1-9]` is the security lens's point: a
`00`-prefixed local part is refused rather than being sent as `+0096393…`, and
refusing means the control is simply absent.

### 2 — `src/api/agent.ts`: the one call, and the only place `ttl_minutes` is spelled

```ts
/**
 * A duration that has been through the validator. There is no arm for a number,
 * so a hand-rolled `+raw` does not compile.
 */
export type TtlField = { kind: 'omit' } | { kind: 'minutes'; minutes: number }

export interface AgentDebugToggle {
  /** E.164 **with** the leading plus. A value without it is a 400. */
  phone: string
  /** Always sent. Never defaulted, never inferred — AC-16. */
  enabled: boolean
  ttl: TtlField
}

export function toggleAgentDebug({ phone, enabled, ttl }: AgentDebugToggle) {
  return results<unknown>(
    http.post('/agent/debug/toggle', {
      phone,
      enabled,
      // Present or ABSENT — never `0`, never `undefined` spelled by hand. The
      // wire name lives in this file and nowhere else in `src/`.
      ...(ttl.kind === 'minutes' ? { ttl_minutes: ttl.minutes } : {}),
    }),
  )
}
```

`unknown`, not a guessed interface: the reference says the upstream body is
returned **unmodified** and that any additional field is passed through, so the
shape is decided at the point of use on the presence of a key — the same choice
`getMessageDebug` made for the same reason. `X-Device-Id` and the bearer are
attached by the interceptor in `src/lib/http.ts`; this module adds no header, and
names no secret. It does **not** build an `ApiRequest`: that shape exists for the
cURL renderer, and AC-44 forbids this number reaching one.

### 3 — `src/lib/agent-debug.ts`: every decision this feature makes

Pure. No React, no axios, no store, and **no permission module** — the permission
arrives as a boolean argument, the same boundary `diagnostics.ts` and
`transcript.ts` keep and `source-policy.test.ts` enforces.

```ts
export const TTL_PRESETS = [30, 60, 120] as const

export type Ttl = TtlField | { kind: 'error'; message: string }

export function parseTtl(raw: string): Ttl
```

- blank / whitespace → `{ kind: 'omit' }` (the upstream default applies — AC-18).
- `/^[0-9]+$/` **on the trimmed string**, then `Number`, then
  `Number.isSafeInteger(n) && n > 0`. A digit-only test before conversion is what
  rejects `1.5`, `-5`, `1e3`, `0x10`, `abc`, `5abc` and `  ` with one rule instead
  of five; `isSafeInteger` is what refuses a pasted 300-digit value that would
  otherwise become `Infinity` and be serialised as `null`. Revision 1 invented a
  `MAX_TTL_MINUTES = 100_000` for that, which a later reader would have mistaken
  for a backend limit (senior 9).
- `0` → `{ kind: 'error' }` with "must be at least one minute".

```ts
/** What the menu offers, or `null` — the single guard for AC-6/AC-20/AC-21. */
export function debugToggleTarget(jid: string, canToggle: boolean): string | null {
  return canToggle ? phoneFromJid(jid) : null
}
```

One line with one caller, and kept deliberately (see Panel response, senior 11):
it is the single place the two authorities meet — *may you* and *is there a
number* — which is exactly the shape `showsDiagnosticsBadge` won on in ticket 12,
and it is what the source rule pins the menu's guard to.

```ts
export interface ToggleReport { phone: string; enabled: boolean; expiresAt: string | null }

/** What a 200 actually said, read defensively off an unmodified upstream body. */
export function toggleReport(sent: { phone: string; enabled: boolean }, results: unknown): ToggleReport
```

- `phone`: the response's own `phone` **only when it matches `/^\+[0-9]{5,20}$/`**
  (AC-50); otherwise the value that was sent. A server-side normalisation is
  still a well-formed number, so AC-31 is satisfied by the allow-list rather than
  weakened by it — and nothing an upstream chooses reaches the sentence naming
  the customer's number.
- `enabled`: the response's own when it is a boolean; otherwise what was sent.
  The server's answer outranks the request, because the operator needs to see
  what happened rather than what they asked for.
- `expiresAt`: the response's `expires_at` when it is a non-empty string **and**
  the confirmed `enabled` is true; otherwise `null`. The second half is AC-29
  made unconditional — an expiry beside "collection off" is a self-contradicting
  pair, and the UI refuses to render one even if the upstream sends it.
- Anything that is not an object falls back to the sent values with a null
  expiry; nothing throws and nothing is "a parse failure" (AC-27).

```ts
export type Applied = 'no' | 'unknown'

export interface ToggleFailure {
  message: string
  applied: Applied
  /** Does the dialog offer a button the operator may press? Never automatic. */
  offersRetry: boolean
}

export function toggleFailure(error: ApiError): ToggleFailure
```

Keyed on `error.code`, with the **default inverted** (AC-51):

| code | applied | retry | message |
|---|---|---|---|
| `DEVICE_ID_REQUIRED` | `no` | no | Select a device first. Nothing was changed. |
| `VALIDATION_ERROR` | `no` | no | The server refused the request, plus its own capped and stripped text. No upstream call was made. |
| `AGENT_DEBUG_DISABLED` | `no` | no | This server has no AI-agent diagnostics integration configured — ask whoever runs it. A fact about the deployment, not a transient failure. **Names no environment variable.** |
| `AGENT_DEBUG_BUSY` | `no` | **yes** | Too many toggles at once — try again shortly. Refused, not queued. |
| `AGENT_UPSTREAM_ERROR` | `no` | **yes** | The AI agent could not be reached. The switch was not applied. |
| `AGENT_UPSTREAM_INVALID_RESPONSE` | **`unknown`** | **yes** | The AI agent answered unexpectedly. It may or may not have applied the switch. |
| `AGENT_UPSTREAM_TIMEOUT` | **`unknown`** | **yes** | The agent did not answer in time. The toggle may or may not have been applied. |
| `401`, `413` (by status) | `no` | no | The existing session path owns 401; 413 gets the generic sentence. Both are refused before the upstream call. |
| **anything else** | **`unknown`** | **yes** | Including `status: 0` (a client abort at the 45 s axios budget, or a dropped connection) and any envelope-less 5xx a proxy in front of GOWA minted. |

The server's own text passes through `displayText(message, MAX_SERVER_MESSAGE)`
before it is ever rendered — the cap **and** the control/format strip, not
`serverMessage`'s cap alone — because this lands in a dialog beside a customer's
phone number and a proxy in front of gowa can choose it.

```ts
export function toggleSummary(report: ToggleReport): string
export function expiryAt(expiresAt: string | null): number | null
export function expiryDelay(expiresAt: string | null, now: number): number | null
```

- `toggleSummary` is the AC-28 sentence: the number, and "diagnostics collection
  is on" / "…is off".
- `expiryAt` parses the timestamp to epoch ms and answers `null` for an absent,
  unparseable or **already past** value — the cache-not-state rule of AC-24
  reduced to one testable function.
- `expiryDelay` answers the milliseconds to arm a timer for, or `null` when there
  is nothing to arm: absent, unparseable, already past, or **beyond
  `2 ** 31 - 1` ms**, where `setTimeout` overflows and fires immediately — which
  would make a genuinely-distant expiry vanish at once, the opposite of the
  guard's purpose. As a pure function this is a test case rather than an
  unreachable branch (performance 2, senior 6).

### 4 — `src/features/chat/agent-debug-dialog.tsx`: the confirmation

One component, one instance, mounted only while open. Props: `phone` (already
E.164, already validated), `intent: 'on' | 'off'`, `onClose`.

- **Latches its number on mount** — `const [target] = useState(() => phone)` —
  so the number rendered is the number sent, by construction (security 8).
- Holds `ttl` (a string) and the mutation. The mutation is `useMutation`
  directly, **not** `useActionMutation`: that helper toasts on success and maps
  every error through `toActionErrorMessage`, and this surface needs the outcome
  *in the dialog* — the expiry that must be forgotten when it passes, the retry
  button, the unknown-outcome sentence. The same reason the lifecycle dialogs do
  not use it, and the same rule `source-policy.test.ts` already asserts for them.
  `retry: false`, so TanStack cannot re-send by itself (AC-26).
- Nothing is invalidated on success. Nothing about the conversation, its messages
  or the chat list changed (AC-30), so `queryClient` is not touched at all.
- `onSubmit` computes `parseTtl(ttl)` first; an `error` arm renders against the
  field and returns **before** `mutate` (AC-18, TC-4). The parsed value is passed
  as a `TtlField`, so the body cannot carry a number the validator did not
  produce.
- **Every control that can send a request is disabled while one is in flight**,
  the confirm button and the failure view's *Try again* alike, and
  `onOpenChange`/Escape are ignored then (AC-13; security 7, performance 8).
- The duration presets are plain `Button`s, not a new Radix primitive: three
  values do not justify pulling `Select` or `ToggleGroup` into a bundle that is
  inlined whole into one file, and every icon used is already in the bundle
  (performance 6).
- Three views, and only three: the form, the failure, the success.
  - **failure** renders `toggleFailure(...).message`, states whether the switch
    was applied or the outcome is unknown, and offers *Try again* only when
    `offersRetry`. Pressing it calls `mutate` again — an operator action.
  - **success** is reachable only from the mutation's success state, renders
    `toggleSummary(...)`, and adds one line naming the local expiry when
    `expiryAt(...)` is a future instant. A `useEffect` keyed on that epoch arms a
    single `setTimeout` for `expiryDelay(...)` and clears it on change or unmount;
    when it fires, the **whole** claim is replaced by a past-tense sentence
    stating that this dashboard cannot read the current state (AC-23, AC-24,
    TC-3).
- Nothing is written to storage and nothing survives the dialog's unmount
  (AC-25).

### 5 — `src/features/chat/chat-controls.tsx`: two items, its own absence, memoised

```tsx
export const ChatControls = memo(function ChatControls({ chat, mayWriteChats, mayToggleDebug }: {
  chat: ChatInfo
  mayWriteChats: boolean
  mayToggleDebug: boolean
}) {
  const [intent, setIntent] = useState<'on' | 'off' | null>(null)
  const debugPhone = debugToggleTarget(chat.jid, mayToggleDebug)
  if (!mayWriteChats && !debugPhone) return null
  …
})
```

The existing pin / archive / disappearing group is wrapped in `{mayWriteChats &&
(…)}` — unchanged behaviour, now stated locally instead of at the call site. The
separator renders as `{mayWriteChats && debugPhone && <DropdownMenuSeparator />}`,
so a principal with only `admin.debug.toggle` does not get a menu whose first
child is a rule (senior 12). The new group is `{debugPhone && (…)}` with the two
items, and the dialog is `{debugPhone && intent && <AgentDebugDialog …/>}`, so it
mounts no hook of its own until an operator opens it.

`debugToggleTarget` runs per render, uncached: one `indexOf`, one `slice`, one
`split` and a short regex is cheaper than the `useMemo` bookkeeping that would
wrap it (performance 7). `useQueryClient` stays where it is: the existing `run`
helper invalidates `['chats']` after pin/archive/disappearing, and this ticket
does not touch that.

### 6 — `src/features/chat/message-view.tsx`: one prop, one unconditional render

`mayToggleDebug: boolean` joins the five props already threaded through, and
`{mayWriteChats && <ChatControls chat={chat} />}` becomes
`<ChatControls chat={chat} mayWriteChats={mayWriteChats} mayToggleDebug={mayToggleDebug} />`.
**The comment above that line is rewritten in the same edit** (senior 13): it
currently says "Pin, archive and disappearing are all `chats.write`. Absent,
never disabled", directly above the render being made unconditional, and it must
now say that the menu decides its own absence and why. No hook is added; the row
component and its `memo()` are untouched (AC-45).

### 7 — `src/pages/chats.tsx`: the sixth boolean

`const mayToggleDebug = useHasPermission(PERMISSIONS.ADMIN_DEBUG_TOGGLE)`, above
the `if (!device)` return with the other five, passed into `MessageView`. The
file's header already explains why every permission for this screen is answered
here; one sentence joins it naming this one and its independence from
`messages.debug.read` — and **the header's "All six sit above the `if (!device)`
return" becomes "All seven"** (senior 13), because a header that miscounts is a
header nobody trusts.

### 8 — `src/lib/source-policy.test.ts`: the rules a renderless suite can still run

Two lines go into rules this file already has, rather than being restated
(senior 7): `agent-debug-dialog.tsx` joins the `LISTS` array — whose rule already
bans every permission hook and `<Can>` in `chat-controls.tsx` — and
`'ADMIN_DEBUG_TOGGLE'` joins the `PERMISSIONS.*` loop that checks `chats.tsx`
resolves each gated permission once. `ChatControls` joins the memo rule.

A new `describe` block carries what is genuinely new:

1. **No file in `src/` names the agent secret** — `AGENT_WEBHOOK_KEY`,
   `X-Agent-Signature`, `AGENT_DEBUG_TOGGLE_URL` — in any casing. The allowlist
   is empty and stays empty, which is only true because the `AGENT_DEBUG_DISABLED`
   sentence names no environment variable (senior 1, security 4).
2. **The wire path `/agent/debug/toggle` and the wire field `ttl_minutes` each
   exist in exactly one file** (`src/api/agent.ts`), and no file in `src/` builds
   an absolute URL for an omni origin.
3. **The endpoint is reachable from one component only** — `toggleAgentDebug` is
   imported by `agent-debug-dialog.tsx` and by nothing else, so "one operator
   action, one request, one number" is a property of the import graph.
4. **The duration reaches the body only through the validator** — the dialog
   contains `parseTtl(` and none of `Number(`, `parseInt(`, `parseFloat(`. Kept
   as a second line of defence behind `TtlField`, and labelled as such rather
   than as the guarantee (security 6).
5. **The permission reaches the menu through both hops TypeScript cannot check** —
   `mayToggleDebug={mayToggleDebug}` in `chats.tsx` and in `message-view.tsx`.
   A wrong-but-well-typed prop fails open and there is no renderer to catch it.
6. **The menu's guard is the decision function and nothing else** —
   `chat-controls.tsx` contains `debugToggleTarget(chat.jid, mayToggleDebug)`,
   and the dialog is rendered behind that value.
7. **The toggle surface opens no observer, no subscription and no poll** —
   `useQuery`, `refetchInterval`, `refetchOnWindowFocus`, `setInterval` and
   `invalidateQueries` are all banned in the dialog (performance 4); `setTimeout`
   is permitted there only, and the file must also contain `clearTimeout`.
8. **Two claims that otherwise live only in JSX** (senior 5): the dialog contains
   `disabled={` guards naming the mutation's pending state for both the confirm
   and the retry control, and the success view is gated on the mutation's success
   rather than on the absence of an error.
9. **The conversation subtree is keyed on the selected chat** —
   `key={selected.jid}` in `chats.tsx` — because the dialog's latch relies on a
   chat change remounting it, and an invariant worth depending on is worth
   pinning (security 8).
10. **The decision module takes the permission as an argument and imports no
    permission module** — the boundary rule tickets 12 and 13 both carry — and
    stays pure (no React, no store, no axios).

### 9 — The colocated tests

| File | Covers |
|---|---|
| `src/lib/jid.test.ts` (extended) | AC-15, AC-20, AC-21, AC-22, TC-5 — plain number, `:12` device suffix, `.0:12` agent suffix, group, newsletter, `@lid`, `status@broadcast`, no `@`, double `@`, empty local part, non-digits, a `00` prefix, whitespace, and that a returned value always starts with `+`. |
| `src/lib/agent-debug.test.ts` (new) | AC-18, AC-19, AC-27..AC-31, AC-33..AC-40, AC-50, AC-51, TC-3, TC-4, TC-7..TC-9, TC-11, TC-12 — `parseTtl`'s three outcomes over the rejected spellings and the presets; `toggleReport` over a documented body, a body with extra keys, a non-object, an `expires_at` beside `enabled: false`, and a hostile `phone`; `toggleFailure` over all seven codes plus 413, a bare 504 with no code, and `status: 0`; `expiryAt` and `expiryDelay` over past, future, absent, malformed and out-of-range. |
| `src/api/agent.test.ts` (new) | AC-1, AC-3, AC-16, TC-1, TC-2 — driven through the real interceptor chain with a stub adapter, exactly as `chat.test.ts` does: the body carries an explicit `enabled` in both directions, `ttl_minutes` is **absent** from the serialised body for the `omit` arm and present for the `minutes` arm, the `X-Device-Id` header is present when a device is selected, and the URL is the same-origin API prefix. |
| `src/features/chat/chat-controls.test.tsx` (new) | AC-6 — `renderToStaticMarkup` is `''` without either permission, and is not `''` with `chats.write` alone or with `admin.debug.toggle` alone; nothing carries `disabled`. **Wrapped in a throwaway `<QueryClientProvider>`**, because `ChatControls` calls `useQueryClient()` above its early return and TanStack v5 throws without one — the opposite of `message-diagnostics.test.tsx`, where the absent provider *is* the assertion (senior 3, security 12). |

**A known limit, stated rather than discovered later, and the test table is
narrowed to respect it** (senior 4). Radix renders `DropdownMenuContent` and
`DialogContent` through a portal and only while open, so `react-dom/server`
cannot reach the menu items or the dialog body — and for a `@g.us` chat with
`chats.write` the trigger markup is byte-identical with and without this feature.
So `chat-controls.test.tsx` proves **AC-6 only**: the whole menu's absence.
TC-5, TC-6 and the rest of AC-48 are proven by `phoneFromJid` and
`debugToggleTarget` under test plus source rules 5 and 6, which pin the guard to
those functions. This is the same reach `can.test.tsx` established.

## Files to change

| # | File | Change |
|---|---|---|
| 1 | `src/lib/jid.ts` | **edit** — add `phoneFromJid` and its `PHONE_LOCAL` regex. |
| 2 | `src/lib/jid.test.ts` | **edit** — the derivation cases above. |
| 3 | `src/api/agent.ts` | **new** — `TtlField`, `AgentDebugToggle`, `toggleAgentDebug`. |
| 4 | `src/api/agent.test.ts` | **new** — the request that leaves. |
| 5 | `src/lib/agent-debug.ts` | **new** — `TTL_PRESETS`, `parseTtl`, `debugToggleTarget`, `toggleReport`, `toggleFailure`, `toggleSummary`, `expiryAt`, `expiryDelay`. |
| 6 | `src/lib/agent-debug.test.ts` | **new** — every decision above. |
| 7 | `src/features/chat/agent-debug-dialog.tsx` | **new** — the confirmation, the failure and the success views. |
| 8 | `src/features/chat/chat-controls.tsx` | **edit** — two props, `memo()`, two menu items, own absence, the dialog. |
| 9 | `src/features/chat/chat-controls.test.tsx` | **new** — absence on real markup. |
| 10 | `src/features/chat/message-view.tsx` | **edit** — one prop, one unconditional render, one rewritten comment. |
| 11 | `src/pages/chats.tsx` | **edit** — the sixth permission boolean, and the header's count. |
| 12 | `src/lib/source-policy.test.ts` | **edit** — three lines into existing rules, plus the new `describe`. |

**No deployment runtime file is touched.** `vite.config.ts`, `package.json`,
`index.html`, `.github/workflows/ci.yml` and `.github/workflows/release.yml` are
not in this list and no new dependency is added.

## Validation strategy

Validation profile **`ui-source`**: `npm run typecheck`, `npm run lint`,
`npm run test`.

- **Baseline:** 37 test files, 670 tests passing on `ticket/z8pmx9mv3w`.
- Every AC is mapped to a named test, a source rule, or a structural argument in
  `verify.md`; AC-49 requires the pre-existing suite to pass in full.
- The security-relevant claims (no secret, one endpoint, one caller, no
  invalidate, no poll) are asserted **textually** over every shipped file rather
  than in the feature's own tests, so they keep holding for code written after
  this ticket.
- **Mutation testing on the new rules**, including the four spellings the
  security lens named for the duration and the evasion shapes for the secret
  rule: each rule is confirmed to fail when the property it guards is
  deliberately broken, before the change is shipped.

## Rollback

Every change is additive or a prop addition. Reverting is `git revert` of the
single publishable commit: the five new source files disappear, the three edited
components return to their previous props, `phoneFromJid` and the new `describe`
block are removed, and no migration, no persisted value and no server state is
left behind — the surface stores nothing and this ticket writes nothing outside
the working tree. There is no feature flag to unset.

## Out of scope

As `spec.md > Out of scope`. Specifically not in this plan: reading current debug
state (no endpoint exists), the retention sweep, any bulk or chat-list toggle,
any change to the diagnostics panel or the transcript, and any change to the
composer or media download.

## Traceability

| Step | Requirements | Acceptance criteria |
|---|---|---|
| 1 `phoneFromJid` | REQ-9, REQ-10 | AC-15, AC-17, AC-20, AC-21, AC-22 |
| 2 `src/api/agent.ts` | REQ-1, REQ-2, REQ-8 | AC-1, AC-2, AC-3, AC-16, AC-27, AC-35, AC-44 |
| 3 `src/lib/agent-debug.ts` | REQ-6, REQ-8, REQ-11, REQ-13, REQ-14 | AC-18, AC-19, AC-23, AC-24, AC-27..AC-34, AC-36..AC-40, AC-50, AC-51 |
| 4 the dialog | REQ-7, REQ-11, REQ-12 | AC-11..AC-14, AC-24, AC-25, AC-26, AC-28..AC-30, AC-41, AC-42, AC-46 |
| 5 `chat-controls.tsx` | REQ-5, REQ-6, REQ-10 | AC-6, AC-9, AC-10, AC-12, AC-20, AC-21, AC-45 |
| 6 `message-view.tsx` | REQ-4 | AC-7, AC-45 |
| 7 `chats.tsx` | REQ-3, REQ-4 | AC-5, AC-7, AC-8 |
| 8 source rules | NFR-1, NFR-3, NFR-5 | AC-1, AC-4, AC-7, AC-13, AC-26, AC-30, AC-43, AC-45 |
| 9 colocated tests | REQ-14 | AC-47, AC-48, AC-49 |

## Panel response

Thirty-six findings across three lenses. **Twenty-one changed the design**, five
of those also changing `spec.md`; **five are recorded as documentation**; **seven
were answered without a change**; and **three were declined with reasons**.
Numbering follows each lens's own report.

### Security lens (13)

| # | Severity | Disposition |
|---|---|---|
| 1 | major | **Changed.** `AGENT_UPSTREAM_INVALID_RESPONSE` is a **2xx** whose body was unreadable — the omni accepted the command — so it now reports `applied: 'unknown'`. `AGENT_UPSTREAM_ERROR` stays `'no'`: its three documented causes (unreachable, non-2xx, redirect) are all refusals. `AC-36` was split to say so. |
| 2 | major | **Changed.** The default is inverted: `'no'` only for the codes the reference documents as pre-upstream; `status: 0`, an envelope-less 5xx and anything unrecognised are `'unknown'`. New `AC-51` and `TC-11`. |
| 3 | major | **Changed.** The echoed `phone` is accepted only against `/^\+[0-9]{5,20}$/`, else the sent value is shown. New `AC-50` and `TC-12`. An allow-list rather than `displayText`, because the field has a known shape and "sanitise it" would still put an attacker-chosen string in the sentence. |
| 4 | major | **Changed.** The `AGENT_DEBUG_DISABLED` sentence names no environment variable, so source rule 1 keeps an empty allowlist. Raised independently by senior 1. |
| 5 | minor | **Changed.** When the expiry passes the **whole** success sentence is replaced, not only the timestamp line. |
| 6 | minor | **Changed.** `toggleAgentDebug` takes a parsed `TtlField`, so a hand-rolled number does not compile; the textual rule survives as a second line of defence and is labelled as one. |
| 7 | minor | **Changed.** *Try again* is disabled while pending too, and `AC-13` was widened to cover every control that can send. |
| 8 | minor | **Changed, in part.** The dialog latches its number at mount, which makes shown-equals-sent true by construction, and the `key={selected.jid}` invariant is pinned by a source rule. The "compare at submit and refuse on mismatch" half is **declined**: with the latch there is nothing left to compare, and a comparison that can never fail is machinery, not a guard. |
| 9 | minor | **Changed.** The `field: 'ttl'` placement is removed entirely rather than re-keyed off UI state: AC-34's "otherwise as a general failure" covers it, and the UI already rejects every bad duration before any request. Raised independently by senior 10. |
| 10 | minor | **Changed.** The local part is cut at the first `.` **or** `:`, and a leading zero is refused. Both tightenings are unit-tested by name. |
| 11 | minor | **Documented**, and `AC-3` was reworded. The permission is the blast radius; `X-Device-Id` does not scope the target. |
| 12 | nit | **Changed.** The rendering test is wrapped in a throwaway `QueryClientProvider`. Raised independently by senior 3. |
| 13 | info | **Noted.** No action; the transport posture is recorded in Accepted risk. |

### Senior lens (15)

| # | Severity | Disposition |
|---|---|---|
| 1 | major | **Changed** — see security 4. |
| 2 | major | **Changed** — see security 2. The 45-second axios budget is named explicitly in the failure table. |
| 3 | major | **Changed** — see security 12, and the misleading comment is explicitly not copied. |
| 4 | minor | **Changed.** The test table now claims AC-6 only for `chat-controls.test.tsx`; TC-5, TC-6 and the rest of AC-48 are mapped to the pure functions and source rules 5 and 6. |
| 5 | minor | **Changed.** Source rule 8 pins `disabled={…isPending}` on both controls and the success view's gate. |
| 6 | minor | **Changed, in part.** The `2 ** 31 - 1` branch moved out of the component into the pure `expiryDelay`, where it is a test case rather than an unreachable branch — which is the substance of the objection. **Deleting the timer entirely is declined**: `TC-3` is a spec test case that names exactly this behaviour ("once the time passes the UI stops showing the expiry"), and a render-time-only check leaves a stale claim on screen in an open dialog. The cost is one effect with a cleanup. |
| 7 | minor | **Changed.** `agent-debug-dialog.tsx` joins `LISTS`, `'ADMIN_DEBUG_TOGGLE'` joins the `PERMISSIONS.*` loop, `ChatControls` joins the memo rule; only the prop-hop matchers are new. |
| 8 | minor | **Changed.** The translation moved into `src/api/agent.ts`, so `ttl_minutes` exists in one file — the `include_debug` precedent. |
| 9 | minor | **Changed.** `MAX_TTL_MINUTES` is gone; `Number.isSafeInteger(n) && n > 0` does the work. |
| 10 | minor | **Changed** — see security 9. |
| 11 | nit | **Declined.** `debugToggleTarget` stays. It is the one place the two authorities meet, it is what source rule 6 pins the menu's guard to, and it is the shape `showsDiagnosticsBadge` established one ticket over for the identical question. The unused `ToggleTarget` interface beside it **is** removed — that part of the finding is accepted. |
| 12 | nit | **Changed.** The separator renders only when both groups do. |
| 13 | nit | **Changed.** Both stale comments are listed as explicit edits in steps 6 and 7. |
| 14 | info | **Noted.** Confirms the unconditional-render decision and the `results(http.post(…))` shape. |
| 15 | info | **Documented** in Accepted risk: the 401 interceptor can replay a toggle once. |

### Performance lens (8)

| # | Severity | Disposition |
|---|---|---|
| 1 | minor | **Changed.** `ChatControls` is wrapped in `memo()` and joins the existing memo rule. |
| 2 | minor | **Changed.** The timer is armed in a `useEffect` keyed on the expiry epoch with a `clearTimeout` cleanup, and the delay decision is the pure `expiryDelay`. |
| 3 | minor | **Changed** by the same `memo()`; the mount-only-when-open shape and the dialog-local `ttl` state are kept as the lens confirms them. |
| 4 | info | **Changed** in part: source rule 7 now also bans `useQuery`, `refetchOnWindowFocus` and `invalidateQueries` in the dialog. |
| 5 | info | **Answered without change.** The sixth `useHasPermission` selects a boolean; it is the correct side of the hoisting rule. |
| 6 | info | **Changed.** The presets are plain `Button`s — no new Radix package for three values — and no new icon is introduced. |
| 7 | nit | **Answered without change.** `debugToggleTarget` stays uncached; no `useMemo`. |
| 8 | nit | **Changed.** Close and Escape are ignored while a request is in flight, which also strengthens AC-13. |

---
ticket: z8pmx9mw2x
stage: verify
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mw2x"
  github: ""
---

# Verification — 14 · Toggling the agent's debug collection for one number

**Outcome: PASSED.** All 51 acceptance criteria and all 12 test cases are mapped
to an executed result below. Verification depth is `all-ac`.

## Validation profile `ui-source`

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | **PASS** — no output |
| Lint | `npm run lint` | **PASS** — four `react(only-export-components)` warnings, all pre-existing (`button.tsx`, `badge.tsx`, `tabs.tsx`, `use-device-guard.tsx`); none in a file this ticket touched |
| Tests | `npm run test` | **PASS** — 43 files, **824 tests**; baseline on the parent tip was 37 files / 670 tests |
| Build | `npm run build` | **PASS** — one `dist/index.html`, 1 124.03 kB (gzip 445.13 kB) |

The five files this ticket owns run **164 tests** between them.

## Runtime-impact statement

**No.** No deployment runtime file was modified. `.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json` and
`index.html` are all untouched — `git status` lists six modified sources and six
new ones, none of them on that list — and no runtime dependency was added.

## Acceptance criteria

### Scope and tenant safety

| ID | Result | Evidence |
|---|---|---|
| AC-1 | **PASS** | `agent.test.ts > goes to the same-origin API prefix` asserts the URI is `/api/agent/debug/toggle`, built through `src/lib/url.ts`'s relative prefix. `source-policy > no file in src/ names the agent secret` passes with an **empty** exemption list over every shipped file; mutant **M1** confirms it fails when one of those names appears as a string literal. |
| AC-2 | **PASS** | `source-policy > the endpoint is reachable from exactly one component` — `toggleAgentDebug` is imported only by `src/api/agent.ts` and the dialog. `agent.test.ts` asserts `sent` has length 1 per action. |
| AC-3 | **PASS** | `agent.test.ts > carries the selected device` — `X-Device-Id: device-7`, attached by the one interceptor. The reworded criterion's other half (the server refuses a device-less request) is AC-33/TC-10. |
| AC-4 | **PASS** | `source-policy > the toggle surface opens no observer` bans `useQuery`, `refetchInterval`, `refetchOnWindowFocus`, `setInterval`, `invalidateQueries` and `useQueryClient` in the dialog; mutant **M8** confirms the invalidate ban fires. `src/api/chat.ts` is untouched, so the conversation's own request profile is unchanged by construction. |

### Authorization

| ID | Result | Evidence |
|---|---|---|
| AC-5 | **PASS** | `source-policy > the permission reaches the menu through both hops` requires `useHasPermission(PERMISSIONS.ADMIN_DEBUG_TOGGLE)` in `chats.tsx`; the pre-existing role rule still passes, so no role name is read anywhere in the path. |
| AC-6 | **PASS** | `chat-controls.test.tsx > renders nothing at all for a principal holding neither permission` — markup is `''`. |
| AC-7 | **PASS** | The pre-existing `LISTS` rule (now including `agent-debug-dialog.tsx`) bans every permission hook and `<Can>` in `chat-controls.tsx`, the dialog, the message view and every per-row component. Mutant **M3** — a well-typed wrong prop that fails **open** — is killed by the hop rule. |
| AC-8 | **PASS** | `chat-controls.test.tsx > renders for admin.debug.toggle alone`. The two permissions are separate `useHasPermission` calls in `chats.tsx` and nothing conjoins them. |

### The toggle surface

| ID | Result | Evidence |
|---|---|---|
| AC-9 | **PASS** | The items live inside the existing `DropdownMenuContent` in `chat-controls.tsx`. No route, page or navigation entry was added — `src/App.tsx` and the nav modules are untouched. |
| AC-10 | **PASS** | Two `DropdownMenuItem`s calling `setIntent('on')` and `setIntent('off')`; `enabled` is `intent === 'on'`, a literal derived from which item was pressed. No switch, no read-back, nothing inferred. |
| AC-11 | **PASS** | `AgentDebugDialog` renders the target, the duration field and one submit control; `onSubmit` is the only path to `mutate`. |
| AC-12 | **PASS** | `agent.test.ts > carries an explicit enabled:false, and no duration at all` — body is exactly `{phone, enabled:false}`. The duration block is behind `{enabled ? … : …}` and the `off` path passes `{kind:'omit'}` without reading `ttl`. |
| AC-13 | **PASS** | `source-policy > one operator decision is one request` requires `disabled={toggle.isPending}` and the `!toggle.isPending` dismissal guard; mutant **M6** confirms it fires when the guard is dropped. One submit control covers both the confirm and the retry path (deviation 2). |
| AC-14 | **PASS** | `DialogDescription` renders the latched `target` in `font-mono` — the exact string `toggleAgentDebug` sends. |

### Request fields

| ID | Result | Evidence |
|---|---|---|
| AC-15 | **PASS** | `jid.test.ts` — plain, `:12` device suffix, `.0` agent suffix and `.0:12` all derive `+963938113282`; `always returns a value that starts with a plus` covers the leading `+`. |
| AC-16 | **PASS** | `enabled: boolean` is non-optional on `AgentDebugToggle`, and `agent.test.ts` asserts `Object.keys(body)` contains `enabled` on the **serialised** body in both directions — the only place an `undefined` key is distinguishable. |
| AC-17 | **PASS** | `debugToggleTarget` returns `null` when no number can be produced, and the menu items are behind that value: no request can be built for a chat without one. |
| AC-18 | **PASS** | `agent-debug.test.ts > parseTtl` — blank omits, `0` / `-5` / `1.5` / `abc` / `5abc` / `1e3` / `0x10` / `+30` all return the error arm, and `agent.test.ts > omits ttl_minutes entirely` proves the key is absent from the serialised body rather than `null`. |
| AC-19 | **PASS** | `TTL_PRESETS = [30, 60, 120]` rendered as three `Button`s plus the free numeric `Input`; `parseTtl` accepts every preset and yields a plain integer. |

### Chats that have no number

| ID | Result | Evidence |
|---|---|---|
| AC-20 | **PASS** | `agent-debug.test.ts > offers nothing for a chat with no number` over `@g.us`, `@newsletter`, `status@broadcast`; `chat-controls.test.tsx > renders nothing for a chat with no number behind it` proves it as **absence of markup**, not a disabled item. |
| AC-21 | **PASS** | Same two tests include `9876@lid`. `phoneFromJid` refuses it on the domain comparison — no number is invented from a linked id. |
| AC-22 | **PASS** | `phoneFromJid` in `src/lib/jid.ts`, pure, 9 test cases; `source-policy > the menu's guard is the decision function` proves the component calls it rather than splitting the JID itself, and mutant **M4** confirms that rule fires. |

### Upstream state discipline

| ID | Result | Evidence |
|---|---|---|
| AC-23 | **PASS** | There is no read path: `src/api/agent.ts` exports one function and it is a `POST`. No badge, switch or list anywhere claims a state; the only sentence about a number is produced by `toggleSummary` from a `200` this session just received. |
| AC-24 | **PASS** | `agent-debug.test.ts > the reported expiry is a cache, not a state` — `expiryAt` answers `null` for past, absent and unparseable; `expiryDelay` arms exactly the remaining time, and `null` when there is nothing to arm. On fire the dialog replaces the **whole** claim, not just the timestamp. |
| AC-25 | **PASS** | No `localStorage`/`sessionStorage` anywhere near this feature — the repository-wide web-storage rule still passes with its three-file allowlist unchanged. All state is `useState` inside a dialog that unmounts on close. |
| AC-26 | **PASS** | `retry: false` on the mutation, asserted by `source-policy`; `setInterval`, `refetchInterval` and `refetchOnWindowFocus` are banned in the dialog. The only `setTimeout` is the expiry timer, which issues no request. |
| AC-27 | **PASS** | `agent-debug.test.ts > ignores additional fields rather than failing to parse them` and `> falls back to what was sent when the body is not an object at all` (over `null`, `undefined`, a string, a number and an array). `agent.test.ts > hands back the upstream body untouched`. |

### After a successful toggle

| ID | Result | Evidence |
|---|---|---|
| AC-28 | **PASS** | `agent-debug.test.ts > toggleSummary` — exact sentences for on and off; the dialog adds the local-time expiry line via `formatDate` when `expiryAt` is a future instant. |
| AC-29 | **PASS** | `agent-debug.test.ts > never shows an expiry beside "collection off"` — the expiry is dropped even when the upstream sends one, so there is no empty slot to render. |
| AC-30 | **PASS** | `invalidateQueries` and `useQueryClient` are both banned in the dialog by `source-policy`; mutant **M8** confirms. |
| AC-31 | **PASS** | `agent-debug.test.ts > shows a server-side normalisation rather than the value that was sent`. |

### Errors

| ID | Result | Evidence |
|---|---|---|
| AC-32 | **PASS** | The dialog's only error path is `toggleFailure(toApiError(toggle.error))`; `agent-debug.test.ts > every message is a sentence, never a bare code or status` asserts no code string reaches any message. The repository-wide `console.*` ban still passes with an empty exemption list. |
| AC-33 | **PASS** | `agent-debug.test.ts > tells the operator to select a device, and offers no retry` — `applied: 'no'`, `offersRetry: false`. |
| AC-34 | **PASS** | `> reports a validation refusal with the server's own text, and nothing changed`. Field-level placement was dropped at the panel's request (security 9 / senior 10); AC-34's "otherwise as a general failure" is what ships, and the UI already rejects every bad duration before any request (AC-18). |
| AC-35 | **PASS** | No 401 handling exists in this feature at all. The request goes through `http`, whose interceptor owns the refresh-and-replay path; `agent-debug.test.ts` treats a 401 as refused-before-upstream and offers no retry. |
| AC-36 | **PASS** | `> an unreachable agent did not apply the switch` (`AGENT_UPSTREAM_ERROR` → `no`, retry offered) and `> an unreadable 2xx answer leaves the outcome UNKNOWN` (`AGENT_UPSTREAM_INVALID_RESPONSE` → `unknown`). The split was the panel's `major` finding and is now the criterion. |
| AC-37 | **PASS** | `> states an unconfigured deployment as a fact, names no environment variable, offers no retry` — and the same test asserts the message does **not** contain `AGENT_DEBUG_TOGGLE_URL` or `AGENT_WEBHOOK_KEY`, which is what keeps AC-1's rule absolute. |
| AC-38 | **PASS** | `> says the busy cap refused rather than queued, and invites a manual retry`. |
| AC-39 | **PASS** | `> a timeout leaves the outcome unknown and is never re-issued automatically` — `applied: 'unknown'`, message matches `/may or may not/`. The dialog's success view is unreachable from an error, so no state and no expiry is rendered (mutant **M5**). |
| AC-40 | **PASS** | `> treats a 413 and a 401 as refused before the upstream call` — the generic arm, no special-casing. |
| AC-41 | **PASS** | The failure view renders inside the open dialog; the menu closes on selection as it always has, and nothing in this feature writes to another component's state — `setIntent` is the only cross-component write and it is local to `ChatControls`. |

### Audit and observability

| ID | Result | Evidence |
|---|---|---|
| AC-42 | **PASS** | A `200` renders `SuccessNotice`; every failure renders the bordered failure block plus an explicit applied/unknown sentence. There is no silent arm — the dialog's three views are exhaustive over the mutation's states. |
| AC-43 | **PASS** | The repository-wide `console.*` ban passes with an empty exemption list; no storage write, no telemetry import anywhere in the feature. |
| AC-44 | **PASS** | `agent.test.ts > puts the number in the body and nowhere in the URL`. Structurally: `src/lib/curl.ts` renders only an `ApiRequest`, and `src/api/agent.ts` deliberately does not build one. |

### Performance

| ID | Result | Evidence |
|---|---|---|
| AC-45 | **PASS** | No hook was added to `MessageBubble`, `MessageMedia`, `MessageDiagnostics`, `MessageTranscript` or `ChatList` — none of those files was edited. `ChatControls` is now `memo()`'d, asserted by the extended memo rule. |
| AC-46 | **PASS** | `chat-controls.test.tsx > mounts no dialog until an operator opens one` — the markup contains neither the item labels nor the number. `ChatControls` is rendered once, in `MessageView`'s header, never per chat-list row. |

### Testing

| ID | Result | Evidence |
|---|---|---|
| AC-47 | **PASS** | Every listed area is covered: derivation (`jid.test.ts`, 9 cases), `ttl_minutes` validation (`agent-debug.test.ts`, 6 cases incl. all four rejected spellings and the omit/positive arms, plus `agent.test.ts` proving no request is built), the explicit `enabled` (`agent.test.ts`, both directions on the serialised body), and 400/502/503×2/504 each with a distinct message and a distinct `applied`. |
| AC-48 | **PASS** | Absence without the permission and absence for a numberless chat: `chat-controls.test.tsx` (markup `''`) and `agent-debug.test.ts > debugToggleTarget`. A 504 making no state claim: `> a timeout leaves the outcome unknown` plus mutant **M5** proving the confirmation is unreachable from an error. |
| AC-49 | **PASS** | `ui-source` green; 824/824 including the full pre-existing suite. |

### Added at the advisory review panel

| ID | Result | Evidence |
|---|---|---|
| AC-50 | **PASS** | `agent-debug.test.ts > refuses an echoed phone that is not itself a well-formed number` over a `U+202E` suffix, a plus-less value, a spaced value, a 5 000-character value and an empty string; `> shows a server-side normalisation` proves the allow-list does not weaken AC-31. Mutant **M9** killed twice. |
| AC-51 | **PASS** | `> a client abort leaves the outcome unknown`, `> an envelope-less 5xx from a proxy leaves the outcome unknown`, `> an unknown future code is unknown, never "not applied"`, and the `NOT_APPLIED` set is exactly the six pre-upstream codes. |

## Test cases

| ID | Result | Evidence |
|---|---|---|
| TC-1 | **PASS** | `agent.test.ts > carries an explicit enabled:true and the duration that was chosen` — body is exactly `{phone:'+963938113282', enabled:true, ttl_minutes:120}` — plus `> goes to the same-origin API prefix, and carries the selected device`. No omni call and no secret: AC-1's rule. No refetch: AC-30's rule. The confirmation and its expiry: `toggleSummary` + `expiryAt` + `formatDate`. |
| TC-2 | **PASS** | `agent.test.ts > carries an explicit enabled:false, and no duration at all`; `agent-debug.test.ts > never shows an expiry beside "collection off"`. |
| TC-3 | **PASS** | `agent-debug.test.ts > the reported expiry is a cache, not a state` (six cases). Nothing is persisted, so a reload claims nothing; no polling exists to issue — `setInterval`/`refetchInterval` are banned in the dialog. |
| TC-4 | **PASS** | `parseTtl` returns the error arm for `0`, `-5`, `1.5` and `abc`, and `onSubmit` returns before `mutate` on that arm — mutant **M2** proves the dialog cannot build a duration any other way. |
| TC-5 | **PASS** | `chat-controls.test.tsx > renders nothing for a chat with no number behind it` over all four JIDs — `''`, so no disabled item and no tooltip exists to render. `> leaves the chats.write menu untouched for a chat with no number` proves pin/archive/disappearing are unaffected. |
| TC-6 | **PASS** | `chat-controls.test.tsx > renders nothing at all for a principal holding neither permission` and `> renders for chats.write alone, exactly as it did before this ticket`. No toast or banner exists on the absence path — there is no code on it. |
| TC-7 | **PASS** | `> states an unconfigured deployment as a fact, names no environment variable, offers no retry`. |
| TC-8 | **PASS** | `> a timeout leaves the outcome unknown and is never re-issued automatically`; the success view is gated on `toggle.isSuccess` (mutant **M5**), so no state and no expiry can be shown. |
| TC-9 | **PASS** | `> says the busy cap refused rather than queued, and invites a manual retry` — `retry: false` on the mutation means nothing is queued or re-sent. |
| TC-10 | **PASS** | `> tells the operator to select a device, and offers no retry`. |
| TC-11 | **PASS** | `> a client abort leaves the outcome unknown` (`status: 0`) and `> an envelope-less 5xx from a proxy leaves the outcome unknown` (bare 504). |
| TC-12 | **PASS** | `> refuses an echoed phone that is not itself a well-formed number` — both the `U+202E` case and the 5 000-character case. |

## Implementation evidence

`implement.md` records the twelve files changed, three deviations, the validation
run and nine mutants (all killed). **No commit exists and none is expected** —
`/implement` creates none; the single publishable commit is the delivery
boundary's job.

## Known limits, carried forward rather than hidden

1. **The permission is the blast radius.** `X-Device-Id` does not scope this
   action — the target is a global phone number and GOWA does not constrain it to
   the selected device's chats — so "one number, the conversation you have open"
   is an affordance, not a control. Recorded in `plan.md > Accepted risk` and it
   is why AC-3 was reworded.
2. **One action can leave the browser twice.** The 401 interceptor replays a
   request once after a successful refresh (`src/lib/http.ts`). That is the
   session layer's documented behaviour, predates this ticket, and this feature
   adds no bespoke 401 handling (AC-35).
3. **Radix portals are out of a server render's reach.** `chat-controls.test.tsx`
   proves the whole menu's absence and presence; the individual items and the
   dialog body are proven through `debugToggleTarget`/`phoneFromJid` under test
   plus the source rules that pin the guard to them. Stated in `plan.md` before
   the code was written, not discovered here.

## Decision

**PASSED.** 51/51 acceptance criteria and 12/12 test cases mapped to a result;
`ui-source` green; runtime impact **no**. The ticket transitions
`implemented → verified → closed`.

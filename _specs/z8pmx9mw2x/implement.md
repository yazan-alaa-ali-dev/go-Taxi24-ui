---
ticket: z8pmx9mw2x
stage: implement
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mw2x"
  github: ""
---

# Implementation — 14 · Toggling the agent's debug collection for one number

Branch `ticket/z8pmx9mw2x`, cut from the tip carrying every prerequisite
(`ticket/z8pmx9mv3w`, which stacks tickets 1–13). The pull request targets
`main`.

## Files changed

Twelve files, exactly the twelve `plan.md > Files to change` names. Six new, six
edited. **No deployment runtime file was touched.**

### New

| File | Lines | What it is |
|---|---|---|
| `src/api/agent.ts` | 89 | `TtlField`, `AgentDebugToggle`, `toggleAgentDebug`. The only file in `src/` that spells `/agent/debug/toggle` or `ttl_minutes`. |
| `src/api/agent.test.ts` | 171 | The request that leaves, through the real interceptor chain with a stub adapter. |
| `src/lib/agent-debug.ts` | 349 | `TTL_PRESETS`, `parseTtl`, `debugToggleTarget`, `toggleReport`, `toggleFailure`, `toggleSummary`, `expiryAt`, `expiryDelay`. Pure — no React, no store, no axios, no permission module. |
| `src/lib/agent-debug.test.ts` | 314 | 37 tests over every decision above. |
| `src/features/chat/agent-debug-dialog.tsx` | 267 | The confirmation, the failure and the success views. |
| `src/features/chat/chat-controls.test.tsx` | 122 | The menu's absence and presence, on real markup. |

### Edited

| File | Change |
|---|---|
| `src/lib/jid.ts` | `phoneFromJid` and its `PHONE_LOCAL` allow-list — `composeJid`'s inverse, beside it. |
| `src/lib/jid.test.ts` | Nine `phoneFromJid` cases (16 tests in the file now). |
| `src/features/chat/chat-controls.tsx` | Two props, `memo()`, the two menu items and their label, the conditional separator, its own absence, the dialog. |
| `src/features/chat/message-view.tsx` | `mayToggleDebug` prop; the menu rendered unconditionally; the comment above it rewritten; "all five values" → "all six". |
| `src/pages/chats.tsx` | `useHasPermission(PERMISSIONS.ADMIN_DEBUG_TOGGLE)` above the `if (!device)` return, passed down; header's "All six" → "All seven". |
| `src/lib/source-policy.test.ts` | Three lines into rules the file already had, plus a new eleven-rule `describe`. |

## Deviations from the plan

Three, all recorded here rather than folded back into `plan.md` — the plan is the
record of what was decided before the code existed.

1. **`VALIDATION_ERROR` offers a retry after all.** The plan's failure table gave
   it `retry: false`. Implementing the footer showed that produced a dead end: a
   `400 VALIDATION_ERROR` leaves the form on screen with the duration field still
   editable and *no* submit control, so an operator who corrects the value cannot
   resend. `DEVICE_ID_REQUIRED` and `AGENT_DEBUG_DISABLED` genuinely are dead
   ends — a device is selected elsewhere and an unconfigured deployment is fixed
   by whoever runs it — and those keep `retry: false`. AC-34 does not forbid a
   retry; AC-33 and AC-37 forbid one for the other two, and both still hold. The
   reason is written into the table in `agent-debug.ts`.

2. **The dialog renders one submit control, not two.** The plan described a
   confirm button and a separate *Try again* button. One button whose label
   changes (`Turn collection on` → `Try again`) is the same behaviour with one
   less thing to keep disabled, and it makes the source rule that pins
   `disabled={toggle.isPending}` cover every path that can send by construction
   rather than by enumeration. The control is absent entirely when the failure
   offers no retry.

3. **The `X-Agent-Signature`/omni-origin rule dropped one of its three
   assertions.** The plan's source rule 2 also proposed banning an absolute omni
   URL by matching `/\bomni[a-z]*\s*[:=]\s*['"]https?:/i`. That is a shape match
   on a variable name nobody has written, which is the decorative kind of rule
   the security lens spent finding 6 objecting to. The two assertions that
   remain — the path in one file, `ttl_minutes` in one file — are real, and the
   absolute-URL case is already covered repository-wide by `src/lib/url.ts` being
   the only URL builder and by the existing `ABSOLUTE_URL` guard in `http.ts`.

Everything else was implemented as the plan describes, including all twenty-one
design changes the advisory panel produced.

## Validation run

Validation profile **`ui-source`**.

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | **pass**, no output |
| Lint | `npm run lint` | **pass** — four `react(only-export-components)` warnings, all pre-existing on `button.tsx`, `badge.tsx`, `tabs.tsx`, `use-device-guard.tsx`; none in a file this ticket touched |
| Tests | `npm run test` | **43 files, 824 tests, all passing** (baseline 37 files / 670 tests) |
| Build | `npm run build` | **pass** — `dist/index.html`, 1 124.03 kB (gzip 445.13 kB), single file as `vite-plugin-singlefile` requires |

154 tests were added: 9 to `jid.test.ts`, 37 in `agent-debug.test.ts`, 7 in
`agent.test.ts`, 7 in `chat-controls.test.tsx`, 11 new source-policy rules, and
three extensions to existing rules. The five files this ticket touched or added
run 164 tests between them.

`npm run format:check` is **not** part of the `ui-source` profile and was not
run as a gate: it reports 147 files repository-wide, including files this ticket
never opened (`src/stores/device.ts`, `src/pages/settings.tsx` and others), which
is a pre-existing working-tree line-ending condition rather than anything this
change introduced.

## Mutation testing

Nine mutants were introduced against the new rules and **all nine were killed**.
A rule that cannot fail is not a rule, and three of these are the ones the
advisory panel said would otherwise have been decoration.

| # | Mutant | Killed by |
|---|---|---|
| M1 | The `AGENT_DEBUG_DISABLED` sentence names `AGENT_WEBHOOK_KEY` | `RULE: no file in src/ names the agent secret` |
| M2 | The dialog builds a duration with `Number(ttl)` instead of `parseTtl` | `RULE: the duration reaches the body only through the validator` |
| M3 | `chats.tsx` threads `mayReadDiagnostics` into `mayToggleDebug` (type-checks, fails **open**) | `RULE: the permission reaches the menu through both hops` |
| M4 | `chat-controls.tsx` derives the number with `chat.jid.split('@')[0]` instead of `debugToggleTarget` | `RULE: the menu's guard is the decision function` |
| M5 | The confirmation is gated on `!toggle.isError` instead of `toggle.isSuccess` | `RULE: a 200 is the only way to a confirmation` |
| M6 | The submit control drops `disabled={toggle.isPending}` | the same rule |
| M7 | The expiry timer is armed with no `clearTimeout` | `RULE: the toggle surface opens no observer, no subscription and no poll` |
| M8 | The toggle invalidates a query cache on success | the same rule |
| M9 | The echoed `phone` is rendered without the E.164 allow-list | `RULE: the echoed number is matched, never merely sanitised` **and** the behavioural test `refuses an echoed phone that is not itself a well-formed number` |

M9 is the only one killed twice, and deliberately: it is the finding a lens
raised as `major`, so it is guarded both by what the code says and by what it
does.

The working tree was restored from backups after each mutant and verified
byte-identical (`diff -q` against all five touched sources) before the final
suite run.

## Notes for the verifier

- **Nothing was committed.** `/implement` is not the git delivery boundary; the
  single publishable commit is `/publish-pr`'s job.
- The one timer this feature owns is in `SuccessNotice` in the dialog, armed only
  after a successful "on" toggle that reported a future expiry, cleaned up on
  change and unmount, and never issuing a request.
- `src/api/agent.ts` is the only file that reaches the endpoint, and
  `agent-debug-dialog.tsx` is its only caller — both asserted over every shipped
  file rather than in this feature's own tests, so they keep holding for code
  written after this ticket.

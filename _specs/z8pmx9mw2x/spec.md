---
ticket: z8pmx9mw2x
stage: spec
mode: standard
status: complete
owner: developer
updated: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mw2x"
  github: ""
---

# Specification — 14 · Toggling the agent's debug collection for one number

## Business goal

Ticket 12 (`z8pmx9mv3v`) made the stored AI diagnostics *readable*. It did not
make them *collectable*: whether the omni agent records anything for a given
customer is decided by a per-number switch that, today, only a backend engineer
can flip by hand. So an administrator watching a complaint happen has two bad
options — ask someone to run the switch, or leave collection on for everybody.

The goal is to put that switch **where the operator already is**, on the
conversation they already have open, for the one number behind it, for a bounded
period.

Two properties of the backend shape the entire surface and are not
implementation detail:

1. **The switch is a server-side proxy.** The dashboard calls
   `POST /agent/debug/toggle` on GOWA; GOWA signs the upstream call. A
   browser-side call to the omni API would put the shared agent secret
   (`AGENT_WEBHOOK_KEY` / `X-Agent-Signature`) inside a JavaScript bundle anyone
   can read, and that exposure survives the move to HMAC because the same secret
   is what signs.
2. **State lives upstream and is not readable back.** The omni side owns the
   TTL, GOWA stores nothing about which numbers have debug on, and there is **no
   endpoint that reads the current state**. So this is an *action*, not a
   settings switch, and the UI may never render an authoritative "debug is ON"
   state for any number.

## User story

> **As** an Account Administrator (and, with the same permission, a Super
> Administrator),
> **I want** to switch the omni AI agent's debug collection on or off for the
> phone number of the conversation I am looking at, for a bounded period,
> **so that** I can capture diagnostics for one customer's complaint while it is
> happening, instead of leaving collection on for everyone or asking a backend
> engineer to run the switch by hand.

## Functional requirements

| # | Requirement |
|---|---|
| REQ-1 | The only network call this ticket introduces is `POST /agent/debug/toggle` on the GOWA origin, issued through the existing same-origin API prefix and the existing axios client. |
| REQ-2 | The toggle acts on exactly one phone number — the one behind the open conversation. There is no bulk path and no second call. |
| REQ-3 | The surface exists only for a principal whose `permissions[]` from `GET /auth/me` contains `admin.debug.toggle`. Nothing is decided from a role name. |
| REQ-4 | The permission is resolved once at the height of the chats screen and travels down as a bare boolean prop, as the four permissions already resolved there do. |
| REQ-5 | The control lives in the existing per-conversation actions menu. No new page, route or navigation entry is added. |
| REQ-6 | The menu offers **two explicit outcomes** — collection on, collection off. The UI never infers `enabled` from a state it believes to be current, because no such state is readable. |
| REQ-7 | Choosing "on" opens a dialog showing the exact number that will be sent, offering an optional duration, and requiring one explicit confirmation before any request leaves. |
| REQ-8 | The request body always carries an explicit `enabled` boolean and a `phone` in E.164 form **with the leading plus**. `ttl_minutes` is sent only when the operator supplied one, and then only as a positive integer. |
| REQ-9 | Deriving the number from a `chat_jid` is a pure, unit-tested function in `src/lib/`, not inline string surgery in a component, and it answers "no number" rather than a malformed guess. |
| REQ-10 | The control is offered only for one-to-one WhatsApp conversations (`@s.whatsapp.net`). For a group, newsletter, status broadcast or `@lid` it is absent, silently. |
| REQ-11 | The UI never presents a persistent on/off state for any number. `expires_at` is treated as a cache at most, is considered expired once it passes, is in-memory only, and is never persisted. |
| REQ-12 | The UI never polls the toggle endpoint and never re-issues a toggle on its own — no retry loop, no refetch on focus, no automatic re-send. |
| REQ-13 | Every documented failure of this endpoint maps to its own readable message, distinguishing "your input was refused" (400), "nothing was applied" (the failures the reference documents as happening before the upstream call) and "the outcome is unknown" (everything else — AC-51). |
| REQ-14 | The decisions this feature makes are expressed as pure functions with colocated tests, because this repository has no component renderer able to reach a decision written inline in JSX. |

## Non-functional requirements and constraints

| # | Requirement |
|---|---|
| NFR-1 | **No secret in the browser.** Neither `AGENT_WEBHOOK_KEY` nor `X-Agent-Signature` is named, held, rendered, logged or stored anywhere in `src/`, and no request leaves for the omni origin. |
| NFR-2 | **No change to the conversation's request profile.** The chat list, the message list and the composer issue no additional request because of this ticket. |
| NFR-3 | **No permission subscription and no query observer inside a list row.** `MessageView` holds the composer's `draft` beside the message rows, so a hook there re-runs on every keystroke and a hook in a row is one subscription per message. |
| NFR-4 | **The dialog is a single instance owned by the open conversation's controls**, never one per chat-list row. |
| NFR-5 | The UI writes no log of its own: no `console.*`, no local audit record, no telemetry. The authoritative record is the server's. |
| NFR-6 | **No new runtime dependency** and no change to any deployment runtime file (`vite.config.ts`, `package.json`, `index.html`, the two workflow files). |
| NFR-7 | Validation profile `ui-source`: `npm run typecheck`, `npm run lint`, `npm run test`. |

## Acceptance criteria

### Scope and tenant safety

| ID | Criterion |
|---|---|
| AC-1 | The only network call introduced is `POST /agent/debug/toggle` on the GOWA origin, through the existing same-origin API path and the existing axios client. The browser never calls the omni API and never holds, renders, logs or stores the agent secret (`AGENT_WEBHOOK_KEY`, `X-Agent-Signature`) in any form. |
| AC-2 | The toggle acts on exactly one phone number — the one behind the conversation the operator has open. No bulk action, no "apply to all chats", no hidden second call for another number. |
| AC-3 | The request is device-scoped like the other device-bound calls: it carries the currently selected device through the `X-Device-Id` header. The surface is unreachable before a device is selected — `/chats` is behind `DeviceGuard` — and a request that nevertheless carries no device is refused by the **server** with `400 DEVICE_ID_REQUIRED` (AC-33), which is what TC-10 exercises. *(Reworded at the advisory panel: the original wording claimed the UI prevents the request from reaching the server, which is not what happens.)* |
| AC-4 | The conversation list, the message list and the composer issue no additional request because of this ticket: the conversation page's network profile on load is identical to today's. |

### Authorization

| ID | Criterion |
|---|---|
| AC-5 | The control is rendered only when `permissions[]` from `GET /auth/me` contains `admin.debug.toggle`. Nothing is decided from a role name — the seeded `user` role does not hold it, `admin` does, and `super_admin` reaches it through its own permission set. |
| AC-6 | Without that permission the control is **absent** from the DOM — not disabled, not greyed, not a tooltip explaining what the operator is missing. The rest of the chat actions menu is unchanged. |
| AC-7 | The permission is read once at the height of the screen (`src/pages/chats.tsx`) and passed down as a boolean prop. No permission hook and no `Can` guard is introduced inside the message list, a message row, or a component rendered once per message — the source-policy test already forbids it. |
| AC-8 | A principal who holds `admin.debug.toggle` but not `messages.debug.read` can still switch collection on; the two permissions are independent, and the UI does not require the read permission to expose the toggle. |

### The toggle surface — general behaviour

| ID | Criterion |
|---|---|
| AC-9 | The control lives in the existing per-conversation actions menu (`src/features/chat/chat-controls.tsx`), alongside pin / archive / disappearing. No new page, no new route, and no new top-level navigation entry is added. |
| AC-10 | The menu offers **two explicit outcomes** — "turn diagnostics collection on" and "turn diagnostics collection off". The UI never sends an `enabled` value inferred from a state it believes to be current, because that state is not readable (AC-23..AC-27). |
| AC-11 | Choosing "on" opens a small dialog that shows the target number, lets the operator optionally set a duration, and requires one explicit confirmation before any request is sent. |
| AC-12 | Choosing "off" sends `enabled: false` for the same number; no duration field is offered, since a duration is meaningless when switching off. |
| AC-13 | While a toggle request is in flight **every control that can send one** is disabled — the confirm button and the *Try again* button of the failure view alike — and the dialog cannot be dismissed. One operator action produces exactly one request; a second click cannot start a second call. *(Widened at the advisory panel: the original covered the confirm button only, leaving a slow retry two presses away from two toggles.)* |
| AC-14 | The dialog shows the exact number that will be sent, in the E.164 form that will be transmitted, so the operator can see what the request targets before confirming. |

### Request fields

| ID | Criterion |
|---|---|
| AC-15 | **`phone`** — derived from the conversation's `chat_jid`: the user part of the JID, with any device/agent suffix (`:<n>`) removed and the `@s.whatsapp.net` domain stripped, prefixed with `+`. A value without the leading plus is rejected by the server with 400 before any upstream call, so the UI must never send one. |
| AC-16 | **`enabled`** — a boolean chosen explicitly by the operator (AC-10). It is always present in the body; an omitted `enabled` is an error, never a default, so a malformed body can never silently switch debug *off* for a number the operator meant to switch *on*. |
| AC-17 | Both required fields are validated in the UI before the request is built; if either cannot be produced, no request is sent and the control is not offered in the first place. |
| AC-18 | **`ttl_minutes`** — omitted entirely when the operator leaves the duration empty (the upstream default then applies); when supplied it must be a **positive integer**. `0`, negatives, fractions and non-numeric input are rejected in the UI with a field-level message and no request is sent — the server rejects them with 400 as well, so UI and API agree. |
| AC-19 | The duration field offers a small set of sensible presets (30 / 60 / 120 minutes) plus a free numeric entry; whichever the operator picks, the value transmitted is a plain positive integer of minutes. |

### Chats that have no number

| ID | Criterion |
|---|---|
| AC-20 | The control is offered only for one-to-one WhatsApp conversations (`@s.whatsapp.net`). For a group (`@g.us`), a newsletter (`@newsletter`), `status@broadcast`, or any JID from which a phone number cannot be derived, the control is **absent**, with no error and no disabled placeholder. |
| AC-21 | A `@lid` conversation carries a linked id, not a phone number: no phone is invented from it and the control is absent there too. |
| AC-22 | Deriving the number is a pure, unit-tested function (a `src/lib/` helper next to the JID vocabulary), not inline string surgery in a component, and it returns "no number" rather than a malformed guess when the JID does not describe one. |

### Upstream state discipline

| ID | Criterion |
|---|---|
| AC-23 | The UI **never presents a persistent on/off state** for a number. There is no endpoint that reads the current state, so no badge, switch position, or list ever claims "debug is on for this number" as a fact read from the server. |
| AC-24 | The `expires_at` from the response is treated as **a cache at most**: it may be shown as reported by the agent, with its local-time expiry, immediately after a successful toggle, and it is considered **expired once that time passes**, after which the UI states nothing about the number. |
| AC-25 | Whatever the UI remembers from a successful toggle is in-memory only for the current session; it is not persisted to storage, and after a reload the UI makes no claim about any number's state. |
| AC-26 | The UI never polls the toggle endpoint, and never re-issues a toggle on its own (no automatic refresh, no retry loop, no re-send on window focus). |
| AC-27 | Any additional field the omni returns inside `results` is passed through and ignored rather than causing a parse failure; the documented shape is `{phone, enabled, expires_at}`, with `expires_at` null when debug was switched off. |

### Behaviour after a successful toggle

| ID | Criterion |
|---|---|
| AC-28 | A `200` response is confirmed to the operator with a short success message naming the number and the outcome ("collection on" / "collection off"), and, when `expires_at` is present, the local-time expiry. |
| AC-29 | When `enabled: false` is confirmed, `expires_at` is null and no expiry is shown; the UI does not display "expires at —" or an empty slot. |
| AC-30 | No query cache is invalidated by the toggle beyond what the surface itself needs: the conversation, its messages and the chat list are not refetched, because nothing about them changed. |
| AC-31 | The response's `phone` is what is echoed back to the operator, so a normalisation performed by the server is visible rather than hidden behind the value the UI sent. |

### Errors — UI and API consistency

| ID | Criterion |
|---|---|
| AC-32 | Every failure is surfaced through the existing API-error mapping (`src/lib/api-error.ts`) as a readable message; no raw error object, status code alone, or stack is shown, and nothing is written to the console (the source-policy test forbids console writes in `src/`). |
| AC-33 | `400 DEVICE_ID_REQUIRED` — the operator is told a device must be selected first; the toggle is not retried automatically. |
| AC-34 | `400 VALIDATION_ERROR` — the server's message is shown against the offending field where one can be identified (duration), otherwise as a general failure. No upstream call was made, so the UI states that nothing changed. |
| AC-35 | `401` — handled by the existing session/refresh path exactly as every other call; this ticket adds no bespoke 401 handling. |
| AC-36 | `502 AGENT_UPSTREAM_ERROR` — the omni could not be reached, refused with a non-2xx, or answered with a redirect: presented as "the AI agent could not be reached", the UI states that the switch was **not** applied, and offers the operator a manual retry (a button they press), never an automatic one. `502 AGENT_UPSTREAM_INVALID_RESPONSE` — the omni answered **2xx** with a body that is not a JSON object, so it accepted the command and only its answer was unreadable: presented as "the AI agent answered unexpectedly", the outcome is **unknown** (AC-51), and the same manual retry is offered. *(Split at the advisory panel: one message for both codes told the operator "nothing changed" about a change that had most likely happened.)* |
| AC-37 | `503 AGENT_DEBUG_DISABLED` — presented as a configuration fact ("diagnostics toggling is not configured on this server"), not as a transient failure. The message names that the deployment lacks the agent debug configuration, and the operator is not invited to retry. |
| AC-38 | `503 AGENT_DEBUG_BUSY` — presented as "too many toggles at once, try again shortly". The call was refused rather than queued, so the UI does not queue it either and performs no automatic retry. |
| AC-39 | `504 AGENT_UPSTREAM_TIMEOUT` — the outcome is **unknown**: the message says the toggle may or may not have been applied, and the UI makes no claim about the number's state (it does not show "on", does not show "off", and does not show an expiry). Re-issuing is an explicit operator action. |
| AC-40 | `413` — mapped through the same error path as any other request-too-large response; no special-casing beyond a readable message. |
| AC-41 | Every one of the above leaves the chat surface intact: the menu closes cleanly and the dialog stays open carrying the message, and no other control changes state as a side effect. |

### Audit and observability

| ID | Criterion |
|---|---|
| AC-42 | Success and failure are both observable to the operator in the UI (a confirmation on success, an error message on failure) — neither outcome is silent. |
| AC-43 | The UI writes no log of its own: no `console.*`, no local audit record, no telemetry call. The authoritative record of who toggled what is the server's; the UI does not duplicate it. |
| AC-44 | The transmitted number appears in the UI (dialog and confirmation) but is never placed in a URL, a query parameter, or a rendered shell command by this ticket. |

### Performance

| ID | Criterion |
|---|---|
| AC-45 | The toggle adds no query, subscription, hook or observer to the message row or the chat list; it is a mutation fired by an explicit operator action and nothing else. |
| AC-46 | The dialog's component is not mounted per chat-list row — the surface is a single instance owned by the open conversation's controls. |

### Testing

| ID | Criterion |
|---|---|
| AC-47 | Unit tests cover: JID to E.164 derivation (plain number, device-suffixed JID, group, newsletter, status, `@lid`, malformed); `ttl_minutes` validation (empty means the field is omitted, positive integer is sent, `0` / negative / fraction / text are rejected without a request); the body always carrying an explicit `enabled`; and the mapping of 400 / 502 / 503 (both codes) / 504 to their distinct messages. |
| AC-48 | Tests prove the control is absent without `admin.debug.toggle` and absent for a chat with no derivable number, and that a 504 leaves the UI making no state claim. |
| AC-49 | Validation profile `ui-source` (`npm run typecheck`, `npm run lint`, `npm run test`) passes, and the pre-existing suite still passes in full. |

### Added at the advisory review panel

| ID | Criterion |
|---|---|
| AC-50 | The `phone` echoed back from the response is rendered **only when it is itself a well-formed E.164 number** (`^\+[0-9]{5,20}$`); anything else falls back to the value the UI sent. The body is returned unmodified from an upstream this application does not control, and the sentence naming which customer's number was changed is the last place a bidi override or a five-kilobyte string may land. AC-31 is satisfied by the allow-list, not weakened by it: a genuine server-side normalisation is still a well-formed number and is still shown. |
| AC-51 | **An unexplained failure leaves the outcome unknown, not "not applied".** `applied: 'no'` is claimed **only** for the failures the reference documents as happening *before* the upstream call — `DEVICE_ID_REQUIRED`, `VALIDATION_ERROR`, `401`, `413`, `AGENT_DEBUG_DISABLED`, `AGENT_DEBUG_BUSY`. Every other outcome — a client-side timeout or dropped connection (`status: 0`), a 5xx minted by a proxy in front of GOWA with no envelope code, `AGENT_UPSTREAM_TIMEOUT`, `AGENT_UPSTREAM_INVALID_RESPONSE` — is reported as **unknown**, because each of them can occur after the command reached the agent. Telling an operator that nothing changed is a claim, and this UI makes it only where the server's own catalogue supports it. |

## Test cases

| ID | Case | Given | When | Then |
|---|---|---|---|---|
| TC-1 | An administrator switches collection on for one number | A principal whose `permissions[]` contains `admin.debug.toggle`, an open one-to-one conversation with `chat_jid` `963938113282@s.whatsapp.net`, and a selected device | The operator opens the chat actions menu, chooses "turn diagnostics collection on", sets 120 minutes and confirms | Exactly one `POST /agent/debug/toggle` is issued, with body `{"phone": "+963938113282", "enabled": true, "ttl_minutes": 120}` and an `X-Device-Id` header; no request is made to the omni API and no agent secret appears anywhere; on `200` a confirmation names the number, states collection is on, and shows the `expires_at` in local time; neither the chat list nor the message list is refetched. |
| TC-2 | Switching collection off | The same administrator and conversation | The operator chooses "turn diagnostics collection off" and confirms | The body is `{"phone": "+963938113282", "enabled": false}` — `enabled` is explicit and `ttl_minutes` is absent; the confirmation states collection is off and shows no expiry, because `expires_at` is null. |
| TC-3 | A reported expiry is a cache, not a state | A successful "on" toggle whose `expires_at` is two minutes in the future | That time passes, and again after the page is reloaded | Once the time passes the UI stops showing the expiry and makes no claim about the number; after a reload nothing at all is shown about the number's state and no request was made to discover it; no polling request to `/agent/debug/toggle` was issued at any point. |
| TC-4 | A duration of zero never reaches the server | The "turn on" dialog is open | The operator enters `0` (and again `-5`, `1.5`, `abc`) as the duration and confirms | A field-level validation message is shown for each; no `POST /agent/debug/toggle` request is issued in any of the four cases. |
| TC-5 | A group conversation offers no toggle | An administrator holding `admin.debug.toggle`, and an open conversation whose `chat_jid` ends in `@g.us` (and, separately, `@newsletter`, `status@broadcast`, `@lid`) | The chat actions menu is opened | No diagnostics-collection item is present in any of the four cases; no disabled item, tooltip or explanatory placeholder is rendered in its place; pin, archive and disappearing behave exactly as they do today. |
| TC-6 | A user-role principal sees no control | A principal whose `permissions[]` lacks `admin.debug.toggle`, and a one-to-one conversation that would otherwise qualify | The chat actions menu is opened | No diagnostics-collection item exists in the DOM; no error, banner or toast appears — the absence is silent; the menu's other items are unchanged. |
| TC-7 | The server has no agent integration configured | An administrator on a deployment where `AGENT_DEBUG_TOGGLE_URL` / `AGENT_WEBHOOK_KEY` are unset | The operator confirms a toggle and the server answers `503 AGENT_DEBUG_DISABLED` | The message states that diagnostics toggling is not configured on this server; it is worded as a configuration fact, not a transient failure, and no retry is offered or attempted; the UI claims nothing about the number's state. |
| TC-8 | An upstream timeout leaves the outcome unknown | An administrator confirming a toggle | The server answers `504 AGENT_UPSTREAM_TIMEOUT` | The message states that the toggle may or may not have been applied; the UI shows neither "on" nor "off" nor an expiry for that number; no automatic re-issue happens — re-trying is an explicit operator action. |
| TC-9 | The toggle is refused because the cap is reached | An administrator confirming a toggle | The server answers `503 AGENT_DEBUG_BUSY` | The message says to try again shortly; the request is not queued and is not retried automatically. |
| TC-10 | No device is selected | An administrator with no device selected | A toggle is attempted and the server answers `400 DEVICE_ID_REQUIRED` | The message tells the operator to select a device first; no upstream call was made and nothing about the number changed. |
| TC-11 | An unclassified failure never claims "nothing changed" | An administrator confirming a toggle | The request aborts client-side after the 45-second axios budget (`status: 0`), and separately a proxy answers `504` with no GOWA envelope | Both are reported as **outcome unknown** — neither says the switch was not applied, and neither shows an expiry or a state for the number. |
| TC-12 | A hostile echoed number cannot reorder the confirmation | A `200` whose `results.phone` is `+963938113282` followed by `U+202E`, and separately a 5 000-character string | The confirmation renders | The echoed value is refused by the E.164 allow-list and the number the UI sent is shown instead; no format character and no oversized string reaches the sentence. |

## Out of scope

- Reading back which numbers currently have debug on — the backend exposes no
  such endpoint, and GOWA stores nothing.
- The message diagnostics panel and the `include_debug` opt-in (ticket 12,
  `z8pmx9mv3v`), and the voice-note transcript (ticket 13, `z8pmx9mv3w`).
- The retention sweep behind `admin.retention.run`
  (`POST /agent/debug/retention/run`) and any retention UI.
- Configuring `AGENT_DEBUG_TOGGLE_URL` / `AGENT_WEBHOOK_KEY` from the dashboard.
- Toggling for several numbers at once, or from the chat list.
- Any direct browser call to the omni API.
- Changes to the composer, media download, the transcript, the diagnostics panel
  or the existing chat actions.

---
ticket: z8pmx9mv3v
stage: spec
mode: standard
status: complete
owner: developer
updated: 2026-09-15
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3v"
  github: ""
---

# Specification — 12 · A message's AI diagnostics, behind an explicit opt-in

## Business goal

An operator who has to explain *why* the agent answered the way it did currently
has no way to see what the backend stored against the message. The payload exists
— `metadata_debug` — but it is expensive to carry and it is one of the fields the
backend **deletes** from the JSON for a principal without `messages.debug.read`.

The goal is to make that payload reachable from the conversation the operator is
already reading, **without** turning every conversation read into a diagnostics
download, and without ever building a UI state out of a field's absence.

## User story

> **As** an Account Administrator,
> **I want** to see the AI diagnostics stored against a message, and to ask for
> them explicitly rather than on every page load,
> **so that** I can explain why the agent answered the way it did without turning
> every conversation read into a diagnostics download.

## Functional requirements

| # | Requirement |
|---|---|
| REQ-1 | The diagnostics surface — opt-in control, per-message badge, per-message panel — exists only for a principal whose `permissions[]` from `GET /auth/me` contains `messages.debug.read`. |
| REQ-2 | The permission is resolved once, at the height of the chats screen, and travels into the message view and the message row as a boolean. |
| REQ-3 | The messages toolbar carries one opt-in control that asks the server to embed the stored diagnostics payload with the page. It is off on first load. |
| REQ-4 | `GET /chat/{jid}/messages` carries `include_debug=true` only while the opt-in is on; otherwise the parameter is absent from the query string. |
| REQ-5 | The opt-in is part of the message query's cache key. |
| REQ-6 | A message row shows a diagnostics badge when `has_debug === true`, whether or not the opt-in is on. |
| REQ-7 | Opening the badge reveals a panel showing the diagnostics for that one message; the panel is collapsed on first render. |
| REQ-8 | With `metadata_debug` embedded on the message, the panel renders that value and issues no request. |
| REQ-9 | With `metadata_debug` absent and `has_debug === true`, the panel fetches `GET /message/{message_id}/debug` for that message alone, on open. |
| REQ-10 | The payload is rendered as formatted, read-only text. |
| REQ-11 | A failed per-message fetch shows an inline error on that panel, carrying the message from the structured API error. |
| REQ-12 | Every read of a maskable field tests for the **key** (`hasField`), or, for `has_debug`, uses `hasDiagnostics`. |
| REQ-13 | A missing key produces no error, no toast, no banner, no retry and no placeholder — it renders as nothing at all. |
| REQ-14 | The client for `GET /message/{message_id}/debug` lives in the API layer with the rest of the message endpoints. |

## Non-functional requirements

| # | Requirement |
|---|---|
| NFR-1 | No new store subscription and no new query observer is created by an unopened message row. |
| NFR-2 | The message row stays memoised and its props stay comparable, so composer keystrokes do not re-render the list. |
| NFR-3 | Nothing from the server is rendered as HTML, and nothing from the payload is written to the console. |
| NFR-4 | `metadata_debug` is never passed through `JSON.parse`. |
| NFR-5 | No new runtime dependency; nothing is added to the single-file bundle beyond this feature's own code. |
| NFR-6 | Key presence and permission stay separate authorities: the redaction module still imports no permission module, and the reverse. |

## Constraints

- **Masking is key deletion** (§09). `has_debug === false` and
  `metadata_debug || {}` are both wrong and both look right.
- **A caller without the permission who sends `include_debug=true` is ignored
  silently** — no `403`. So a control that fires such a request is a control that
  looks broken, and no error state may ever be built from the fields' absence.
- **The page carries a 1 MiB embedding budget.** A message past it still reports
  `has_debug: true` with no payload attached, so the badge may not be driven by
  the presence of `metadata_debug`.
- **`GET /message/{message_id}/debug` is not in `openapi.yaml`** (§12). Its
  request shape is taken from §08 and its response shape is treated as unproven.
- There is **no component renderer** in this test environment — no jsdom, no
  React Testing Library — and adding one is out of scope (NFR-5). Assertions on
  rendered output are made with `react-dom/server`.

## Acceptance criteria

### Authorization

| ID | Criterion |
|----|-----------|
| AC-1 | The opt-in control, the per-message badge and the panel render only when `permissions[]` contains `messages.debug.read`. No decision anywhere in this ticket reads a role name. |
| AC-2 | Without the permission the controls are **absent from the DOM**, not disabled. |
| AC-3 | Without the permission no request carries `include_debug`, and `GET /message/{message_id}/debug` is never called. |
| AC-4 | The permission is read once in `src/pages/chats.tsx` and passed down as a boolean prop. No permission hook and no `<Can>` is added inside the message view, the message row, or the diagnostics component. |

### The opt-in

| ID | Criterion |
|----|-----------|
| AC-5 | One control on the messages toolbar turns diagnostics embedding on for the conversation being read; it is **off** on first load and no request sends `include_debug` until it is turned on. |
| AC-6 | `include_debug=true` is sent only while the control is on. While it is off the parameter is **absent** from the query string, and it is never sent as `false`. |
| AC-7 | The flag is part of the message query's cache key, so switching it refetches and the two answers never overwrite each other. |
| AC-8 | The control says what it does — that it asks the server to embed the stored diagnostics payload with the page — rather than being labelled only "debug". |

### The badge

| ID | Criterion |
|----|-----------|
| AC-9 | A message carries a badge when `has_debug === true`. An explicit `has_debug: false` is never expected. |
| AC-10 | The badge is driven by `has_debug`, **not** by the presence of `metadata_debug`. |
| AC-11 | The badge appears whether or not the opt-in is on. |
| AC-12 | A message with no badge shows nothing at all in its place — no "no diagnostics" text, no empty panel. |

### The panel

| ID | Criterion |
|----|-----------|
| AC-13 | Opening the badge shows the diagnostics for that one message; when `metadata_debug` is present on the message, that value is rendered directly. |
| AC-14 | When `metadata_debug` is absent while `has_debug` is true, the panel fetches `GET /message/{message_id}/debug` for that message alone, on open — never for the whole page, never before the operator opens it. |
| AC-15 | `metadata_debug` is never passed through `JSON.parse`; it is displayed as formatted, read-only text. |
| AC-16 | The payload is rendered as text only. Nothing from the server is rendered as HTML anywhere in this ticket, and nothing from the payload is written to the console. |
| AC-17 | The panel is collapsed by default and the per-message fetch is gated on the open state: a conversation of thirty messages issues zero diagnostics requests until something is opened. |
| AC-18 | A failed per-message fetch shows an inline error on that panel, carrying the message from the structured API error. This is the only error path in the ticket. The server's text is capped and stripped before it renders; it is never rendered raw or unbounded. |
| AC-26 | **An opened panel with nothing to show renders nothing at all** — no box, no border, no placeholder text. A `200` whose answer is empty, not an object, or carries no recognisable payload is the same silence as a missing key (added at review; security lens 6). |
| AC-27 | The payload is offered no bulk-copy affordance: no clipboard control, no download link, no cURL surface, and no `href` or `src` built from it (added at review; security lens 9). |

### Redaction discipline

| ID | Criterion |
|----|-----------|
| AC-19 | Every read of a maskable field tests for the key, through `hasField`, or through `hasDiagnostics` for `has_debug`. The value-comparison spellings of those reads appear nowhere in `src/`. |
| AC-20 | A missing key produces no error, no toast, no banner and no retry — it renders as nothing at all, silently. |
| AC-21 | Key presence never gates an action or a request: whether the surface exists is answered by `permissions[]`, whether one payload is embedded is answered by the key, and the redaction module still imports no permission module. |

### Performance

| ID | Criterion |
|----|-----------|
| AC-22 | The message row stays memoised and its props stay comparable — booleans and stable identities — so composer keystrokes do not re-render the list. Any per-message query is created only inside the opened panel. |
| AC-23 | Turning the opt-in on does not change the page size or the paging position; it changes only what each message carries. |

### Testing

| ID | Criterion |
|----|-----------|
| AC-24 | Unit tests cover: the parameter is absent when the opt-in is off and present when on; the badge decision for `has_debug` true, absent and explicitly `false`; the panel's choice between the embedded payload and the per-message fetch; and that no request is issued without the permission. |
| AC-25 | Validation profile `ui-source` is green: `npm run typecheck`, `npm run lint`, `npm run test`. |

## Test cases

| ID | Case | Given | When | Then |
|----|------|-------|------|------|
| TC-1 | The first load asks for no diagnostics | an administrator opening a conversation | the message page is requested | the query string carries no `include_debug` at all; messages that carry diagnostics still show a badge. |
| TC-2 | An embedded payload is shown without a second request | the opt-in is on and a message came back carrying `metadata_debug` | the operator opens that message's diagnostics | the embedded object is displayed as indented, read-only text; no `GET /message/{id}/debug` is issued; `JSON.parse` was never called on the value. |
| TC-3 | A message past the page budget is fetched on its own | a message with `has_debug` true and no `metadata_debug` key | the operator opens its diagnostics | exactly one `GET /message/{message_id}/debug` is issued, for that message id; the panel renders the returned payload; no other message issued a request. |
| TC-4 | A user-role principal sees no diagnostics surface at all | a principal whose `permissions[]` lacks `messages.debug.read` | the conversation is opened and read | the opt-in control is not in the DOM; no message shows a badge; no request carries `include_debug` and no debug endpoint is called; no error, banner or toast appears. |
| TC-5 | A permitted principal with nothing stored sees nothing, not an empty panel | an administrator and a message whose `has_debug` key is absent | the conversation is read | the message shows no badge and no placeholder; the row is visually identical to a message that never carried diagnostics; no code path asserted an explicit `false`. |
| TC-6 | An explicitly requested payload that fails says so | the operator opened the diagnostics of an over-budget message and the request fails | the panel renders | an inline error appears on that panel only, carrying the structured API error message; the conversation keeps rendering; nothing is written to the console. |
| TC-7 | The opt-in is part of the cache key | the operator reads a page, then turns the opt-in on | the toggle changes | the query refetches under a distinct key and the two answers do not overwrite each other; the paging position is unchanged. |
| TC-8 | An explicit `false` is not a badge | a message carrying `has_debug: false` | the conversation is read | no badge is rendered — the decision is `=== true`, never a negated comparison. |
| TC-9 | An opened panel with nothing to show is silent | a permitted operator opens an over-budget message and the endpoint answers `200` with an empty or unrecognisable body | the panel renders | nothing at all appears — no box, no border, no "no diagnostics" text, and no error (AC-26). |

## Out of scope

- The origin badge from `sent_via` / `sent_by_name`.
- The administrative diagnostics toggle (`admin.debug.toggle`,
  `POST /agent/debug/toggle`) and the retention sweep.
- The voice transcript surface, which is its own ticket.
- Any change to media download, paging, or the composer.
- Writing `metadata_debug` on `POST /send/message`.

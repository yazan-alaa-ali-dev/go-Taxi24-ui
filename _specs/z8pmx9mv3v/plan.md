---
ticket: z8pmx9mv3v
stage: plan
mode: standard
status: complete
owner: developer
updated: 2026-09-15
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3v"
  github: ""
---

# Plan — 12 · A message's AI diagnostics, behind an explicit opt-in

> **Revision 2.** Revision 1 was authored for the advisory review panel
> (`senior-reviewer`, `security-reviewer`, `performance-reviewer` — the lenses
> `/review` dispatches) before any code was written. The panel returned **32
> findings** across the three lenses, **four of them raised independently by two
> lenses**, and every one is answered in **Panel response** at the end of this
> file. Fourteen changed the design and those changes are folded into the
> sections below; two changed `spec.md` (`AC-26` and `AC-27` added).
>
> The four findings raised twice are the ones that mattered most: a source-policy
> rule that **contradicted the code the plan itself wrote** (senior 1 / security
> 2), a maskable-field rule that was **shape-matched and trivially evadable**
> (senior 3 / security 3), the per-message query's `enabled` gate **omitting the
> permission** so `AC-3` had no executable guard (senior 5 / security 4), and the
> per-message cache key **dropping the `chat_jid` discriminator** its sibling
> carries (performance 7 / senior 11).

## Approach

The permission layer, the redaction layer and the chats surface all already
exist, and this ticket is deliberately shaped so that **none of them changes its
contract**:

- `src/lib/redaction.ts` already exports `hasField` and — written for this exact
  field — `hasDiagnostics`, whose doc comment already says `=== true` is the only
  correct test. Nothing is added to that module.
- `src/lib/permissions.ts` already carries `MESSAGES_DEBUG_READ`
  (`messages.debug.read`), documented as "read `metadata_debug` and `has_debug`".
  Nothing is added to that module either.
- `src/pages/chats.tsx` already resolves three permission booleans plus
  `base_path` once, above the list, and passes them down — the file's own header
  explains why: `MessageView` holds the composer's `draft` in the same component
  that renders the rows, so a hook there is re-evaluated **per keystroke**. A
  fourth boolean joins the three.

So the ticket is: one translated query parameter, one new API client function,
one pure decision module, one new per-message component, and four small edits.

**The dominant design constraint is that this repository has no component
renderer in its test environment** (no jsdom, no React Testing Library — see
`src/components/shared/can.test.tsx`, which explains the choice and renders with
`react-dom/server` instead). A decision written inline in JSX is a decision no
test can reach. So every decision this feature makes is lifted into a pure
function with a colocated test, the components stay thin enough that
`renderToStaticMarkup` can answer the two questions that are genuinely about
output, and everything the renderer cannot reach is asserted **textually** in
`src/lib/source-policy.test.ts` — which is the only reach a suite with no
renderer has, and the idiom this repository already uses for exactly that.

Six decisions are forks this ticket could have taken and did not:

1. **The wire name `include_debug` exists in exactly one file.** Revision 1 built
   the parameter at the call site and then wrote a source-policy rule claiming
   the name lived in two files — a rule that would have failed the build on the
   day the feature landed (senior 1, security 2). Rather than widen the rule into
   an exemption, the design moved: `ChatMessagesParams` carries a UI-level
   `includeDebug?: boolean`, `getChatMessages` translates it, and the wire
   spelling appears in `src/api/chat.ts` and nowhere else in `src/`. The rule is
   then true rather than allowlisted. This also removes `includeDebugParam`
   altogether (senior 8): the guarantee is carried by the translation and
   asserted against the **serialised URL**, which is what `AC-6` is actually
   about.

2. **The per-message query lives in a component that only mounts when the panel
   is open** — not in the badge with an `enabled: open` gate. `MessageMedia`
   takes the `enabled` route, and `AC-22` permits matching it, but the stronger
   shape costs nothing here: the badge holds `open` state and renders
   `<DiagnosticsPanel>` only when `open` is true, so an unopened row mounts **no
   observer at all**. (Revision 1 claimed a disabled `useQuery` "runs no hook",
   which is not true of React — senior 9. The corrected guarantee is the one
   above, and it is stronger.)

3. **The panel latches its source when it opens.** `diagnosticsSource(message)`
   is read **once**, in a `useState` initialiser. Recomputing it per render is
   the N+1 the performance lens found (finding 2): with five panels open,
   flipping the opt-in *off* replaces every row with one carrying no
   `metadata_debug`, every open panel flips `embedded → fetch`, and one switch
   flip becomes five simultaneous requests. Latching makes a fetch reachable only
   by an operator opening a row, which is what `AC-14` and `AC-17` actually say.

4. **The badge component decides its own absence.** `MessageDiagnostics` takes
   `message` and `canRead` and returns `null` unless both the permission boolean
   and `hasDiagnostics(message)` say yes — one testable component instead of a
   `&&` chain in `MessageBubble`'s JSX where no test can reach it. Its `useState`
   is declared **before** the early return, so the early return is not a
   conditional hook.

5. **The debug endpoint's shape is decided on the KEY, and an unrecognised answer
   renders nothing.** §12 states plainly that `GET /message/{message_id}/debug`
   is *not* in `openapi.yaml`, so its envelope is the one thing here specified
   nowhere. Revision 1 wrote a value-shaped `??`-equivalent — the only
   value-shaped decision in a ticket whose entire discipline is key-shaped
   (security 1). It is now: unwrap when `metadata_debug` is the object's **sole**
   key (senior 7 — a sibling key means the operator was sent more than the
   payload and discarding it would be worse than showing it); render the object
   as-is when it carries other keys; and render **nothing at all, silently** when
   the answer is not an object or is empty (security 6). No arm invents an error.

6. **`messages.debug.read` is in the query's `enabled`, not only in the JSX.**
   `message-media.tsx` already writes `enabled: open && canDownload` and
   `source-policy.test.ts` already asserts that line — because a hidden control
   whose request still fires manufactures the refusal the guard existed to spare
   the user. Revision 1 gated only on the source decision, leaving `AC-3` with no
   executable guard anywhere (senior 5, security 4). `canRead` is now threaded
   into the panel and into `enabled`, and asserted textually.

### Accepted risk, recorded rather than implicit

`metadata_debug` is **arbitrary server-authored content of unknown schema and
unknown sensitivity** — it may contain system prompts, model parameters, customer
PII, or references to credentials the agent was configured with — and this ticket
puts it on screen verbatim behind a single permission, with no field-level
redaction (security 9). That is the ticket's stated purpose and the backend is
the authority that decides who may read it. What the UI controls, and does: the
panel is collapsed by default and never auto-expands; nothing copies the payload
in bulk (no clipboard control, no download link, no cURL surface); the text is
capped and stripped before it renders; the cache holding it is bounded; and the
whole surface is absent for a principal without the permission.

## Steps

### 1 — The wire (`src/api/chat.ts`, `src/api/message.ts`)

`ChatMessagesParams` gains a **UI-level** field, deliberately *not* the wire
spelling:

```ts
/**
 * Opt in to embedding each message's stored diagnostics payload with the page
 * (§08). Named in the UI's spelling and translated below, so the wire name
 * `include_debug` exists in this file and nowhere else in `src/`.
 */
includeDebug?: boolean
```

and `getChatMessages` performs the translation:

```ts
export function getChatMessages(chatJid: string, { includeDebug, ...params }: ChatMessagesParams) {
  return results<{ data: MessageInfo[]; pagination: Pagination; chat_info: ChatInfo }>(
    http.get(`/chat/${enc(chatJid)}/messages`, {
      // `true` or ABSENT — never `false` (§08). axios drops an `undefined`
      // param from the query string, and the reference's rule is that the
      // parameter is not sent at all when the operator has not asked for it.
      params: { ...params, include_debug: includeDebug ? true : undefined },
    }),
  )
}
```

`src/api/message.ts` gains the client, beside `downloadMedia`:

```ts
/** The stored diagnostics of one message (§08; not in openapi.yaml — see §12). */
export function getMessageDebug(messageId: string) {
  return results<unknown>(http.get(`/message/${enc(messageId)}/debug`))
}
```

No `phone`/`chat_jid` parameter: unlike `/download`, §08 documents this route by
message id alone. `unknown` rather than a guessed interface, for the same reason
fork 5 gives — the shape is decided at the point of use, on the key.

### 2 — The decisions (`src/lib/diagnostics.ts`, new)

A pure module — no React, no axios, no store. It imports the `MessageInfo` type
from `@/api/chat` (the house pattern: `lib/user-admin.ts`, `lib/send-channel.ts`
and `lib/device-scope.ts` all take their shapes from `@/api/` rather than
hand-rolling one — senior 6), `hasField`/`hasDiagnostics` from `./redaction`,
`displayText` from `./surfaces` (the single owner of the control/format strip;
`lib/user-admin.ts` and `lib/send-channel.ts` already import it the same way),
and the `ApiError` **type** only. It imports **no permission module**: the
permission arrives as a boolean argument, so the two authorities stay separate
(`AC-21`, NFR-6).

```ts
/** What the panel has to show, if anything. */
export type Diagnostics = { kind: 'payload'; value: unknown } | { kind: 'none' }

/** Embedded with the page, or fetched for this message alone. */
export type DiagnosticsSource = { kind: 'embedded'; payload: unknown } | { kind: 'fetch' }

/** Does this row show a badge? Permission AND `has_debug === true`. */
export function showsDiagnosticsBadge(message: DiagnosticsOf, canRead: boolean): boolean

/** Decided on the KEY, never on the value (§09). */
export function diagnosticsSource(message: DiagnosticsOf): DiagnosticsSource

/** What the undocumented debug endpoint sent, or `none`. Key-shaped (§12). */
export function debugPayloadOf(results: unknown): Diagnostics

/** Indented, stripped, capped, read-only text. `JSON.stringify`, never `JSON.parse`. */
export function diagnosticsText(value: unknown): string

/** The one error path: a fixed lead sentence plus capped server detail. */
export function diagnosticsFailure(error: ApiError): string
```

where `DiagnosticsOf = Pick<MessageInfo, 'has_debug' | 'metadata_debug'>`.

`diagnosticsText` is `displayText(JSON.stringify(value, null, 2), MAX_DIAGNOSTICS_TEXT)`
with `MAX_DIAGNOSTICS_TEXT = 20_000`. Three things it buys, each asked for:

- **A cap** (performance 4): one oversized payload cannot jank the chat scroll,
  and the ellipsis `displayText` appends is an honest signal that it was cut.
- **The control/format strip**: verified rather than assumed —
  `JSON.stringify` does **not** escape `U+202E`, so a bidi override inside a
  stored payload survives into the `<pre>` and reorders what is rendered around
  it. `surfaces.ts` owns that regex and its header says in as many words that a
  second copy is the divergence it exists to prevent, so it is imported, not
  re-declared.
- **The empty answer**: `JSON.stringify(undefined)` is `undefined`, not a string,
  and `displayText` collapses absence to `''` — which the panel renders as
  nothing at all (security 6, `AC-26`).

`diagnosticsFailure` does not render the server's text bare (security 7). It is a
fixed sentence — *"The diagnostics could not be loaded."* — plus, when the server
said something, that text stripped and capped through the same `displayText`. The
`GET` carries no request body, so nothing the UI sent can be echoed back through
it.

### 3 — The per-message surface (`src/features/chat/message-diagnostics.tsx`, new)

Two components in one file:

- **`MessageDiagnostics({ message, canRead })`** — holds `open`; returns `null`
  unless `showsDiagnosticsBadge(message, canRead)`. Renders a `<button>` styled
  as a `Badge` (`asChild`), with `aria-expanded`, a single `Bug` icon
  (performance 9: one icon, not two) and the text "Diagnostics". When `open`,
  renders `<DiagnosticsPanel message={message} canRead={canRead} />` beneath it.
  Nothing in the file is ever rendered `disabled` — absence hides (`AC-2`).

- **`DiagnosticsPanel({ message, canRead })`** —

  ```tsx
  // Read ONCE, when the panel opens. Recomputing per render turns a single
  // opt-in flip into one request per open panel: turning the embed OFF replaces
  // every row with one carrying no `metadata_debug`, and every open panel would
  // flip from `embedded` to `fetch` at the same instant.
  const [source] = useState(() => diagnosticsSource(message))

  const query = useQuery({
    queryKey: ['message-debug', message.id, message.chat_jid],
    queryFn: () => getMessageDebug(message.id),
    // `canRead` belongs here as well as in the badge above, exactly as
    // `message-media.tsx` writes `enabled: open && canDownload`: a hidden
    // control whose request still fires manufactures the refusal the guard
    // existed to spare the user — and this is the only executable guard a suite
    // with no renderer can put on AC-3.
    enabled: canRead && source.kind === 'fetch',
    staleTime: Infinity,
    // The client default keeps an unobserved query for five minutes. This one
    // holds arbitrary server-authored diagnostics, so it follows the precedent
    // `webhook-dialog.tsx` set for a payload holding a signing secret: long
    // enough to survive a re-open, short enough that a closed panel does not
    // leave the payload in memory for an idle session.
    gcTime: 60_000,
    retry: false,
  })

  const text = useMemo(
    () => diagnosticsText(source.kind === 'embedded' ? source.payload : debugPayloadOf(query.data)),
    [source, query.data],
  )
  ```

  and renders: the spinner while fetching; `diagnosticsFailure(toApiError(query.error))`
  inline on failure — the file's only error path (`AC-18`); **nothing at all**
  when `text === ''` (`AC-26`); otherwise the text as a child of a `<pre>`.

  The `<pre>` carries `dir="ltr"`, `overflow-auto`, `max-h-64` and
  `whitespace-pre-wrap break-all`, so a long payload cannot widen the bubble out
  of the viewport.

React escapes a text child; there is no `dangerouslySetInnerHTML` anywhere (an
executable rule already), no `console.` call (a repository-wide ban already), and
nothing from the payload reaches an `href`, a `src` or the clipboard.

### 4 — The row and the view (`src/features/chat/message-view.tsx`)

`MessageBubble` gains one **boolean** prop, `canReadDiagnostics` — a bare
boolean, never an object or a callback, or `memo()` breaks on all 30 rows
(performance 8) — and one line of JSX after the media block:

```tsx
<MessageDiagnostics message={message} canRead={canReadDiagnostics} />
```

`MessageView` gains `mayReadDiagnostics: boolean` and three pieces of state work:

1. **The opt-in.** `const [includeDebug, setIncludeDebug] = useState(false)`. The
   toolbar renders, **only when `mayReadDiagnostics`**, a second `Switch` beside
   "Media only", labelled **"Embed diagnostics"** with the helper line *"Ask the
   server to send each message's stored AI diagnostics with the page — worth
   turning on when you are about to inspect several messages."* (`AC-8`, and
   performance 6, which asked that the trade be framed rather than hidden: with
   the panel collapsed by default and already fetching per message on open, the
   embed only pays for itself when several rows are opened from one page.) It
   does **not** reset `offset` — unlike `search` and `mediaOnly`, which change
   *which* messages exist, this changes only what each one carries (`AC-23`).

2. **A debounced search** (performance 1, the lens's only cross-cutting finding).
   `search` today enters the query key on **every keystroke**, so typing five
   characters issues five requests. That is tolerable for a text-only page and is
   not tolerable once each of those pages may carry up to the full 1 MiB
   embedding budget — this ticket would otherwise turn an existing inefficiency
   into a bandwidth problem. The `Input` stays fully controlled and responsive;
   only the value that reaches the query key is deferred, by 300 ms:

   ```ts
   const [search, setSearch] = useState('')
   const [debouncedSearch, setDebouncedSearch] = useState('')
   useEffect(() => {
     const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
     return () => clearTimeout(timer)
   }, [search])
   ```

3. **The query.**

   ```ts
   queryKey: ['chat-messages', chat.jid, { search: debouncedSearch, mediaOnly, offset, includeDebug }],
   queryFn: () => getChatMessages(chat.jid, {
     search: debouncedSearch || undefined,
     media_only: mediaOnly || undefined,
     limit: PAGE_SIZE,
     offset,
     // The control is absent without the permission, so this cannot be true
     // without it — but a permission that changes UNDER a component which
     // already toggled it must not leave the flag on. The same belt-and-braces
     // `message-media.tsx` documents on its own `enabled`.
     includeDebug: mayReadDiagnostics && includeDebug,
   }),
   // An embedded page can carry up to 1 MiB and this SPA never reloads, so the
   // heavy variants are collected promptly instead of sitting for the client
   // default of five minutes. The text-only page keeps the default.
   gcTime: includeDebug ? 60_000 : undefined,
   ```

   The key stays prefixed by `chat.jid`, so the existing post-send
   `invalidateQueries({ queryKey: ['chat-messages', chat.jid] })` keeps matching.
   That invalidation refetches **only the active observer** (TanStack's default
   `refetchType: 'active'`; the rest are marked stale), so a send costs one page
   refetch, not one per cached variant (performance 5).

### 5 — The screen (`src/pages/chats.tsx`)

One more hoisted boolean beside the existing three, above the `if (!device)`
return, passed into `MessageView`:

```ts
const mayReadDiagnostics = useHasPermission(PERMISSIONS.MESSAGES_DEBUG_READ)
```

### 6 — Tests

| File | Covers |
|---|---|
| `src/lib/diagnostics.test.ts` (new) | `showsDiagnosticsBadge` for `has_debug` true / absent / explicit `false` / without the permission (`AC-9`, `AC-10`, `AC-11`, TC-5, TC-8); `diagnosticsSource` embedded vs fetch, including `metadata_debug` present while `has_debug` is absent, and embedded `null` / `0` / `''` / `false` payloads which a truthiness test would misroute (`AC-13`, `AC-14`); `debugPayloadOf` for the sole-key, sibling-key, empty-object, non-object and absent answers (`AC-26`); `diagnosticsText` indents, strips a bidi override, caps with an ellipsis, answers `''` for `undefined`, and never parses (`AC-15`); `diagnosticsFailure` leads with the fixed sentence and caps the server's text (`AC-18`). |
| `src/api/chat.test.ts` (new) | Against the axios adapter, as `users.test.ts` does: with the opt-in on, `http.getUri(sent[0])` **contains** `include_debug=true`; with it off it **does not contain** `include_debug` at all, and `sent[0].params` equals the three real params (`AC-6`, TC-1). Asserting the serialised URI rather than `Object.keys(params)` is the correction the senior lens supplied — a key present with an `undefined` value is absent from the query string but present in the object. |
| `src/api/message.test.ts` (new) | `getMessageDebug` issues exactly one `GET` to `/message/<percent-encoded id>/debug`, with no params (`AC-14`, TC-3). |
| `src/features/chat/message-diagnostics.test.tsx` (new) | `renderToStaticMarkup`, as `can.test.tsx` does: `canRead: false` with `has_debug: true` → empty markup (`AC-2`, TC-4); `has_debug` absent → empty (`AC-12`, TC-5); `has_debug: false` → empty (TC-8); permitted + `has_debug: true` → a badge whose panel is **not** in the initial markup (`AC-17`). No query client is needed, because an unopened row mounts no observer — which is the guarantee itself. |
| `src/lib/source-policy.test.ts` (edited) | The executable rules below. |

### 7 — Executable source policy (`src/lib/source-policy.test.ts`)

Revision 1 proposed five rules. Two of them **duplicated rules that already exist
with empty allowlists** — `console.` is banned repository-wide and
`dangerouslySetInnerHTML` likewise (senior 4) — one **contradicted the code**
(senior 1, security 2) and one was **shape-matched and evadable** (senior 3,
security 3). The rules that survive are the ones that are new, true, and not
evadable by a rename:

1. **Containment, not shape-matching.** `has_debug` and `metadata_debug` may be
   *named* only in `src/api/chat.ts` (the declaration), `src/lib/redaction.ts`
   (`MASKED_FIELDS`, `hasDiagnostics`) and `src/lib/diagnostics.ts` (the
   decisions). The component reads through `showsDiagnosticsBadge` /
   `diagnosticsSource` and needs neither name. This is the repository's
   `\baccess_token\b` idiom, and it cannot be evaded by `?.`, by a bracket
   access, by destructuring or by a Yoda comparison — all four of which slip past
   the four regexes revision 1 proposed. A `=== false` / `!== true` ban is kept
   beside it as a cheap second net. (`AC-19`.)
2. **`include_debug` is named in `src/api/chat.ts` and nowhere else** in `src/`,
   and the literals `include_debug: false` / `include_debug=false` appear
   nowhere. True by construction after fork 1 — no allowlist. (`AC-6`.)
3. **`getMessageDebug` is called from one file.** The name may appear only in
   `src/api/message.ts` and `src/features/chat/message-diagnostics.tsx`, and that
   file's `useQuery` must read `enabled: canRead && source.kind === 'fetch'` —
   the same textual assertion already made against `message-media.tsx`'s
   `enabled: open && canDownload`. This is the executable guard for `AC-3`.
4. **The boolean actually reaches the row.** `chats.tsx` matches
   `useHasPermission(PERMISSIONS.MESSAGES_DEBUG_READ)` and
   `mayReadDiagnostics={mayReadDiagnostics}`; `message-view.tsx` matches
   `canRead={canReadDiagnostics}`. TypeScript catches a *missing* prop, not a
   *wrong* one — `canRead={mayCompose}` type-checks and fails open (security 5).
5. **`message-diagnostics.tsx` joins the existing `LISTS` array**, so the
   standing rule "neither unwindowed list opens a permission subscription of its
   own" covers it — no `useHasPermission*`, no `<Can>` (`AC-4`) — and
   `'MESSAGES_DEBUG_READ'` joins the existing permission loop over `chats.tsx`
   rather than becoming a rule of its own (senior 4).
6. **No `JSON.parse` and no `disabled`** in `diagnostics.ts` or
   `message-diagnostics.tsx` (`AC-15`; `AC-2`, security 10).
7. **The panel latches its source**: `message-diagnostics.tsx` matches
   `useState(() => diagnosticsSource(` — the assertion that keeps fork 3 true.

## Files to change

| File | Change |
|---|---|
| `src/api/chat.ts` | **edit** — `includeDebug?: boolean` on `ChatMessagesParams`; `getChatMessages` translates it to `include_debug`. |
| `src/api/message.ts` | **edit** — add `getMessageDebug`. |
| `src/lib/diagnostics.ts` | **new** — the six pure decisions. |
| `src/lib/diagnostics.test.ts` | **new** — their tests. |
| `src/api/chat.test.ts` | **new** — the serialised query string. |
| `src/api/message.test.ts` | **new** — the debug endpoint's path. |
| `src/features/chat/message-diagnostics.tsx` | **new** — badge + latched panel. |
| `src/features/chat/message-diagnostics.test.tsx` | **new** — rendered-output assertions. |
| `src/features/chat/message-view.tsx` | **edit** — the toolbar switch, the debounced search, the query key and `gcTime`, the row prop. |
| `src/pages/chats.tsx` | **edit** — one hoisted permission boolean. |
| `src/lib/source-policy.test.ts` | **edit** — the seven rules above. |
| `_specs/z8pmx9mv3v/*` | the workflow artifacts. |

**No deployment runtime file is touched** (`.github/workflows/ci.yml`,
`.github/workflows/release.yml`, `vite.config.ts`, `package.json`,
`index.html`) — no new dependency is added, and vitest already resolves the `@`
alias through `vite.config.ts`'s existing `resolve.alias`.

## Validation strategy

Profile **`ui-source`**: `npm run typecheck`, `npm run lint`, `npm run test`,
plus `npm run format:check`. The baseline is recorded before the change — **34
files, 642 tests** — and compared after, so a suite that silently stopped
collecting a file is visible.

Beyond the profile, each AC is mapped to a test id or an inspected source
location in `verify.md`, and a mutation pass is run on the load-bearing
decisions: flipping `=== true` to `!== false`; dropping the `mayReadDiagnostics
&&`; sending `include_debug: false` instead of `undefined`; removing
`includeDebug` from the query key; dropping `canRead` from the panel's `enabled`;
recomputing `diagnosticsSource` per render instead of latching it; and each of
the four evasion spellings the security lens named (`?.`, bracket access,
destructuring, Yoda) against the containment rule. A mutant that no test kills is
a rule that reads stronger than it is.

## Rollback

Every change is additive and confined to the chats surface. Reverting the single
commit restores the previous behaviour exactly: the three new modules are new
files with no other importer, and the four edits are each small and contiguous.
No migration, no persisted state, no stored preference — the opt-in is component
state that dies with the page, which is itself part of the design (`AC-5`: off on
every load). The one behavioural change outside the feature, the 300 ms search
debounce, is a single `useEffect` and reverts with it.

## Out of scope

As `spec.md`. In particular: no `sent_via` origin badge, no `admin.debug.toggle`,
no transcript surface, no change to media download, paging or the composer, and
no persistence of the opt-in across reloads.

## Panel response

Thirty-two findings across three read-only lenses, on revision 1. **Accepted and
folded into the design: 14. Accepted as documentation: 6. Answered without a
design change: 9. Declined: 3.** Four were raised independently by two lenses and
are marked ‡.

### senior-reviewer

| # | Sev | Finding | Response |
|---|---|---|---|
| 1 ‡ | major | Rule 4 contradicts step 4 — `include_debug` is written in `message-view.tsx` too, so the rule fails on day one. | **Accepted, and the design moved rather than the rule.** Both lenses suggested allowlisting the third file; that turns a rule into an exemption, which is the failure this file documents at `z8pmx9mf1a`. Instead `ChatMessagesParams` carries `includeDebug` and `getChatMessages` translates, so the wire name genuinely lives in one file (fork 1, step 1). |
| 2 | major | The planned `chat.test.ts` assertion cannot pass: a key with an `undefined` value is in `Object.keys`, and a stubbed adapter never writes params into `config.url`. | **Accepted.** Verified independently (`http.getUri` with `include_debug: undefined` yields no parameter). The test asserts `http.getUri(sent[0])` and `toEqual` on `params` (step 6). |
| 3 ‡ | major | Rule 3 overclaims: it misses `== false`, `!== true`, destructuring, defaulted destructuring, `?.` and the documented-wrong `sent_by \|\| 'unknown'`. | **Accepted** — replaced with the containment rule (step 7 rule 1) plus a `=== false` net. The evasion spellings both lenses named are added to the mutation pass. |
| 4 | minor | Two of the five rules duplicate existing repository-wide bans; rule 2 duplicates an existing loop. | **Accepted.** The `console.` rule is dropped, `MESSAGES_DEBUG_READ` joins the existing permission loop, and the `dangerouslySetInnerHTML` half is dropped. Five rules became seven only because four genuinely new ones replaced them. |
| 5 ‡ | minor | The panel's `enabled` omits the permission, unlike the `message-media.tsx` precedent; `AC-3` then has no executable assertion. | **Accepted** — `canRead` is threaded into `DiagnosticsPanel` and into `enabled`, asserted textually (fork 6, step 7 rule 3). |
| 6 | minor | `DiagnosticsFields` hand-rolls a shape the house pattern already supplies, and an all-optional interface is the weak type `redaction.ts` warns about. | **Accepted** — `Pick<MessageInfo, 'has_debug' \| 'metadata_debug'>` from `@/api/chat` (step 2). |
| 7 | minor | `debugPayloadOf` discards sibling keys: `{ metadata_debug, generated_at }` would render less than the operator was sent. | **Accepted** — unwrap only when `metadata_debug` is the **sole** key (fork 5). |
| 8 | minor | `includeDebugParam` is a module export for a ternary with one caller. | **Accepted, and it is gone** — fork 1 removed the need for it, and `AC-6` is now asserted against the serialised URL, which is the stronger evidence anyway. |
| 9 | minor | "no query hook runs (`enabled: false`)" is not true of React — a disabled `useQuery` still creates an observer. | **Accepted.** The wording was wrong and the real guarantee is stronger: an unopened row does not render the panel, so it mounts no observer at all (fork 2). Restated here and carried into `verify.md`. |
| 10 | info | `keepPreviousData` means that just after the toggle flips, rows on screen are the previous un-embedded page, so opening a badge fetches even though the embedding page is in flight. | **Accepted as documentation.** Harmless and self-correcting; recorded here and in `verify.md` rather than met during verification. The latch (fork 3) makes it strictly a one-request event. |
| 11 ‡ | info | `['message-debug', id]` drops the `chat_jid` discriminator its sibling carries. | **Accepted** — the key matches `['media', id, chat_jid]` (step 3). |
| 12 | info | Verified safe: the prefix invalidation is written once, no WS arm touches the key, `MESSAGES_DEBUG_READ` already exists, rollback is real. | **Noted, no change.** Independently re-checked; it is why the key keeps its `chat.jid` prefix. |

### security-reviewer

| # | Sev | Finding | Response |
|---|---|---|---|
| 1 | major | `debugPayloadOf`'s "return the object as-is" is the ticket's only value-shaped decision and can dump an unrecognised envelope. | **Accepted in substance.** The decision is now key-shaped (sole-key unwrap) and a non-object or empty answer renders **nothing at all, silently** (fork 5, `AC-26`). The one part **declined** is "pin the real shape against a live `GET`": no gowa backend is reachable from this environment, and guessing while claiming to have observed would be worse than the documented assumption. It is recorded as a known limit in `implement.md` instead. Note also that `results()` unwraps `{code,message,results}` before this function sees anything, so there is no envelope left to leak. |
| 2 ‡ | major | Rule 4 contradicts the code the plan writes. | See senior 1 — **accepted**, and resolved by moving the design, which is the option this lens listed first. |
| 3 ‡ | major | The maskable-field rule is evadable by `?.`, brackets, destructuring and Yoda comparisons. | See senior 3 — **accepted**; the containment idiom this lens named (`\baccess_token\b`) is the one adopted. |
| 4 ‡ | major | `AC-3` has no executable guard; nothing stops a future ticket calling `getMessageDebug` from an ungated surface. | **Accepted in full** — both halves: the call-site containment rule and the `enabled` assertion (step 7 rule 3). |
| 5 | minor | Nothing asserts the permission boolean reaches the row correctly; `canRead={mayCompose}` type-checks and fails open. | **Accepted** — step 7 rule 4. |
| 6 | minor | A 200 with no payload renders an empty framed `<pre>` — a placeholder announcing a field that §09 deletes; no AC covers it. | **Accepted**, and it became a specification change: **`AC-26`** added to `spec.md`, with the case in `diagnostics.test.ts` and `message-diagnostics.test.tsx`. |
| 7 | minor | The inline failure renders `toApiError(error).message` verbatim — unbounded server-controlled text inside a chat bubble. | **Accepted** — `diagnosticsFailure` leads with a fixed sentence and passes the server's text through the same strip-and-cap (step 2). The plan records that the `GET` carries no request body, so nothing sent can be echoed back. |
| 8 | minor | Sensitive payload lifetime: `staleTime: Infinity` plus ≤1 MiB embedded pages; a permission downgrade that does not end the session leaves diagnostics resident. | **Accepted** — bounded `gcTime: 60_000` on the debug query and on the embedded page variant, following `webhook-dialog.tsx`'s precedent for a payload holding a secret. `staleTime: Infinity` is kept (it prevents refetch, it does not extend retention). The dependency on the token-epoch bump is recorded as a stated assumption. |
| 9 | info | The central security fact — arbitrary server-authored content of unknown sensitivity, on screen behind one permission — is unstated. | **Accepted as documentation** — "Accepted risk, recorded rather than implicit", above, and it became **`AC-27`** (no bulk-copy affordance). |
| 10 | info | Add a `disabled` ban on `message-diagnostics.tsx` in the free-today idiom. | **Accepted** — step 7 rule 6. |
| 11 | info | Deployment runtime is clean; the new `.test.tsx` is excluded from `SOURCES` by the existing filter. | **Noted, no change.** Re-verified at `source-policy.test.ts:60`. |

### performance-reviewer

| # | Sev | Finding | Response |
|---|---|---|---|
| 1 | major | The un-debounced search resets `offset` per keystroke, so with the embed on each character pulls a page carrying up to 1 MiB. | **Accepted** — a 300 ms debounce on the value that enters the query key (step 4). The alternative offered, forcing the embed off while searching, was **declined**: a control that silently turns itself off is the "looks broken" failure `AC-5` and `AC-8` exist to avoid. The `Input` stays fully controlled, so typing is unaffected. |
| 2 | major | Toggling the opt-in off flips every open panel `embedded → fetch`, so N open rows fire N simultaneous requests from one switch flip. | **Accepted** — the panel latches its source in a `useState` initialiser, so a fetch is reachable only by an operator opening a row (fork 3), asserted textually (step 7 rule 7). The alternative, collapsing open panels on toggle, was **declined**: it discards work the operator did. |
| 3 | major | Unbounded cache growth — no `gcTime`/`staleTime` default, `keepPreviousData`, and `includeDebug` adds a ≤1 MiB variant per `(jid, search, offset, mediaOnly)`. | **Accepted** — `gcTime: includeDebug ? 60_000 : undefined` on the messages query (step 4). Confirmed against `src/main.tsx`, which sets only `retry` and `refetchOnWindowFocus`. A `staleTime` was **not** added: the conversation must stay live after a send, and the debounce plus the bounded `gcTime` address the volume. |
| 4 | minor | `formatDiagnostics` runs in the render body with no `useMemo` and no cap, and re-runs for every open panel on every list refetch. | **Accepted** — `useMemo` on the payload identity, and a 20 000-character cap through `displayText`, which also supplies the strip (step 2, step 3). |
| 5 | minor | The post-send prefix invalidation re-downloads the whole embedded page. | **Answered without a change.** `invalidateQueries` refetches only **active** observers by default; the inactive variants are marked stale and refetch when next observed. So a send costs one page refetch, not one per variant. Recorded in step 4 so the cost is visible and intentional, as the finding asked. |
| 6 | minor | Record the trade: the embed only pays for itself when several rows are opened from one page. | **Accepted as documentation** — the helper text under the switch now says exactly that (step 4, `AC-8`). |
| 7 ‡ | minor | `['message-debug', id]` omits the scope its sibling carries; a cached payload could serve after a device switch. | **Accepted** — see senior 11; `gcTime` added alongside. |
| 8 | info | Composer keystroke cost is unchanged and the memo argument holds; keep the new prop a bare boolean. | **Noted, no change**, and written into the plan as a constraint (step 4) so a later refactor to an `onOpen` callback is a visible break rather than a silent one. |
| 9 | info | No bundle impact; pick one of `Bug`/`Sparkles` rather than importing both. | **Accepted** — one icon, `Bug` (step 3). |

---
ticket: z8pmx9mv3v
stage: verify
mode: standard
status: complete
owner: developer
updated: 2026-09-15
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3v"
  github: ""
---

# Verification — 12 · A message's AI diagnostics, behind an explicit opt-in

**Outcome: PASSED.** All 27 acceptance criteria are mapped to an executed result
or an inspected source location; the `ui-source` profile is green; 17 of 17
mutants were killed.

## Runtime impact

**No deployment runtime file changed — `no`.**

`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `vite.config.ts`,
`package.json` and `index.html` are byte-identical to the branch point. No
dependency was added or moved, so the single-file bundle gains this feature's own
code and nothing else. Confirmed by `git status`, which lists five modified
source files and six new ones, none of them on the deployment-runtime list.

## Validation profile — `ui-source`

| Check | Command | Result |
|---|---|---|
| `ui-typecheck` | `npm run typecheck` | **pass** |
| `ui-lint` | `npm run lint` | **pass** — 4 pre-existing warnings, none in a touched file |
| `ui-test` | `npm run test` | **pass** — 38 files, 691 tests (baseline 34 / 642) |

`npm run format:check` is **not** part of this profile and fails on 478 files at
baseline for an environment reason (CRLF working tree under
`core.autocrlf=true` against prettier's `endOfLine: lf`). Every touched file was
instead diffed against `npx prettier <file>` with line endings normalised and
matches exactly. Recorded as deviation 2 in `implement.md`.

## Acceptance criteria → result

### Authorization

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-1 | `showsDiagnosticsBadge` requires the permission boolean (`diagnostics.test.ts` "shows nothing without the permission"); the toolbar switch is inside `{mayReadDiagnostics && …}`; no role name appears anywhere in the three new files, and the repository-wide role rule in `source-policy.test.ts` covers them. | **pass** |
| AC-2 | `message-diagnostics.test.tsx` "renders nothing without the permission" asserts the markup is `''`, and "renders nothing disabled anywhere" asserts no `disabled` in it. Source rule: no `\bdisabled\b` in `message-diagnostics.tsx` or `diagnostics.ts`. Mutant M2 killed. | **pass** |
| AC-3 | Source rule: `getMessageDebug` may be named only in `src/api/message.ts` and `message-diagnostics.tsx` (mutant E5 killed), **and** that file's query must read `enabled: canRead && source.kind === 'fetch'` (mutant M5 killed). Request side: `includeDebug: mayReadDiagnostics && includeDebug` asserted textually (mutant M2 killed). | **pass** |
| AC-4 | `message-diagnostics.tsx` is in the `LISTS` array, so the standing rule "neither unwindowed list opens a permission subscription of its own" now covers it — no `useHasPermission*`, no `<Can>`. `chats.tsx` reads the permission once. | **pass** |

### The opt-in

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-5 | `useState(false)` in `message-view.tsx`; `chat.test.ts` "sends no include_debug when the caller omits the field entirely" covers the first load (TC-1). | **pass** |
| AC-6 | `chat.test.ts`: off → `http.getUri` does not contain `include_debug`; on → contains `include_debug=true` and **not** `include_debug=false`. Source rule: the wire name exists only in `src/api/chat.ts` (mutant E6 killed as real code), and `include_debug: false` appears nowhere. Mutant M3 killed. | **pass** |
| AC-7 | Source rule matches `queryKey: ['chat-messages', chat.jid, { … includeDebug … }]`. Mutant M4 (removing it from the key) killed. | **pass** |
| AC-8 | The switch is labelled "Embed diagnostics" with the helper line *"Ask the server to send each message's stored AI diagnostics with the page — worth turning on when you are about to inspect several messages."* — it names the mechanism and the trade, not just "debug". | **pass** |

### The badge

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-9 | `diagnostics.test.ts` covers `has_debug` true / absent / explicit `false`; `message-diagnostics.test.tsx` covers the same three on rendered markup. Source rule bans `has_debug === false` and the Yoda form. Mutants M1 and E4 killed. | **pass** |
| AC-10 | `diagnostics.test.ts` "is decided by has_debug and not by the presence of a payload" asserts both directions; `message-diagnostics.test.tsx` "badges an over-budget message that carries no payload". Mutant M7 killed. | **pass** |
| AC-11 | `message-diagnostics.test.tsx` "badges regardless of whether a payload rode along"; the badge decision never reads the opt-in, which is not in scope of the component at all. | **pass** |
| AC-12 | `message-diagnostics.test.tsx` "renders nothing at all when the key is absent" asserts markup `''` — no placeholder, no empty frame. | **pass** |

### The panel

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-13 | `diagnostics.test.ts` "reads the embedded payload when the key is present" and the falsy-payload case. `DiagnosticsPanel` renders `source.payload` directly for the `embedded` arm. | **pass** |
| AC-14 | `diagnosticsSource` answers `fetch` on an absent key; `message.test.ts` asserts exactly one `GET /message/<id>/debug` with the id encoded and no params; the query is keyed per message and issued only from the opened panel. Mutant M8 killed. | **pass** |
| AC-15 | `diagnostics.test.ts` spies on `JSON.parse` and asserts it is never called, and that the output is indented. Source rule: no `JSON.parse` in either new file. Mutant M9 (which flattened the indentation) killed. | **pass** |
| AC-16 | `message-diagnostics.test.tsx` "renders no payload as HTML anywhere" — an embedded `<img src=x>` does not reach the markup as a tag. `dangerouslySetInnerHTML` and `console.` are already repository-wide bans with empty allowlists, and both cover the new files. | **pass** |
| AC-17 | `message-diagnostics.test.tsx` renders **without a `QueryClientProvider`** and passes. `useQuery` outside a provider throws, so a clean render is proof that an unopened row mounts no observer. "Puts no payload in the initial markup" asserts the collapsed state. | **pass** |
| AC-18 | `diagnostics.test.ts` covers the fixed lead sentence, the empty-message case, and the cap-and-strip. `DiagnosticsPanel` renders it on `query.isError` only. Mutant M11 killed. | **pass** |

### Redaction discipline

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-19 | The containment rule: `has_debug` and `metadata_debug` may be **named** only in `src/api/chat.ts`, `src/lib/redaction.ts` and `src/lib/diagnostics.ts`. Four evasion spellings the review panel named — `?.`, bracket access, destructuring, Yoda — were introduced as mutants E1–E4 and **all four were killed**. The `=== false` ban is kept as a second net. | **pass** |
| AC-20 | Every absence arm returns `null` or `''`: `showsDiagnosticsBadge` false → no render; `debugPayloadOf` → `none` → `diagnosticsText('')` → the panel returns `null`. No toast, banner or retry exists in either file (`retry: false` on the query). Mutant M10 killed. | **pass** |
| AC-21 | Source rule: `diagnostics.ts` imports no permission module and takes `canRead: boolean` as an argument. `redaction.ts` is unmodified, and the existing three-authorities rule still passes. | **pass** |

### Performance

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-22 | `MessageBubble` stays `memo()`-wrapped (existing rule still passes) and both new props are bare booleans. The per-message query is created inside `DiagnosticsPanel`, which is rendered only when open — stronger than the `enabled:` pattern the AC permits. | **pass** |
| AC-23 | `setIncludeDebug` does not call `setOffset`; asserted by a source rule and by `chat.test.ts` "leaves every other parameter exactly as it was given" (`limit`/`offset`/`search`/`media_only` unchanged with the flag on). | **pass** |

### Testing

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-24 | All four named cases are covered: the parameter off/on (`chat.test.ts`), the badge for true / absent / explicit `false` (`diagnostics.test.ts` + `message-diagnostics.test.tsx`), the embedded-vs-fetch choice (`diagnostics.test.ts`), and no request without the permission (source rules + mutants M2, M5, E5). | **pass** |
| AC-25 | `ui-source` green: typecheck, lint, test. | **pass** |

### Added at review

| AC | How it was verified | Result |
|----|---------------------|--------|
| AC-26 | `diagnostics.test.ts` "answers `none` for an empty object, a primitive, null and undefined" and "answers the empty string for undefined"; `DiagnosticsPanel` returns `null` on `!text`. Mutant M10 killed. | **pass** |
| AC-27 | Source rule: no `navigator.clipboard`, no `<a`, no `href=`, no `download=` in either new file; `message-diagnostics.test.tsx` asserts none of them reach the markup. | **pass** |

## Test cases → result

| TC | Result | Evidence |
|----|--------|----------|
| TC-1 | **pass** | `chat.test.ts` "sends no include_debug when the caller omits the field entirely"; the badge is independent of the flag (AC-11). |
| TC-2 | **pass** | `diagnostics.test.ts` embedded-source and `JSON.parse` spy; the `embedded` arm issues no query (`enabled` is false for it). |
| TC-3 | **pass** | `message.test.ts` — exactly one `GET`, correct path, id encoded, no params. |
| TC-4 | **pass** | `message-diagnostics.test.tsx` empty markup without the permission; mutants M2/M5/E5 killed; no error path is reachable from an absence. |
| TC-5 | **pass** | `message-diagnostics.test.tsx` "renders nothing at all when the key is absent"; no code path compares against `false` (mutants M1/E4 killed). |
| TC-6 | **pass** | `diagnostics.test.ts` error-path tests; the panel scopes the error to itself; `console.` is a repository-wide ban. |
| TC-7 | **pass** | The key carries `includeDebug` (mutant M4 killed) and the offset is untouched (AC-23). |
| TC-8 | **pass** | Both the decision test and the rendered-markup test cover an explicit `false`. |
| TC-9 | **pass** | `diagnostics.test.ts` `none` cases + the panel's `if (!text) return null`. |

## Notes carried forward

Three things the review panel raised that are true of the shipped code and are
recorded here rather than discovered later:

1. **`keepPreviousData` and the toggle.** For the moment after the opt-in flips,
   the rows on screen are the previous page. Opening a badge then issues one
   per-message fetch even though the embedding page is in flight. Self-correcting,
   and the latch keeps it to a single request.
2. **The debug endpoint's envelope is unverified against a live server** (§12
   says it is undocumented, and no backend is reachable here). The unknown is
   handled key-shaped rather than guessed — see `implement.md` > Known limits.
3. **A permission downgrade without a session end** leaves a fetched payload
   cached for up to 60 s while the surface disappears. The assumption is that an
   administrative change bumps the token epoch, which `src/lib/http.ts` already
   acts on.

## Sign-off

Verification **PASSED**. All 27 acceptance criteria and all 9 test cases are
mapped to an executed result. Ticket transitions `implemented → verified →
closed`.

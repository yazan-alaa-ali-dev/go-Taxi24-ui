---
ticket: z8pmx9mw2x
title: 14 · Toggle the AI agent's debug collection for one number from the chat surface
mode: standard
state: closed
status: active
owner: developer
created_at: 2026-09-16
updated_at: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mw2x"
  github: ""
---

# Ticket: 14 · Toggle the AI agent's debug collection for one number

> **This file is the single canonical record of the ticket's workflow state.**

## Delivery note — staged workflow not used

At the owner's explicit instruction this ticket is **not** run through the seven
staged workflow commands. It is implemented directly, with one substitution the
owner asked for: the advisory review panel (`senior-reviewer`,
`security-reviewer`, `performance-reviewer` — the lenses `/review` dispatches)
reviews the plan **before** any code is written, and every finding is answered in
`plan.md > Panel response`.

Consequently `intake.md`, `research.md`, `review.md` and `comprehension.md` do
not exist; `spec.md`, `plan.md`, `implement.md` and `verify.md` are authored
directly as the record of what was specified, decided, changed and validated.

This mirrors the delivery shape of tickets `z8pmx9md6x` (1) through
`z8pmx9mv3w` (13), at the owner's request.

## Execution context

- ClickUp: <https://app.clickup.com/t/z8pmx9mw2x>
- This is the **write** side of `z8pmx9mv3v` (12): 12 shows the diagnostics that
  exist, this ticket decides for which number they are collected in the first
  place. It depends on `z8pmx9md71` (the typed permissions layer, which already
  declares `PERMISSIONS.ADMIN_DEBUG_TOGGLE`), on `z8pmx9md6x` (the same-origin
  proxy path) and on the existing chats surface. The branch is cut from the tip
  carrying all of them (`ticket/z8pmx9mv3w`) and the pull request targets `main`.
- References: `docs/gowa-frontend-reference-ar.html` — §04 (the permission
  catalogue, `admin.debug.toggle`), §08 (`metadata_debug` / `has_debug` and the
  `include_debug` opt-in), §09 (redaction), §11 (the UI work list), and the
  `POST /agent/debug/toggle` operation in §12's OpenAPI space.

## State history

| # | When | From → To | By | Note |
|---|---|---|---|---|
| 1 | 2026-09-16 | — → `draft` | developer | Workspace created from the ClickUp task. |
| 2 | 2026-09-16 | `draft` → `spec-complete` | developer | `spec.md` authored: 14 requirements, 49 acceptance criteria, 10 test cases. |
| 3 | 2026-09-16 | `spec-complete` → `plan-complete` | developer | `plan.md` revision 1 authored and submitted to the advisory panel. |
| 4 | 2026-09-16 | `plan-complete` → `approved` | developer | Panel reported 36 findings across three lenses (5 major); five were raised independently by two or three lenses. Revision 2 answers every finding: 21 changed the design, 4 were accepted as documentation, 7 were answered without a change, and 3 were declined with reasons. Five changed `spec.md` (`AC-3`, `AC-13`, `AC-36` reworded; `AC-50`, `AC-51` added with `TC-11`, `TC-12`; `REQ-13` realigned). |
| 5 | 2026-09-16 | `approved` → `implementation-in-progress` | developer | Branch `ticket/z8pmx9mw2x` cut from the tip carrying every prerequisite; the pull request targets `main`. |
| 6 | 2026-09-16 | `implementation-in-progress` → `implemented` | developer | 6 files added, 6 edited; 824 tests pass (baseline 670). Three deviations recorded in `implement.md`. |
| 7 | 2026-09-16 | `implemented` → `verified` | developer | `ui-source` green; all 51 ACs and 12 TCs mapped to a result; 9 mutants introduced and all 9 killed. |
| 8 | 2026-09-16 | `verified` → `closed` | developer | Verification PASSED. Terminal. |

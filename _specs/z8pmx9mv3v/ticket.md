---
ticket: z8pmx9mv3v
title: 12 · Show a message's AI diagnostics behind an explicit include_debug opt-in
mode: standard
state: closed
status: active
owner: developer
created_at: 2026-09-15
updated_at: 2026-09-15
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3v"
  github: ""
---

# Ticket: 12 · Show a message's AI diagnostics behind an explicit include_debug opt-in

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
`z8pmx9mf1b` (11), at the owner's request.

## Execution context

- ClickUp: <https://app.clickup.com/t/z8pmx9mv3v>
- Depends on `z8pmx9md71` (the typed permissions layer) and on the existing chats
  surface (`src/pages/chats.tsx`, `src/features/chat/`). The branch is cut from
  the tip that carries both, and the pull request targets `main`.
- References: `docs/gowa-frontend-reference-ar.html` — §04 (the permission
  catalogue, `messages.debug.read`), §08 (chats and messages; the
  `metadata_debug` opt-in, the 1 MiB page budget, `GET /message/{id}/debug`),
  §09 (redaction — masking is key deletion), §11 (the UI work list), §12 (the
  note that `metadata_debug`, `has_debug` and the debug endpoint are **not** in
  `openapi.yaml` — this document is their only specification).

## State history

| # | When | From → To | By | Note |
|---|---|---|---|---|
| 1 | 2026-09-15 | — → `draft` | developer | Workspace created from the ClickUp task. |
| 2 | 2026-09-15 | `draft` → `spec-complete` | developer | `spec.md` authored: 14 requirements, 25 acceptance criteria, 8 test cases. |
| 3 | 2026-09-15 | `spec-complete` → `plan-complete` | developer | `plan.md` revision 1 authored and submitted to the advisory panel. |
| 4 | 2026-09-15 | `plan-complete` → `approved` | developer | Panel reported 32 findings across three lenses; four were raised independently by two lenses. Revision 2 answers every finding: 14 changed the design, 6 were accepted as documentation, 9 were answered without a change, and 3 were declined with reasons. Two changed `spec.md` (`AC-26`, `AC-27` added, with `TC-9`). |
| 5 | 2026-09-15 | `approved` → `implementation-in-progress` | developer | Branch `ticket/z8pmx9mv3v` cut from the tip carrying every prerequisite; the pull request targets `main`. |
| 6 | 2026-09-15 | `implementation-in-progress` → `implemented` | developer | 6 files added, 5 edited; 691 tests pass (baseline 642). Three deviations recorded in `implement.md` — one of them a real bug the indentation test caught in the plan's own strip. |
| 7 | 2026-09-15 | `implemented` → `verified` | developer | `ui-source` green; all 27 ACs and 9 TCs mapped to a result; 17 mutants introduced and all 17 killed, including the four evasion spellings the security lens named. |
| 8 | 2026-09-15 | `verified` → `closed` | developer | Verification PASSED. Terminal. |

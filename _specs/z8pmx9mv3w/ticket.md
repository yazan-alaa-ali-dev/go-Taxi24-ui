---
ticket: z8pmx9mv3w
title: 13 · Show a voice note's transcript beneath its existing player
mode: standard
state: closed
status: active
owner: developer
created_at: 2026-09-16
updated_at: 2026-09-16
links:
  clickup: "https://app.clickup.com/t/z8pmx9mv3w"
  github: ""
---

# Ticket: 13 · Show a voice note's transcript beneath its existing player

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
`z8pmx9mv3v` (12), at the owner's request.

## Execution context

- ClickUp: <https://app.clickup.com/t/z8pmx9mv3w>
- Depends on `z8pmx9md71` (the typed permissions layer) and on the existing chats
  surface (`src/pages/chats.tsx`, `src/features/chat/message-media.tsx`). It is
  **independent of** the diagnostics ticket `z8pmx9mv3v` (12) in behaviour, but
  the two edit the same three files, so the branch is cut from the tip that
  carries 12 and the pull request targets `main`.
- References: `docs/gowa-frontend-reference-ar.html` — §04 (the permission
  catalogue, `messages.transcript.read`), §08 (the full message object and the
  three transcript fields, with `transcript_language` marked DETECTED and
  `transcript_status` a closed set of four), §09 (redaction — masking is key
  deletion, and the transcript surface is drawn conditionally from
  `permissions[]`), §11 (the UI work list: the transcript goes **under** the
  player, never instead of it, and the audio stays downloadable).

## State history

| # | When | From → To | By | Note |
|---|---|---|---|---|
| 1 | 2026-09-16 | — → `draft` | developer | Workspace created from the ClickUp task. |
| 2 | 2026-09-16 | `draft` → `spec-complete` | developer | `spec.md` authored: 14 requirements, 39 acceptance criteria, 14 test cases. |
| 3 | 2026-09-16 | `spec-complete` → `plan-complete` | developer | `plan.md` revision 1 authored and submitted to the advisory panel. |
| 4 | 2026-09-16 | `plan-complete` → `approved` | developer | Panel reported 28 findings across three lenses, four of them major and two of those raised independently by two lenses. Revision 2 answers every finding: 11 changed the design, 6 changed `spec.md`, 8 were answered without a change, 3 were recorded as risk or noted. None was declined as wrong. |
| 5 | 2026-09-16 | `approved` → `implementation-in-progress` | developer | Branch `ticket/z8pmx9mv3w` cut from the tip carrying ticket 12; the pull request targets `main`. |
| 6 | 2026-09-16 | `implementation-in-progress` → `implemented` | developer | 4 files added, 3 edited; 753 tests pass (baseline 691). Three deviations recorded in `implement.md` — two of them tests that could never have failed, both exposed by the mutation pass. |
| 7 | 2026-09-16 | `implemented` → `verified` | developer | `ui-source` green; all 39 ACs and 14 TCs mapped to a result; 15 mutants introduced and all 15 killed, including the permission mis-wire and the bidi-marker move the security lens named. |
| 8 | 2026-09-16 | `verified` → `closed` | developer | Verification PASSED. Terminal. |

---
ticket: z8pmx9p135
title: Device webhook — authentication mode (signed / plain / inherit), custom header, effective values and events picker
mode: standard
state: closed
status: active
owner: developer
created_at: 2026-10-05
updated_at: 2026-10-05
links:
  clickup: "https://app.clickup.com/t/z8pmx9p135"
  github: ""
---

# Ticket: Device webhook — authentication mode, custom header, effective values and events picker

> **This file is the single canonical record of the ticket's workflow state.**

## Delivery note — staged workflow not used

At the owner's explicit instruction, this ticket was **not** run through the
seven staged workflow commands. It was implemented directly, with one
substitution the owner asked for: before any code was written, the advisory
review panel (`senior-reviewer`, `security-reviewer`, `performance-reviewer`,
the lenses `/review` dispatches) reviewed the plan. Every finding is answered in
`plan.md > Panel response`.

As a result, `intake.md`, `research.md`, `review.md` and `comprehension.md` do
not exist. `spec.md`, `plan.md`, `implement.md` and `verify.md` were authored
directly as the record of what was specified, decided, changed and validated.
This follows the delivery shape of `z8pmx9mw2x`, at the owner's request.

## Execution context

- ClickUp: <https://app.clickup.com/t/z8pmx9p135>
- This ticket adopts the backend's extended per-device webhook contract
  (`docs/device-webhook-frontend-guide.md`) in the existing webhook dialog. That
  dialog was built by the earlier "disable a device's webhook without deleting
  it" ticket.
- The branch `ticket/z8pmx9p135` was cut from the tip of `ticket/z8pmx9mw2x`,
  which carries every prerequisite. The pull request targets `main`.

## State history

| # | When | From → To | By | Note |
|---|---|---|---|---|
| 1 | 2026-10-05 | — → `draft` | developer | Workspace created from the ClickUp task. |
| 2 | 2026-10-05 | `draft` → `spec-complete` | developer | `spec.md` authored: 11 requirements, 13 acceptance criteria and 10 test cases. |
| 3 | 2026-10-05 | `spec-complete` → `plan-complete` | developer | `plan.md` revision 1 authored and submitted to the advisory panel. |
| 4 | 2026-10-05 | `plan-complete` → `approved` | developer | The panel reported 26 findings across three lenses, 3 of them major. All three lenses raised the same concern: the changed-elsewhere notice would fire on the dialog's own toggle. Revision 2 answers every finding: 17 changed the design, 1 is recorded as a deviation, 8 confirmed the plan, and 1 sub-point was declined with a reason. As a result, AC-4, AC-6, AC-7, AC-8 and AC-9 were reworded, and AC-14–AC-17 and TC-11 were added. |
| 5 | 2026-10-05 | `approved` → `implementation-in-progress` | developer | Branch `ticket/z8pmx9p135` cut from the tip of `ticket/z8pmx9mw2x`; the pull request targets `main`. |
| 6 | 2026-10-05 | `implementation-in-progress` → `implemented` | developer | 6 files edited; 853 tests pass, against a baseline of 824. Two minor deviations are recorded in `implement.md`. |
| 7 | 2026-10-05 | `implemented` → `verified` | developer | `ui-source` is green and the build passes. All 17 ACs and 11 TCs are mapped to a result; 7 mutants were introduced and all 7 were killed. |
| 8 | 2026-10-05 | `verified` → `closed` | developer | Verification PASSED. This state is terminal. |

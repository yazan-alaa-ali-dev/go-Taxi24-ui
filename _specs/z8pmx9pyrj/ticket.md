---
ticket: z8pmx9pyrj
title: 17 · Device webhook — confirm a signature-scheme switch and explain server rejections per field
mode: standard
state: closed
status: active
owner: developer
created_at: 2026-10-29
updated_at: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyrj"
  github: ""
---

# Ticket: 17 · Device webhook — confirm a signature-scheme switch and explain server rejections per field

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
This mirrors the delivery shape of `z8pmx9mw2x` (14) and `z8pmx9pyre` (15).

## Execution context

- ClickUp: <https://app.clickup.com/t/90182746553/z8pmx9pyrj>
- Builds on `z8pmx9pyre` (15), which added the signature-scheme select, the
  effective scheme and the "leaving v1 lands on Signed" preset. This ticket adds
  the two remaining items of the reference checklist (§13): the confirmation
  before a scheme switch, and mapping a `400` message to the field it names.
- Ticket 16 (`Generate secret`) is **not** delivered yet, so every suggested fix
  asks for a new secret rather than pointing at a button that does not exist.
- Reference: `docs/webhook-signature-agent-hmac-v1.html` — §5.2 (the envelope;
  rely on the HTTP status and `code`, never a body `status`), §6 (the `PATCH`
  examples and the "returning to legacy" warning), §8.2 (map a `400` to its
  field), §8.3 (the switch is immediate; one scheme per endpoint), §11 (the
  error catalogue).
- Branch: `ticket/device-webhook-scheme-confirm-field-errors`, named after the
  task at the owner's request (not after the ticket id), cut from `main` at
  `fd9a473`, which carries ticket 15. The pull request targets `main`.

## State history

| # | When | From → To | By | Note |
|---|---|---|---|---|
| 1 | 2026-10-29 | — → `draft` | developer | Workspace created from the ClickUp task. |
| 2 | 2026-10-29 | `draft` → `spec-complete` | developer | `spec.md` authored: 8 requirements, 13 acceptance criteria, 10 test cases (15 ACs and 12 TCs after the panel). |
| 3 | 2026-10-29 | `spec-complete` → `plan-complete` | developer | `plan.md` revision 1 authored and submitted to the advisory panel. |
| 4 | 2026-10-29 | `plan-complete` → `approved` | developer | Panel reported 31 findings across three lenses, two of them major: the footer Save could be left disabled with no confirmation on screen (senior), and a switch to v1 kept a secret already sent verbatim (security). Revision 2 answers every finding: the confirmation became one boolean predicate reset on every scheme or URL change, the v1 confirmation asks for a new secret, the copy is computed live, and the rejection mapper type-checks the body. `spec.md` gained AC-14, AC-15, TC-11, TC-12. |
| 5 | 2026-10-29 | `approved` → `implementation-in-progress` | developer | Branch `ticket/device-webhook-scheme-confirm-field-errors` cut from `main` (`fd9a473`); the pull request targets `main`. |
| 6 | 2026-10-29 | `implementation-in-progress` → `implemented` | developer | 6 files edited, none added; 942 tests pass (baseline 895). Three deviations recorded in `implement.md`. |
| 7 | 2026-10-29 | `implemented` → `verified` | developer | `ui-source` green and the build passes; all 15 ACs and 12 TCs mapped to a result; 14 mutants introduced and all 14 killed. |
| 8 | 2026-10-29 | `verified` → `closed` | developer | Verification PASSED. Terminal. |

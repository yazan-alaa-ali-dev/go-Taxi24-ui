---
ticket: z8pmx9pyre
title: 15 · Device webhook — choose the signature scheme (Inherit / Legacy / Agent HMAC v1) and see the effective scheme
mode: standard
state: closed
status: active
owner: developer
created_at: 2026-10-29
updated_at: 2026-10-29
links:
  clickup: "https://app.clickup.com/t/90182746553/z8pmx9pyre"
  github: ""
---

# Ticket: 15 · Device webhook — choose the signature scheme and see the effective scheme

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
This mirrors the delivery shape of `z8pmx9mv3w` (13) and `z8pmx9p135` (14).

## Execution context

- ClickUp: <https://app.clickup.com/t/90182746553/z8pmx9pyre>
- Builds on `z8pmx9p135` (14), which gave the webhook dialog its authentication
  mode, header name, effective values and events picker. This ticket adds the
  third axis the backend introduced in z8pmx9p93v: the per-device
  `webhook_signature_scheme`.
- Reference: `docs/webhook-signature-agent-hmac-v1.html` — §2 (stored vs
  effective), §3 (legacy vs agent_hmac_v1), §6 (the `PATCH` update semantics,
  `effective_webhook_signature_scheme` on `GET` only), §7 (form validation
  rules), §8 (UI flow), §11 (error catalogue).
- Branch: `ticket/device-webhook-signature-scheme`, named after the task at the
  owner's request (not after the ticket id), cut from `main` at `a50589c`, which
  carries ticket 14. The pull request targets `main`.

## State history

| # | When | From → To | By | Note |
|---|---|---|---|---|
| 1 | 2026-10-29 | — → `draft` | developer | Workspace created from the ClickUp task. |
| 2 | 2026-10-29 | `draft` → `spec-complete` | developer | `spec.md` authored: 9 requirements, 14 acceptance criteria, 11 test cases (16 ACs and 13 TCs after the panel). |
| 3 | 2026-10-29 | `spec-complete` → `plan-complete` | developer | `plan.md` revision 1 authored and submitted to the advisory panel. |
| 4 | 2026-10-29 | `plan-complete` → `approved` | developer | Panel reported 30 findings across three lenses, two of them major; four concerns were raised independently by two lenses, including the leaving-v1 downgrade to a verbatim secret. Revision 2 answers every finding: 11 changed the design, 8 changed `spec.md` (AC-15, AC-16, TC-12, TC-13 added), 1 sub-point declined with a reason, 1 recorded as risk, the rest accepted or confirmed. |
| 5 | 2026-10-29 | `approved` → `implementation-in-progress` | developer | Branch `ticket/device-webhook-signature-scheme` cut from `main` (`a50589c`); the pull request targets `main`. |
| 6 | 2026-10-29 | `implementation-in-progress` → `implemented` | developer | 2 files added, 5 edited; 895 tests pass (baseline 853). Two deviations recorded in `implement.md` — the first an owner decision to keep the `z8pmx9mw2x` rule that bans the signature header's name from source, which amended AC-4. |
| 7 | 2026-10-29 | `implemented` → `verified` | developer | `ui-source` green and the build passes; all 16 ACs and 13 TCs mapped to a result; 14 mutants introduced and all 14 killed. |
| 8 | 2026-10-29 | `verified` → `closed` | developer | Verification PASSED. Terminal. |

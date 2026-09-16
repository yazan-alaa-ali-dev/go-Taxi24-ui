import { describe, expect, it } from 'vitest'
import type { ApiError } from '@/api/types'
import {
  debugToggleTarget,
  expiryAt,
  expiryDelay,
  parseTtl,
  toggleFailure,
  toggleReport,
  toggleSummary,
  TTL_PRESETS,
} from './agent-debug'

/**
 * The decisions behind the agent-debug toggle (ticket z8pmx9mw2x).
 *
 * This repository has no component renderer, so every decision this feature
 * makes lives here and is asserted here. Three of these blocks exist because a
 * wrong answer is not a cosmetic bug: a duration the operator did not type, a
 * "nothing changed" about a change that happened, and a persistent state claim
 * for a number whose state nothing can read.
 */

function apiError(overrides: Partial<ApiError>): ApiError {
  return { status: 500, code: 'UNKNOWN', message: '', ...overrides }
}

describe('parseTtl — a duration the operator did not type must never be sent (AC-18, AC-19, TC-4)', () => {
  it('reads blank as "omit the field", which is not the same as zero', () => {
    // The upstream default then applies. Sending `0` is a 400, and sending it
    // silently would be a duration the operator never chose.
    expect(parseTtl('')).toEqual({ kind: 'omit' })
    expect(parseTtl('   ')).toEqual({ kind: 'omit' })
  })

  it('accepts a positive whole number, trimmed', () => {
    expect(parseTtl('120')).toEqual({ kind: 'minutes', minutes: 120 })
    expect(parseTtl(' 30 ')).toEqual({ kind: 'minutes', minutes: 30 })
  })

  it('accepts every preset the dialog offers', () => {
    for (const preset of TTL_PRESETS) {
      expect(parseTtl(String(preset))).toEqual({ kind: 'minutes', minutes: preset })
    }
  })

  it('refuses zero with its own message', () => {
    const result = parseTtl('0')
    expect(result.kind).toBe('error')
    expect(result.kind === 'error' && result.message).toMatch(/at least one minute/)
  })

  it('refuses every spelling Number() would otherwise turn into a duration', () => {
    // Each of these is a value `Number()` accepts and the operator did not type:
    // `-5` → -5, `1.5` → 1.5, `1e3` → 1000, `0x10` → 16, `parseInt('5abc')` → 5.
    for (const raw of ['-5', '1.5', '1e3', '0x10', 'abc', '5abc', '+30', '٣٠']) {
      expect(parseTtl(raw).kind, `"${raw}" must not become a duration`).toBe('error')
    }
  })

  it('refuses a value too large to be an exact integer', () => {
    // It passes the digit test, becomes Infinity, and JSON.stringify serialises
    // that as `null` — a body the server reads as "no duration" while the
    // operator believes they set one.
    expect(parseTtl('9'.repeat(400)).kind).toBe('error')
    expect(parseTtl(String(Number.MAX_SAFE_INTEGER + 10)).kind).toBe('error')
  })
})

describe('debugToggleTarget — the two authorities meet in one place (AC-6, AC-20, AC-21, TC-5, TC-6)', () => {
  it('offers nothing without the permission, however ordinary the chat', () => {
    expect(debugToggleTarget('963938113282@s.whatsapp.net', false)).toBeNull()
  })

  it('offers the number for a one-to-one chat with the permission', () => {
    expect(debugToggleTarget('963938113282@s.whatsapp.net', true)).toBe('+963938113282')
  })

  it('offers nothing for a chat with no number behind it, even with the permission', () => {
    for (const jid of ['120363001@g.us', '120363001@newsletter', 'status@broadcast', '9876@lid']) {
      expect(debugToggleTarget(jid, true), jid).toBeNull()
    }
  })
})

describe('toggleReport — reading a body with no contract (AC-27, AC-29, AC-31, AC-50, TC-12)', () => {
  const sent = { phone: '+963938113282', enabled: true }

  it('reports the documented shape', () => {
    expect(
      toggleReport(sent, {
        phone: '+963938113282',
        enabled: true,
        expires_at: '2026-08-19T12:30:00Z',
      }),
    ).toEqual({ phone: '+963938113282', enabled: true, expiresAt: '2026-08-19T12:30:00Z' })
  })

  it('ignores additional fields rather than failing to parse them', () => {
    const report = toggleReport(sent, {
      phone: '+963938113282',
      enabled: true,
      expires_at: null,
      requested_by: 'someone',
      trace: { id: 7 },
    })
    expect(report).toEqual({ phone: '+963938113282', enabled: true, expiresAt: null })
  })

  it('falls back to what was sent when the body is not an object at all', () => {
    for (const body of [null, undefined, 'ok', 42, []]) {
      expect(toggleReport(sent, body)).toEqual({
        phone: '+963938113282',
        enabled: true,
        expiresAt: null,
      })
    }
  })

  it('shows a server-side normalisation rather than the value that was sent', () => {
    const report = toggleReport(sent, { phone: '+9639381132820', enabled: true })
    expect(report.phone).toBe('+9639381132820')
  })

  it('refuses an echoed phone that is not itself a well-formed number', () => {
    // The proxy returns the upstream body unmodified, and this value lands in
    // the one sentence naming which customer's number was changed.
    const hostile = ['+963938113282‮', '963938113282', '+96 393 811', `+${'9'.repeat(5000)}`, '']
    for (const phone of hostile) {
      expect(toggleReport(sent, { phone, enabled: true }).phone, phone.slice(0, 20)).toBe(
        '+963938113282',
      )
    }
  })

  it('reports the outcome the server confirmed, not the one that was asked for', () => {
    expect(toggleReport(sent, { phone: '+963938113282', enabled: false }).enabled).toBe(false)
  })

  it('never shows an expiry beside "collection off"', () => {
    // A window beside "collection is off" is a self-contradicting pair, so the
    // UI drops it even when the upstream sends one.
    const report = toggleReport(
      { phone: '+963938113282', enabled: false },
      { phone: '+963938113282', enabled: false, expires_at: '2026-08-19T12:30:00Z' },
    )
    expect(report).toEqual({ phone: '+963938113282', enabled: false, expiresAt: null })
  })

  it('treats an absent or blank expiry as no expiry', () => {
    expect(toggleReport(sent, { enabled: true }).expiresAt).toBeNull()
    expect(toggleReport(sent, { enabled: true, expires_at: '   ' }).expiresAt).toBeNull()
    expect(toggleReport(sent, { enabled: true, expires_at: null }).expiresAt).toBeNull()
  })
})

describe('toggleFailure — "nothing changed" is a claim (AC-33..AC-40, AC-51, TC-7..TC-11)', () => {
  it('tells the operator to select a device, and offers no retry', () => {
    const failure = toggleFailure(apiError({ status: 400, code: 'DEVICE_ID_REQUIRED' }))
    expect(failure.applied).toBe('no')
    expect(failure.offersRetry).toBe(false)
    expect(failure.message).toMatch(/[Ss]elect a device/)
  })

  it('reports a validation refusal with the server’s own text, and nothing changed', () => {
    const failure = toggleFailure(
      apiError({ status: 400, code: 'VALIDATION_ERROR', message: 'ttl_minutes must be positive' }),
    )
    expect(failure.applied).toBe('no')
    expect(failure.message).toContain('ttl_minutes must be positive')
  })

  it('strips and caps the server’s own text before it reaches the message', () => {
    const failure = toggleFailure(
      apiError({ status: 400, code: 'VALIDATION_ERROR', message: `bad‮value${'x'.repeat(500)}` }),
    )
    expect(failure.message).not.toContain('‮')
    expect(failure.message.length).toBeLessThan(400)
  })

  it('states an unconfigured deployment as a fact, names no environment variable, offers no retry', () => {
    const failure = toggleFailure(apiError({ status: 503, code: 'AGENT_DEBUG_DISABLED' }))
    expect(failure.applied).toBe('no')
    expect(failure.offersRetry).toBe(false)
    // The source rule banning these names across src/ keeps an empty exemption
    // list only because this sentence does not carry them.
    expect(failure.message).not.toMatch(/AGENT_DEBUG_TOGGLE_URL|AGENT_WEBHOOK_KEY/)
  })

  it('says the busy cap refused rather than queued, and invites a manual retry', () => {
    const failure = toggleFailure(apiError({ status: 503, code: 'AGENT_DEBUG_BUSY' }))
    expect(failure.applied).toBe('no')
    expect(failure.offersRetry).toBe(true)
    expect(failure.message).toMatch(/refused rather than queued/)
  })

  it('an unreachable agent did not apply the switch', () => {
    const failure = toggleFailure(apiError({ status: 502, code: 'AGENT_UPSTREAM_ERROR' }))
    expect(failure.applied).toBe('no')
    expect(failure.offersRetry).toBe(true)
  })

  it('an unreadable 2xx answer leaves the outcome UNKNOWN, not "not applied"', () => {
    // The omni answered 2xx: it accepted the command and only its answer was
    // unreadable. Reporting "nothing changed" here would be a lie about a change
    // that most likely happened.
    const failure = toggleFailure(apiError({ status: 502, code: 'AGENT_UPSTREAM_INVALID_RESPONSE' }))
    expect(failure.applied).toBe('unknown')
    expect(failure.message).toMatch(/may or may not/)
  })

  it('a timeout leaves the outcome unknown and is never re-issued automatically', () => {
    const failure = toggleFailure(apiError({ status: 504, code: 'AGENT_UPSTREAM_TIMEOUT' }))
    expect(failure.applied).toBe('unknown')
    expect(failure.offersRetry).toBe(true)
    expect(failure.message).toMatch(/may or may not/)
  })

  it('treats a 413 and a 401 as refused before the upstream call', () => {
    for (const status of [401, 413]) {
      const failure = toggleFailure(apiError({ status, code: 'INVALID_REQUEST' }))
      expect(failure.applied, String(status)).toBe('no')
      expect(failure.offersRetry, String(status)).toBe(false)
    }
  })

  it('a client abort leaves the outcome unknown (AC-51, TC-11)', () => {
    // `http` carries a 45-second budget, so a slow proxy hop aborts here AFTER
    // the command was forwarded. `toApiError` reports it as status 0.
    const failure = toggleFailure(apiError({ status: 0, code: 'NETWORK_ERROR', message: 'timeout' }))
    expect(failure.applied).toBe('unknown')
    expect(failure.offersRetry).toBe(true)
  })

  it('an envelope-less 5xx from a proxy leaves the outcome unknown (AC-51, TC-11)', () => {
    const failure = toggleFailure(apiError({ status: 504, code: 'HTTP_ERROR', message: 'Gateway Timeout' }))
    expect(failure.applied).toBe('unknown')
    expect(failure.offersRetry).toBe(true)
  })

  it('an unknown future code is unknown, never "not applied"', () => {
    const failure = toggleFailure(apiError({ status: 502, code: 'AGENT_SOMETHING_NEW' }))
    expect(failure.applied).toBe('unknown')
  })

  it('every message is a sentence, never a bare code or status', () => {
    for (const code of [
      'DEVICE_ID_REQUIRED',
      'VALIDATION_ERROR',
      'AGENT_DEBUG_DISABLED',
      'AGENT_DEBUG_BUSY',
      'AGENT_UPSTREAM_ERROR',
      'AGENT_UPSTREAM_INVALID_RESPONSE',
      'AGENT_UPSTREAM_TIMEOUT',
      'WHATEVER',
    ]) {
      const { message } = toggleFailure(apiError({ code }))
      expect(message.length, code).toBeGreaterThan(20)
      expect(message, code).not.toContain(code)
    }
  })
})

describe('toggleSummary — the confirmation names the number and the outcome (AC-28)', () => {
  it('says on, and says off', () => {
    expect(toggleSummary({ phone: '+963938113282', enabled: true, expiresAt: null })).toBe(
      'Diagnostics collection is on for +963938113282.',
    )
    expect(toggleSummary({ phone: '+963938113282', enabled: false, expiresAt: null })).toBe(
      'Diagnostics collection is off for +963938113282.',
    )
  })
})

describe('the reported expiry is a cache, not a state (AC-23, AC-24, TC-3)', () => {
  const now = Date.parse('2026-08-19T12:00:00Z')

  it('reports a future instant', () => {
    expect(expiryAt('2026-08-19T12:30:00Z', now)).toBe(Date.parse('2026-08-19T12:30:00Z'))
  })

  it('says nothing once the instant has passed', () => {
    // There is no endpoint that reads the current state, so the moment the
    // reported window closes this UI knows nothing about the number again.
    expect(expiryAt('2026-08-19T11:59:59Z', now)).toBeNull()
    expect(expiryAt('2026-08-19T12:00:00Z', now)).toBeNull()
  })

  it('says nothing for an absent or unparseable instant', () => {
    expect(expiryAt(null, now)).toBeNull()
    expect(expiryAt('', now)).toBeNull()
    expect(expiryAt('whenever', now)).toBeNull()
  })

  it('arms a timer for exactly the remaining time', () => {
    expect(expiryDelay('2026-08-19T12:30:00Z', now)).toBe(30 * 60_000)
  })

  it('arms no timer when there is nothing to forget', () => {
    expect(expiryDelay(null, now)).toBeNull()
    expect(expiryDelay('whenever', now)).toBeNull()
    expect(expiryDelay('2026-08-19T11:00:00Z', now)).toBeNull()
  })

  it('arms no timer for an instant setTimeout cannot hold', () => {
    // Beyond 2**31-1 ms the delay overflows a signed 32-bit int and the callback
    // fires IMMEDIATELY — so a month-long window would be forgotten at once,
    // the opposite of what the timer is for. The expiry is still rendered; it is
    // simply not scheduled.
    const far = new Date(now + 2 ** 31 + 10_000).toISOString()
    expect(expiryDelay(far, now)).toBeNull()
    expect(expiryAt(far, now)).not.toBeNull()
  })
})

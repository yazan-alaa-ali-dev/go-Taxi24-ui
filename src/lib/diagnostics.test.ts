import { describe, expect, it, vi } from 'vitest'
import {
  debugPayloadOf,
  diagnosticsFailure,
  diagnosticsSource,
  diagnosticsText,
  MAX_DIAGNOSTICS_TEXT,
  showsDiagnosticsBadge,
  type DiagnosticsOf,
} from './diagnostics'

/**
 * The AI-diagnostics decisions (ticket z8pmx9mv3v), tested where they live.
 *
 * Every one of these is a §09 redaction decision, and §09 is the paragraph the
 * reference calls the single largest source of silent bugs in this migration —
 * because every wrong answer here *looks* right. `has_debug === false` reads as
 * careful; it is the one comparison that can never be true. A truthiness test on
 * `metadata_debug` reads as defensive; it sends a second request for a payload
 * that was already delivered.
 *
 * So the cases below are written around the shapes that would pass a casual
 * implementation: the absent key, the explicit `false` that must never be
 * expected, and the falsy-but-present payload.
 */

/** A message as a permitted principal receives it, with neither key set. */
const BARE: DiagnosticsOf = {}

describe('the badge decision (AC-9, AC-10, AC-11, TC-5, TC-8)', () => {
  it('shows a badge for has_debug === true, with the permission', () => {
    expect(showsDiagnosticsBadge({ has_debug: true }, true)).toBe(true)
  })

  it('shows nothing when the key is absent — for a permitted principal that means "none stored"', () => {
    // `has_debug` is both maskable AND omitempty, so absence is the ordinary
    // answer for a message with no diagnostics. It is not an error and not a
    // permission problem, and it must render as nothing at all.
    expect(showsDiagnosticsBadge(BARE, true)).toBe(false)
  })

  it('shows nothing for an explicit false, which is never expected but must not badge', () => {
    // The mutant this kills is `!== false`, which reads as equivalent and is not:
    // it would badge every message in the list, including the redacted ones.
    expect(showsDiagnosticsBadge({ has_debug: false }, true)).toBe(false)
  })

  it('shows nothing without the permission, whatever the message says', () => {
    // AC-1/AC-2: the surface is decided by permissions[], and a `has_debug` a
    // redacted principal should never have received does not conjure it back.
    expect(showsDiagnosticsBadge({ has_debug: true }, false)).toBe(false)
    expect(showsDiagnosticsBadge(BARE, false)).toBe(false)
  })

  it('is decided by has_debug and not by the presence of a payload', () => {
    // AC-10, and the 1 MiB page budget it exists for: an over-budget message
    // reports has_debug with no payload attached, and that is exactly the
    // message most worth opening.
    expect(showsDiagnosticsBadge({ has_debug: true }, true)).toBe(true)
    // The inverse: a payload with no has_debug is not a badge either.
    expect(showsDiagnosticsBadge({ metadata_debug: { model: 'x' } }, true)).toBe(false)
  })
})

describe('where one message’s diagnostics come from (AC-13, AC-14, TC-2, TC-3)', () => {
  it('reads the embedded payload when the key is present', () => {
    const payload = { model: 'claude', tokens: 412 }
    expect(diagnosticsSource({ has_debug: true, metadata_debug: payload })).toEqual({
      kind: 'embedded',
      payload,
    })
  })

  it('fetches when the key is absent — the opt-in was off, or the page ran out of budget', () => {
    expect(diagnosticsSource({ has_debug: true })).toEqual({ kind: 'fetch' })
  })

  it('decides on the KEY, so a falsy payload is still an embedded payload', () => {
    // This is the whole reason `hasField` exists. `metadata_debug || fetch()`
    // compiles, reads as defensive, and issues a second request for four
    // payloads the server already sent.
    for (const payload of [null, 0, '', false]) {
      expect(
        diagnosticsSource({ has_debug: true, metadata_debug: payload as never }),
        `${JSON.stringify(payload)} is present, not missing`,
      ).toEqual({ kind: 'embedded', payload })
    }
  })

  it('does not consult has_debug — the two answer different questions', () => {
    // A payload present while has_debug is absent is not a shape the backend is
    // expected to send, but the source decision must not be the badge decision
    // wearing a different name: this one is only ever asked about a message that
    // already earned a badge.
    expect(diagnosticsSource({ metadata_debug: { a: 1 } })).toEqual({
      kind: 'embedded',
      payload: { a: 1 },
    })
  })
})

describe('what the undocumented debug endpoint sent (AC-26, TC-3, TC-9)', () => {
  it('unwraps a sole metadata_debug key — that wrapper is the envelope', () => {
    expect(debugPayloadOf({ metadata_debug: { model: 'x' } })).toEqual({
      kind: 'payload',
      value: { model: 'x' },
    })
  })

  it('keeps an object that carries sibling keys — unwrapping would show less than was sent', () => {
    const answer = { metadata_debug: { model: 'x' }, generated_at: '2026-09-15T10:00:00Z' }
    expect(debugPayloadOf(answer)).toEqual({ kind: 'payload', value: answer })
  })

  it('returns an unrecognised object as it arrived', () => {
    // The route's envelope is specified nowhere (§12). If it answers with the
    // payload itself, the payload is what the operator asked for.
    const answer = { model: 'x', prompt_tokens: 12 }
    expect(debugPayloadOf(answer)).toEqual({ kind: 'payload', value: answer })
  })

  it('answers `none` for an empty object, a primitive, null and undefined', () => {
    // AC-26: none of these may become an empty framed panel, which would
    // announce that a field belongs there and is empty — the exact distinction
    // §09 deletes by removing the key.
    for (const answer of [{}, null, undefined, 'text', 0, false]) {
      expect(debugPayloadOf(answer), `${JSON.stringify(answer ?? null)} shows nothing`).toEqual({
        kind: 'none',
      })
    }
  })

  it('does not unwrap a sole key that merely looks similar', () => {
    const answer = { metadata_debugger: { a: 1 } }
    expect(debugPayloadOf(answer)).toEqual({ kind: 'payload', value: answer })
  })
})

describe('rendering the payload as text (AC-15, AC-16, TC-2)', () => {
  it('formats with indentation and never parses', () => {
    // §11 lists JSON.parse on metadata_debug among the common traps: the value
    // is a ready object, and parsing one throws.
    const parse = vi.spyOn(JSON, 'parse')
    const text = diagnosticsText({ model: 'claude', nested: { depth: 2 } })

    expect(text).toContain('"model": "claude"')
    expect(text).toContain('\n  ')
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  it('strips a bidi override, which JSON.stringify leaves alone', () => {
    // Verified rather than assumed: JSON.stringify escapes the C0 controls and
    // passes U+202E through untouched, so a stored payload can reorder what is
    // printed around it. React escapes HTML; it does not neutralise bidi.
    const rlo = String.fromCharCode(0x202e)
    const text = diagnosticsText({ note: `safe${rlo}gnp.exe` })

    expect(text.includes(rlo)).toBe(false)
    expect(text).toContain('gnp.exe')
  })

  it('caps an oversized payload and says so', () => {
    const text = diagnosticsText({ blob: 'x'.repeat(MAX_DIAGNOSTICS_TEXT * 2) })

    expect(text.length).toBe(MAX_DIAGNOSTICS_TEXT + 1)
    expect(text.endsWith('…')).toBe(true)
  })

  it('answers the empty string for undefined, so the panel can render nothing', () => {
    // JSON.stringify(undefined) is `undefined`, not a string — interpolating it
    // would print the literal word "undefined" as though the server sent it.
    expect(diagnosticsText(undefined)).toBe('')
  })

  it('formats null and an empty object as themselves, which are real answers', () => {
    expect(diagnosticsText(null)).toBe('null')
    expect(diagnosticsText({})).toBe('{}')
  })
})

describe('the one error path (AC-18, TC-6)', () => {
  it('leads with a fixed sentence and carries the structured message', () => {
    expect(
      diagnosticsFailure({ status: 500, code: 'INTERNAL', message: 'storage unavailable' }),
    ).toBe('The diagnostics could not be loaded. storage unavailable')
  })

  it('says something useful when the server said nothing', () => {
    expect(diagnosticsFailure({ status: 0, code: 'NETWORK_ERROR', message: '' })).toBe(
      'The diagnostics could not be loaded.',
    )
  })

  it('caps and strips text this app did not write', () => {
    // It lands inside a chat bubble beside real message content, and on a
    // proxied deployment it need not have come from gowa at all.
    const rlo = String.fromCharCode(0x202e)
    const rendered = diagnosticsFailure({
      status: 502,
      code: 'HTTP_ERROR',
      message: `${rlo}${'y'.repeat(500)}`,
    })

    expect(rendered.includes(rlo)).toBe(false)
    expect(rendered.length).toBeLessThan(250)
    expect(rendered.endsWith('…')).toBe(true)
  })
})

import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import type { DeviceWebhookConfig } from '@/api/devices'
import {
  AGENT_HMAC_V1_SIGNED_STRING,
  CLEARS_WEBHOOK_WARNING,
  DISABLED_MEANS,
  EFFECTIVE_UNKNOWN,
  ENABLING_RESUMES,
  INSECURE_SKIP_VERIFY_MEANS,
  SCHEME_INVALID_WARNING,
  WEBHOOK_EVENTS,
  WEBHOOK_SAVE_FAILED_REDACTED,
  agentSecretError,
  authModeFrom,
  authSecretError,
  effectiveAuthFrom,
  effectiveSchemeFrom,
  effectiveSummary,
  headerNameError,
  headerNameFrom,
  headerNamePayload,
  inheritedPlainWarning,
  inheritedV1Notice,
  modeAfterSchemeChange,
  parseWebhookEvents,
  plainWarning,
  schemeFrom,
  schemeOptionLabel,
  secretError,
  serializeWebhookEvents,
  signFrom,
  v1InForce,
  webhookEnabledFrom,
  webhookFieldsDiffer,
  webhookFieldsFrom,
  webhookFormEdited,
  webhookFormErrors,
  webhookPayloadFrom,
  webhookSaveEffect,
  webhookSaveFailure,
  webhookUrlNotice,
} from './device-webhook'

/**
 * Disabling a webhook and clearing its URL are different operations, and this
 * file is where that difference is asserted. The product conflated them until
 * this ticket.
 */

function config(extra: Partial<DeviceWebhookConfig> = {}): DeviceWebhookConfig {
  return {
    device_id: 'acme-prod-1',
    webhook_url: 'https://example.com/webhook',
    webhook_secret: 'super-secret-key',
    webhook_events: 'message,message.ack',
    webhook_insecure_skip_verify: false,
    ...extra,
  }
}

/**
 * A server that predates the signature scheme: no scheme key read, none sent,
 * no v1 in force. The z8pmx9p135 cases below run on this path, which is also
 * AC-12's assertion that such a server sees exactly the body it saw before.
 */
const OLD_SERVER = { scheme: 'unreported', v1: false } as const

function rejection(status: number): AxiosError {
  return new AxiosError('failed', 'ERR', undefined, undefined, {
    status,
    data: { code: String(status), message: 'webhook_secret is invalid', results: null },
    statusText: '',
    headers: {},
    config: { headers: {} },
  } as never)
}

describe('clearing the URL is a deletion, not a disable', () => {
  it('reads an empty URL as a deletion', () => {
    // TC-14. The one operation the reference explicitly warns about, and the
    // one the previous dialog recommended in its own description text.
    expect(webhookSaveEffect('')).toBe('clear')
    expect(webhookSaveEffect('   ')).toBe('clear')
  })

  it('reads a URL as a plain update', () => {
    expect(webhookSaveEffect('https://example.com/webhook')).toBe('set')
  })

  it('warns about all three erased values and about where the events then go', () => {
    // The warning must carry both halves. "Your webhook will be removed" is
    // true and useless: the operator's next question is whether the events stop,
    // and the answer — they do not — is the one that changes what they do.
    expect(CLEARS_WEBHOOK_WARNING).toMatch(/URL/)
    expect(CLEARS_WEBHOOK_WARNING).toMatch(/secret/i)
    expect(CLEARS_WEBHOOK_WARNING).toMatch(/event list/i)
    expect(CLEARS_WEBHOOK_WARNING).toMatch(/fall back/i)
    expect(CLEARS_WEBHOOK_WARNING).toMatch(/deployment-wide/i)
    expect(CLEARS_WEBHOOK_WARNING).not.toMatch(/events stop|stops delivery/i)
  })
})

describe('what switching delivery off actually does', () => {
  it('states all four consequences', () => {
    // AC-30. The fourth is the one nobody expects: the customer stops getting
    // automatic replies, which is a change they experience.
    expect(DISABLED_MEANS).toHaveLength(4)
    const all = DISABLED_MEANS.join(' ')
    expect(all).toMatch(/webhook URL/i)
    expect(all).toMatch(/silence, not redirection/i)
    expect(all).toMatch(/agent bridge/i)
    expect(all).toMatch(/still received and stored/i)
  })

  it('says that re-enabling needs nothing re-entered', () => {
    // AC-31. An operator who believes disabling loses the configuration will
    // avoid the switch and clear the URL instead — the destructive path.
    expect(ENABLING_RESUMES).toMatch(/same URL/i)
    expect(ENABLING_RESUMES).toMatch(/same signing secret/i)
    expect(ENABLING_RESUMES).toMatch(/nothing to re-enter/i)
  })

  it('says what skipping certificate verification costs', () => {
    expect(INSECURE_SKIP_VERIFY_MEANS).toMatch(/certificate/i)
    expect(INSECURE_SKIP_VERIFY_MEANS).toMatch(/whatever answers/i)
  })
})

describe('the delivery switch reads an absent field as on, and says it inferred that', () => {
  it('reports the value the server sent', () => {
    expect(webhookEnabledFrom(config({ webhook_enabled: false }))).toEqual({
      enabled: false,
      reported: true,
    })
    expect(webhookEnabledFrom(config({ webhook_enabled: true }))).toEqual({
      enabled: true,
      reported: true,
    })
  })

  it('assumes on when the field is absent, and marks the assumption', () => {
    // TC-15. A device with no webhook configuration at all reports true —
    // absence of configuration is not being silenced — so `false` would be the
    // wrong default. But it is an assumption, and the switch says so.
    expect(webhookEnabledFrom(config())).toEqual({ enabled: true, reported: false })
  })
})

describe('the save payload keeps the empty URL and the stored secret', () => {
  it('sends the URL even when it is empty, because empty is the deletion', () => {
    // The payload-cleaning helper in @/api/request drops '' as well as
    // undefined, which would turn a deletion into a no-op body.
    const payload = webhookPayloadFrom({
      url: '  ',
      secret: 'super-secret-key',
      events: '',
      insecureSkipVerify: false,
      headerName: '',
      mode: 'inherit',
      ...OLD_SERVER,
    })
    expect(payload).toHaveProperty('webhook_url', '')
    expect(Object.keys(payload)).toContain('webhook_url')
  })

  it('round-trips the secret unchanged, without trimming it', () => {
    // A secret is an opaque string: trimming it would change the value and
    // break the signature the receiving endpoint verifies.
    const payload = webhookPayloadFrom({
      url: 'https://example.com/webhook',
      secret: '  padded-secret  ',
      events: ' message ',
      insecureSkipVerify: true,
      headerName: '',
      mode: 'inherit',
      ...OLD_SERVER,
    })
    expect(payload.webhook_secret).toBe('  padded-secret  ')
    expect(payload.webhook_events).toBe('message')
    expect(payload.webhook_url).toBe('https://example.com/webhook')
    expect(payload.webhook_insecure_skip_verify).toBe(true)
  })
})

describe('a URL that is not https is noticed, not refused', () => {
  it('says nothing about an https URL or an empty one', () => {
    expect(webhookUrlNotice('https://example.com/webhook')).toBeNull()
    expect(webhookUrlNotice('HTTPS://EXAMPLE.COM/webhook')).toBeNull()
    expect(webhookUrlNotice('')).toBeNull()
  })

  it('states the consequence for http', () => {
    const notice = webhookUrlNotice('http://example.com/webhook')
    expect(notice).toMatch(/not https/i)
    expect(notice).toMatch(/read/i)
  })

  it('notices a string that is not a URL rather than rejecting it', () => {
    // The server is the authority on what it accepts; guessing which malformed
    // strings it would have taken is how a client refuses valid input.
    expect(webhookUrlNotice('example.com/webhook')).not.toBeNull()
  })
})

describe('a failed save never renders server text that carried the secret', () => {
  it('redacts any response-bearing failure', () => {
    // The rejection body in this file's helper literally quotes the field, which
    // is the case this exists for.
    expect(webhookSaveFailure(rejection(400))).toBe('redacted')
    expect(webhookSaveFailure(rejection(404))).toBe('redacted')
    expect(webhookSaveFailure(rejection(500))).toBe('redacted')
  })

  it('keeps the text when there was no response to echo anything', () => {
    // status 0 — offline, DNS, a cancelled request. Discarding this would make
    // an unreachable server look like a rejected secret.
    expect(webhookSaveFailure(new Error('Network Error'))).toBe('server')
  })

  it('names no value in the redacted sentence', () => {
    expect(WEBHOOK_SAVE_FAILED_REDACTED).toMatch(/not saved/i)
    expect(WEBHOOK_SAVE_FAILED_REDACTED).not.toMatch(/super-secret-key/)
  })
})

/*
 * z8pmx9p135 — authentication mode, header name, effective values, events.
 */

describe('the three authentication modes are three, not two (AC-1, TC-1)', () => {
  it('reads null and an absent field as inherit, never as plain', () => {
    expect(authModeFrom(null)).toBe('inherit')
    expect(authModeFrom(undefined)).toBe('inherit')
    expect(authModeFrom(true)).toBe('signed')
    expect(authModeFrom(false)).toBe('plain')
  })

  it('round-trips each mode to the wire value', () => {
    expect(signFrom('inherit')).toBeNull()
    expect(signFrom('signed')).toBe(true)
    expect(signFrom('plain')).toBe(false)
  })

  it('shows every spelling of an inherited header as an empty field, and sends blank as null', () => {
    expect(headerNameFrom('')).toBe('')
    expect(headerNameFrom(null)).toBe('')
    expect(headerNameFrom(undefined)).toBe('')
    expect(headerNameFrom('X-Agent-Signature')).toBe('X-Agent-Signature')
    expect(headerNamePayload('   ')).toBeNull()
    expect(headerNamePayload(' X-Agent-Signature ')).toBe('X-Agent-Signature')
  })
})

describe('the effective values are reported, never guessed (AC-2, TC-2)', () => {
  it('reads both values when the server sent them', () => {
    expect(
      effectiveAuthFrom(
        config({
          effective_webhook_header_name: 'X-Hub-Signature-256',
          effective_webhook_sign: true,
        }),
      ),
    ).toEqual({ headerName: 'X-Hub-Signature-256', mode: 'signed' })
    expect(
      effectiveAuthFrom(
        config({
          effective_webhook_header_name: 'X-Agent-Signature',
          effective_webhook_sign: false,
        }),
      ),
    ).toEqual({ headerName: 'X-Agent-Signature', mode: 'plain' })
  })

  it('reports nothing rather than filling in a default the UI cannot see', () => {
    expect(effectiveAuthFrom(config())).toBeNull()
    expect(effectiveAuthFrom(config({ effective_webhook_sign: true }))).toBeNull()
    expect(effectiveAuthFrom(config({ effective_webhook_header_name: 'X-A' }))).toBeNull()
  })
})

describe('every save states all six fields (AC-3, AC-15, TC-3, TC-11)', () => {
  const form = {
    url: 'https://example.com/webhook',
    secret: 'super-secret-key',
    events: 'message',
    insecureSkipVerify: false,
    headerName: '  ',
    mode: 'inherit' as const,
    ...OLD_SERVER,
  }

  it('sends the two absent-preserving keys explicitly, as null when inheriting', () => {
    // Omitting them would keep whatever is stored — the form would say
    // "Inherit" while the server kept a custom header.
    const payload = webhookPayloadFrom(form)
    expect(Object.keys(payload).sort()).toEqual(
      [
        'webhook_events',
        'webhook_header_name',
        'webhook_insecure_skip_verify',
        'webhook_secret',
        'webhook_sign',
        'webhook_url',
      ].sort(),
    )
    expect(payload.webhook_header_name).toBeNull()
    expect(payload.webhook_sign).toBeNull()
  })

  it('sends a chosen header trimmed, and the chosen mode', () => {
    const payload = webhookPayloadFrom({
      ...form,
      headerName: ' X-Agent-Signature ',
      mode: 'plain',
    })
    expect(payload.webhook_header_name).toBe('X-Agent-Signature')
    expect(payload.webhook_sign).toBe(false)
  })

  it('resets header and mode on a deletion, whatever the form held', () => {
    // The guide's full reset: an empty URL leaves no custom authentication behind.
    const payload = webhookPayloadFrom({ ...form, url: '', headerName: 'X-A', mode: 'signed' })
    expect(payload.webhook_url).toBe('')
    expect(payload.webhook_header_name).toBeNull()
    expect(payload.webhook_sign).toBeNull()
  })
})

describe('a mode that needs a secret refuses to go without one (AC-4, AC-17, TC-4)', () => {
  it('blocks Signed and Plain with no secret to send, and never Inherit', () => {
    expect(authSecretError('signed', '')).toMatch(/needs a secret/i)
    // Plain is the dangerous one: the server would send its global secret verbatim.
    expect(authSecretError('plain', '')).toMatch(/deployment-wide secret/i)
    expect(authSecretError('inherit', '')).toBeNull()
    expect(authSecretError('signed', 'k')).toBeNull()
    expect(authSecretError('plain', 'k')).toBeNull()
  })

  it('counts the stored secret as one to send', () => {
    const errors = webhookFormErrors({
      url: 'https://example.com/webhook',
      headerName: '',
      mode: 'signed',
      replacementSecret: '',
      storedSecret: 'stored',
      ...OLD_SERVER,
    })
    expect(errors).toEqual({ headerName: null, secret: null, auth: null })
  })

  it('warns when inherit resolves to plain and the device has no secret of its own', () => {
    const plain = { headerName: 'X-A', mode: 'plain' as const }
    const signed = { headerName: 'X-A', mode: 'signed' as const }
    expect(inheritedPlainWarning('inherit', plain, '')).toMatch(/deployment-wide secret/i)
    expect(inheritedPlainWarning('inherit', plain, 'own')).toBeNull()
    expect(inheritedPlainWarning('inherit', signed, '')).toBeNull()
    expect(inheritedPlainWarning('inherit', null, '')).toBeNull()
    expect(inheritedPlainWarning('plain', plain, '')).toBeNull()
  })
})

describe('the header name is checked the way the server checks it (AC-5, TC-5)', () => {
  it('accepts a blank (inherit), a custom name, Authorization and 128 characters', () => {
    expect(headerNameError('')).toBeNull()
    expect(headerNameError('X-Agent-Signature')).toBeNull()
    expect(headerNameError('Authorization')).toBeNull()
    expect(headerNameError('X'.repeat(128))).toBeNull()
    expect(headerNameError("a!#$%&'*+-.^_`|~9")).toBeNull()
  })

  it('refuses what the server refuses', () => {
    expect(headerNameError('X'.repeat(129))).toMatch(/128/)
    expect(headerNameError('X Bad')).toMatch(/only ASCII/i)
    expect(headerNameError('X:Y')).toMatch(/only ASCII/i)
    expect(headerNameError('X-Ünï')).toMatch(/only ASCII/i)
  })

  it('refuses the transport-owned names in any casing', () => {
    for (const name of [
      'Host',
      'content-type',
      'Content-Length',
      'CONNECTION',
      'Transfer-Encoding',
    ]) {
      expect(headerNameError(name), name).toMatch(/transport/i)
    }
  })

  it('validates the trimmed string that is sent', () => {
    expect(headerNameError('  X-Agent-Signature  ')).toBeNull()
    expect(headerNameError(' Host ')).toMatch(/transport/i)
  })
})

describe('the secret is checked without ever being quoted (AC-6, TC-6)', () => {
  const secret = 'abc-super-secret'

  it('refuses control characters and over-long secrets', () => {
    for (const bad of [`${secret}\n`, `${secret}\r`, `${secret}\u0000`, `${secret}\u0085`]) {
      const message = secretError(bad, 'replacement')
      expect(message).toMatch(/control characters/i)
      expect(message).not.toContain(secret)
    }
    expect(secretError('x'.repeat(4097), 'replacement')).toMatch(/4096/)
    expect(secretError('x'.repeat(4096), 'replacement')).toBeNull()
    expect(secretError('', 'replacement')).toBeNull()
  })

  it('asks for a replacement when the stored secret breaks the rules', () => {
    // Otherwise every save fails with a redacted 400 the operator cannot read.
    const message = secretError(`${secret}\n`, 'stored')
    expect(message).toMatch(/Enter a replacement/i)
    expect(message).not.toContain(secret)
    expect(
      webhookFormErrors({
        url: 'https://example.com/webhook',
        headerName: '',
        mode: 'inherit',
        replacementSecret: '',
        storedSecret: `${secret}\n`,
        ...OLD_SERVER,
      }).secret,
    ).toMatch(/Enter a replacement/i)
  })

  it('checks the replacement, not the stored secret, once one is typed', () => {
    expect(
      webhookFormErrors({
        url: 'https://example.com/webhook',
        headerName: '',
        mode: 'inherit',
        replacementSecret: 'fresh',
        storedSecret: `${secret}\n`,
        ...OLD_SERVER,
      }).secret,
    ).toBeNull()
  })

  it('blocks nothing on a deletion', () => {
    expect(
      webhookFormErrors({
        url: '',
        headerName: 'Host',
        mode: 'signed',
        replacementSecret: '',
        storedSecret: '',
        ...OLD_SERVER,
      }),
    ).toEqual({ headerName: null, secret: null, auth: null })
  })
})

describe('Plain is warned about (AC-7, TC-7)', () => {
  it('warns only for plain, naming the stored secret', () => {
    expect(plainWarning('plain', 'https://example.com')).toMatch(/already stored/i)
    expect(plainWarning('plain', 'https://example.com')).not.toMatch(/clear text/i)
    expect(plainWarning('signed', 'http://example.com')).toBeNull()
    expect(plainWarning('inherit', 'http://example.com')).toBeNull()
  })

  it('says the secret travels in clear text when the URL is not https', () => {
    expect(plainWarning('plain', 'http://example.com')).toMatch(/clear text/i)
  })
})

describe('events come from the catalogue and nothing stored is lost (AC-8, TC-8)', () => {
  it('lists the sixteen documented events', () => {
    expect(WEBHOOK_EVENTS).toHaveLength(16)
    expect(new Set(WEBHOOK_EVENTS.map((event) => event.name)).size).toBe(16)
  })

  it('matches case-insensitively, ignores spacing, and keeps unknown names', () => {
    expect(parseWebhookEvents(' Message, message.ack ,custom.x')).toEqual({
      selected: ['message', 'message.ack'],
      unknown: ['custom.x'],
    })
  })

  it('drops empty segments and duplicates, unknown names included', () => {
    expect(parseWebhookEvents('message,,MESSAGE, ,custom.x,Custom.X')).toEqual({
      selected: ['message'],
      unknown: ['custom.x'],
    })
    expect(parseWebhookEvents('')).toEqual({ selected: [], unknown: [] })
  })

  it('serialises in catalogue order and appends the kept names', () => {
    expect(serializeWebhookEvents(['message.ack', 'message'], ['custom.x'])).toBe(
      'message,message.ack,custom.x',
    )
    expect(serializeWebhookEvents([], [])).toBe('')
  })
})

describe('a later read only matters when it changes the form (AC-9, AC-14, TC-9)', () => {
  const seed = webhookFieldsFrom(config({ webhook_sign: true, webhook_header_name: 'X-A' }))

  it('ignores the delivery switch and the effective values', () => {
    // The dialog's own toggle refetches; it must not look like someone else's edit.
    const after = webhookFieldsFrom(
      config({
        webhook_sign: true,
        webhook_header_name: 'X-A',
        webhook_enabled: false,
        effective_webhook_sign: true,
        effective_webhook_header_name: 'X-A',
      }),
    )
    expect(webhookFieldsDiffer(seed, after)).toBe(false)
  })

  it('ignores event spelling the server treats as equal', () => {
    const after = webhookFieldsFrom(
      config({
        webhook_sign: true,
        webhook_header_name: 'X-A',
        webhook_events: 'MESSAGE.ACK, message',
      }),
    )
    expect(webhookFieldsDiffer(seed, after)).toBe(false)
  })

  it('sees a change to any of the six fields, the secret included', () => {
    const changes = [
      { webhook_url: 'https://other.example.com' },
      { webhook_secret: 'rotated' },
      { webhook_events: 'message' },
      { webhook_insecure_skip_verify: true },
      { webhook_header_name: 'X-B' },
      { webhook_sign: false },
    ]
    for (const change of changes) {
      const after = webhookFieldsFrom(
        config({ webhook_sign: true, webhook_header_name: 'X-A', ...change }),
      )
      expect(webhookFieldsDiffer(seed, after), JSON.stringify(change)).toBe(true)
    }
  })

  it('knows whether the operator edited the form', () => {
    const untouched = {
      url: seed.url,
      events: seed.events,
      insecureSkipVerify: seed.insecureSkipVerify,
      headerName: seed.headerName,
      replacementSecret: '',
      mode: 'signed' as const,
      scheme: seed.scheme,
    }
    expect(webhookFormEdited(seed, untouched)).toBe(false)
    expect(webhookFormEdited(seed, { ...untouched, mode: 'plain' })).toBe(true)
    expect(webhookFormEdited(seed, { ...untouched, headerName: 'X-B' })).toBe(true)
    expect(webhookFormEdited(seed, { ...untouched, replacementSecret: 'n' })).toBe(true)
  })
})

/*
 * z8pmx9pyre — the signature scheme, and the scheme the server says it uses.
 */

/** Every 4-character window of `secret`: no message may contain any of them. */
function fragmentsOf(secret: string): string[] {
  const fragments: string[] = []
  for (let i = 0; i + 4 <= secret.length; i++) fragments.push(secret.slice(i, i + 4))
  return fragments
}

describe('the stored scheme reaches the form in four states (AC-1, AC-12, AC-13, TC-1)', () => {
  it('reads every spelling of inherit, and the two schemes', () => {
    expect(schemeFrom('')).toBe('inherit')
    expect(schemeFrom(null)).toBe('inherit')
    expect(schemeFrom('legacy')).toBe('legacy')
    expect(schemeFrom('agent_hmac_v1')).toBe('agent_hmac_v1')
  })

  it('keeps a server that predates the field apart from one sending a value it does not know', () => {
    expect(schemeFrom(undefined)).toBe('unreported')
    expect(schemeFrom('agent_hmac_v2')).toBe('unrecognised')
    expect(webhookFieldsFrom(config()).scheme).toBe('unreported')
  })
})

describe('the effective scheme is reported, never guessed (AC-2, AC-3, TC-2, TC-3)', () => {
  it('reads the three documented values and keeps an unknown one apart from absent', () => {
    const read = (value: string) =>
      effectiveSchemeFrom(config({ effective_webhook_signature_scheme: value }))
    expect(read('legacy')).toBe('legacy')
    expect(read('agent_hmac_v1')).toBe('agent_hmac_v1')
    expect(read('invalid')).toBe('invalid')
    expect(read('v9')).toBe('unrecognised')
    expect(effectiveSchemeFrom(config())).toBeNull()
  })

  it('names the inherited scheme only when the device actually inherits', () => {
    expect(schemeOptionLabel('inherit', 'inherit', 'legacy')).toBe('Inherit (currently: legacy)')
    expect(schemeOptionLabel('inherit', 'inherit', 'agent_hmac_v1')).toBe(
      'Inherit (currently: agent_hmac_v1)',
    )
    // The effective value is the device's own choice here, not the default.
    expect(schemeOptionLabel('inherit', 'agent_hmac_v1', 'agent_hmac_v1')).toBe('Inherit')
    expect(schemeOptionLabel('inherit', 'inherit', null)).toBe('Inherit')
    expect(schemeOptionLabel('inherit', 'inherit', 'invalid')).toBe('Inherit')
    expect(schemeOptionLabel('inherit', 'inherit', 'unrecognised')).toBe('Inherit')
    expect(schemeOptionLabel('legacy', 'inherit', 'legacy')).toBe('Legacy')
    expect(schemeOptionLabel('agent_hmac_v1', 'inherit', 'legacy')).toBe('Agent HMAC v1')
  })

  it('says delivery is stopped without assuming the reader can fix it', () => {
    expect(SCHEME_INVALID_WARNING).toMatch(/no events are delivered/i)
    expect(SCHEME_INVALID_WARNING).toMatch(/until the configuration is fixed/i)
    expect(SCHEME_INVALID_WARNING).not.toMatch(/below/i)
  })
})

describe('v1 is in force when chosen, or inherited and reported (AC-4, AC-16, TC-13)', () => {
  it('follows an explicit choice', () => {
    expect(v1InForce('agent_hmac_v1', 'legacy', 'legacy')).toBe(true)
    expect(v1InForce('legacy', 'agent_hmac_v1', 'agent_hmac_v1')).toBe(false)
  })

  it('follows Inherit only on a device that inherits and whose server said v1', () => {
    expect(v1InForce('inherit', 'inherit', 'agent_hmac_v1')).toBe(true)
    expect(v1InForce('inherit', 'inherit', 'legacy')).toBe(false)
    expect(v1InForce('inherit', 'inherit', null)).toBe(false)
    // Effective v1 here is the device's own explicit choice, not the default.
    expect(v1InForce('inherit', 'agent_hmac_v1', 'agent_hmac_v1')).toBe(false)
    expect(v1InForce('unreported', 'unreported', null)).toBe(false)
  })
})

describe('leaving v1 lands on Signed (AC-15, TC-12)', () => {
  it('sets Signed when v1 goes out of force, whatever the mode was', () => {
    expect(modeAfterSchemeChange(true, false, 'inherit')).toBe('signed')
    expect(modeAfterSchemeChange(true, false, 'plain')).toBe('signed')
  })

  it('leaves the mode alone otherwise', () => {
    expect(modeAfterSchemeChange(true, true, 'inherit')).toBe('inherit')
    expect(modeAfterSchemeChange(false, false, 'plain')).toBe('plain')
    expect(modeAfterSchemeChange(false, true, 'plain')).toBe('plain')
  })
})

describe('an Agent HMAC v1 key is checked the way the server keys it (AC-5, TC-5)', () => {
  const key = 'Qz7mK2pX9vR4tW8yB1nC6dF3gH5jL0sA'

  it('counts after trimming, in code points', () => {
    expect(key).toHaveLength(32)
    expect(agentSecretError(key, 'replacement')).toBeNull()
    expect(agentSecretError(`  ${key}  `, 'replacement')).toBeNull()
    expect(agentSecretError(key.slice(1), 'replacement')).toMatch(/at least 32/)
    expect(agentSecretError(`  ${key.slice(1)}   `, 'replacement')).toMatch(/at least 32/)
    // 31 astral characters are 62 UTF-16 units, and still 31 characters.
    expect(agentSecretError('😀'.repeat(31), 'replacement')).toMatch(/at least 32/)
    expect(agentSecretError('😀'.repeat(32), 'replacement')).toBeNull()
  })

  it('names the placeholder before the length, and requires a secret at all', () => {
    expect(agentSecretError(' secret ', 'replacement')).toMatch(/placeholder/i)
    expect(agentSecretError(' secret ', 'replacement')).not.toMatch(/at least/)
    expect(agentSecretError('', 'stored')).toMatch(/needs a secret of its own/i)
    expect(agentSecretError('   ', 'replacement')).toMatch(/needs a secret of its own/i)
  })

  it('asks for a replacement when the stored secret is the one that fails', () => {
    expect(agentSecretError('short', 'stored')).toMatch(/Enter a replacement/)
    expect(agentSecretError('secret', 'stored')).toMatch(/Enter a replacement/)
  })

  it('never quotes any part of the secret', () => {
    const secret = 'Zr8!unique-WEBHOOK-material'
    for (const source of ['replacement', 'stored'] as const) {
      const message = agentSecretError(secret, source) ?? ''
      expect(message).not.toBe('')
      for (const fragment of fragmentsOf(secret)) expect(message).not.toContain(fragment)
    }
  })
})

describe('the form errors follow the scheme in force (AC-5, AC-6, AC-9, AC-16, TC-5, TC-6, TC-8)', () => {
  const base = {
    url: 'https://example.com/webhook',
    headerName: 'Not A Header',
    mode: 'plain' as const,
    replacementSecret: '',
    storedSecret: 'short',
  }

  it('blocks an explicit v1 on the key, under the secret, and ignores the hidden controls', () => {
    const errors = webhookFormErrors({ ...base, scheme: 'agent_hmac_v1', v1: true })
    expect(errors.secret).toMatch(/32/)
    expect(errors.headerName).toBeNull()
    expect(errors.auth).toBeNull()
  })

  it('still applies the format rule first', () => {
    const errors = webhookFormErrors({
      ...base,
      scheme: 'agent_hmac_v1',
      v1: true,
      replacementSecret: `${'k'.repeat(40)}\n`,
    })
    expect(errors.secret).toMatch(/control characters/)
  })

  it('does not block an inherited v1, and says what it costs instead', () => {
    const errors = webhookFormErrors({ ...base, scheme: 'inherit', v1: true })
    expect(errors).toEqual({ headerName: null, secret: null, auth: null })
    expect(inheritedV1Notice('inherit', true, '', 'short')).toMatch(/delivery stays stopped/)
    expect(inheritedV1Notice('inherit', true, '', 'k'.repeat(32))).toBeNull()
    expect(inheritedV1Notice('agent_hmac_v1', true, '', 'short')).toBeNull()
    expect(inheritedV1Notice('inherit', false, '', 'short')).toBeNull()
  })

  it('keeps the legacy rules when v1 is not in force', () => {
    const errors = webhookFormErrors({ ...base, scheme: 'legacy', v1: false })
    expect(errors.headerName).not.toBeNull()
    expect(errors.secret).toBeNull()
  })

  it('blocks nothing on a deletion, v1 included', () => {
    expect(
      webhookFormErrors({ ...base, url: '', storedSecret: '', scheme: 'agent_hmac_v1', v1: true }),
    ).toEqual({ headerName: null, secret: null, auth: null })
  })
})

describe('the scheme is stated on every save (AC-7, AC-8, AC-9, AC-12, AC-13, TC-7, TC-8, TC-10)', () => {
  const form = {
    url: 'https://example.com/webhook',
    secret: 'super-secret-key',
    events: '',
    insecureSkipVerify: false,
    headerName: 'X-Custom',
    mode: 'plain' as const,
  }

  it('sends the key for each choice, null for Inherit', () => {
    expect(webhookPayloadFrom({ ...form, scheme: 'inherit', v1: false })).toHaveProperty(
      'webhook_signature_scheme',
      null,
    )
    expect(webhookPayloadFrom({ ...form, scheme: 'legacy', v1: false })).toHaveProperty(
      'webhook_signature_scheme',
      'legacy',
    )
    expect(webhookPayloadFrom({ ...form, scheme: 'agent_hmac_v1', v1: true })).toHaveProperty(
      'webhook_signature_scheme',
      'agent_hmac_v1',
    )
  })

  it('sends the hidden controls as their reset value under v1 — never sign false', () => {
    for (const scheme of ['agent_hmac_v1', 'inherit'] as const) {
      const payload = webhookPayloadFrom({ ...form, scheme, v1: true })
      expect(payload.webhook_sign).toBeNull()
      expect(payload.webhook_header_name).toBeNull()
    }
    const legacy = webhookPayloadFrom({ ...form, scheme: 'legacy', v1: false })
    expect(legacy.webhook_sign).toBe(false)
    expect(legacy.webhook_header_name).toBe('X-Custom')
  })

  it('omits the key for a server that predates it, and for a value it does not know', () => {
    for (const scheme of ['unreported', 'unrecognised'] as const) {
      const payload = webhookPayloadFrom({ ...form, scheme, v1: false })
      expect(Object.keys(payload)).not.toContain('webhook_signature_scheme')
      expect(Object.keys(payload)).toHaveLength(6)
    }
  })

  it('resets the scheme on a deletion — except where the server would not know the key', () => {
    const cleared = webhookPayloadFrom({ ...form, url: '', scheme: 'agent_hmac_v1', v1: true })
    expect(cleared).toHaveProperty('webhook_signature_scheme', null)
    expect(cleared.webhook_sign).toBeNull()
    expect(cleared.webhook_header_name).toBeNull()
    expect(
      webhookPayloadFrom({ ...form, url: '', scheme: 'unrecognised', v1: false }),
    ).toHaveProperty('webhook_signature_scheme', null)
    expect(
      Object.keys(webhookPayloadFrom({ ...form, url: '', scheme: 'unreported', v1: false })),
    ).not.toContain('webhook_signature_scheme')
  })
})

describe('the scheme takes part in edit detection (AC-11, TC-10)', () => {
  const seed = webhookFieldsFrom(config({ webhook_signature_scheme: '' }))

  it('sees a re-read that changes only the stored scheme', () => {
    expect(seed.scheme).toBe('inherit')
    const reread = (stored: string | null) =>
      webhookFieldsFrom(config({ webhook_signature_scheme: stored }))
    expect(webhookFieldsDiffer(seed, reread(null))).toBe(false)
    expect(webhookFieldsDiffer(seed, reread('legacy'))).toBe(true)
  })

  it('ignores a change to the effective scheme alone', () => {
    const after = webhookFieldsFrom(
      config({ webhook_signature_scheme: '', effective_webhook_signature_scheme: 'invalid' }),
    )
    expect(webhookFieldsDiffer(seed, after)).toBe(false)
  })

  it('counts a scheme-only change as an edit', () => {
    const untouched = {
      url: seed.url,
      events: seed.events,
      insecureSkipVerify: seed.insecureSkipVerify,
      headerName: seed.headerName,
      replacementSecret: '',
      mode: 'inherit' as const,
      scheme: seed.scheme,
    }
    expect(webhookFormEdited(seed, untouched)).toBe(false)
    expect(webhookFormEdited(seed, { ...untouched, scheme: 'agent_hmac_v1' })).toBe(true)
  })
})

describe('"currently sent" cannot contradict the server (AC-14, TC-11)', () => {
  const signed = { headerName: 'X-Hub-Signature-256', mode: 'signed' as const }

  it('describes v1 as an HMAC of the signed string', () => {
    expect(effectiveSummary(signed, 'agent_hmac_v1').text).toContain(AGENT_HMAC_V1_SIGNED_STRING)
  })

  it('keeps the legacy wording for legacy and for a server that reports no scheme', () => {
    expect(effectiveSummary(signed, 'legacy').text).toMatch(/HMAC of the body/)
    expect(effectiveSummary(signed, null).text).toMatch(/HMAC of the body/)
    expect(effectiveSummary({ headerName: 'Authorization', mode: 'plain' }, null).text).toMatch(
      /verbatim/,
    )
  })

  it('says nothing is sent under invalid, and describes nothing it does not know', () => {
    const invalid = effectiveSummary(signed, 'invalid')
    expect(invalid.headerName).toBeNull()
    expect(invalid.text).toMatch(/Nothing is being sent/)
    const unknown = effectiveSummary(signed, 'unrecognised')
    expect(unknown.headerName).toBeNull()
    expect(unknown.text).not.toMatch(/HMAC/)
    expect(effectiveSummary(null, null).text).toBe(EFFECTIVE_UNKNOWN)
  })
})

describe('the redacted failure points at what v1 can reject', () => {
  it('names the secret and the scheme, and still quotes nothing', () => {
    expect(WEBHOOK_SAVE_FAILED_REDACTED).toMatch(/secret, the signature scheme/)
  })
})

import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import type { DeviceWebhookConfig } from '@/api/devices'
import {
  CLEARS_WEBHOOK_WARNING,
  DISABLED_MEANS,
  ENABLING_RESUMES,
  INSECURE_SKIP_VERIFY_MEANS,
  WEBHOOK_EVENTS,
  WEBHOOK_SAVE_FAILED_REDACTED,
  authModeFrom,
  authSecretError,
  effectiveAuthFrom,
  headerNameError,
  headerNameFrom,
  headerNamePayload,
  inheritedPlainWarning,
  parseWebhookEvents,
  plainWarning,
  secretError,
  serializeWebhookEvents,
  signFrom,
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
    }
    expect(webhookFormEdited(seed, untouched)).toBe(false)
    expect(webhookFormEdited(seed, { ...untouched, mode: 'plain' })).toBe(true)
    expect(webhookFormEdited(seed, { ...untouched, headerName: 'X-B' })).toBe(true)
    expect(webhookFormEdited(seed, { ...untouched, replacementSecret: 'n' })).toBe(true)
  })
})

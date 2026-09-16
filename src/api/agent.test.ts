import { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from '@/stores/auth'
import { useDeviceStore } from '@/stores/device'
import { http } from '@/lib/http'
import { toggleAgentDebug } from './agent'

/**
 * The toggle, asserted on **the request that leaves** (ticket z8pmx9mw2x).
 *
 * The three properties this endpoint is most dangerous to get wrong are all
 * properties of the body on the wire, not of any value in memory:
 *
 * - `enabled` is **always present**. The reference makes it mandatory precisely
 *   so a malformed body cannot silently switch debug *off* for a number the
 *   operator meant to switch it *on* for — and a key whose value is `undefined`
 *   is still reported by `Object.keys`, so only the serialised body can answer
 *   this.
 * - `ttl_minutes` is present **or absent**, never `0`, never `null`.
 * - The device travels in the header the interceptor attaches, and the request
 *   goes to the same-origin API prefix and nowhere else.
 *
 * Driven through the real interceptor chain with a stub adapter — the harness
 * `http.test.ts` established and `chat.test.ts` follows.
 */

const originalAdapter = http.defaults.adapter

function respondWith(results: unknown): InternalAxiosRequestConfig[] {
  const sent: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config as InternalAxiosRequestConfig)
    return {
      status: 200,
      data: { code: 'SUCCESS', message: 'Agent debug mode toggled', results },
      statusText: '',
      headers: {},
      config,
    } as AxiosResponse
  }
  http.defaults.adapter = adapter
  return sent
}

/**
 * The body as the server receives it.
 *
 * By the time a request reaches the adapter axios has already run its transforms,
 * so `config.data` is the **serialised JSON string** — which is exactly what
 * these assertions want: a key whose value is `undefined` survives in an object
 * and is gone from the string, and that difference is the whole point of
 * `ttl_minutes` being "present or absent, never null".
 */
function rawBody(config: InternalAxiosRequestConfig): string {
  return typeof config.data === 'string' ? config.data : JSON.stringify(config.data)
}

function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  return JSON.parse(rawBody(config)) as Record<string, unknown>
}

beforeEach(() => {
  useAuth.setState({
    access_token: null,
    refresh_token: null,
    access_token_expires_at: null,
    user: null,
    status: 'unknown',
    endReason: null,
  })
  useDeviceStore.setState({ selectedDeviceId: null })
})

afterEach(() => {
  http.defaults.adapter = originalAdapter
})

const OK = { phone: '+963938113282', enabled: true, expires_at: '2026-08-19T12:30:00Z' }

describe('the toggle body (AC-1, AC-16, TC-1, TC-2)', () => {
  it('carries an explicit enabled:true and the duration that was chosen', async () => {
    const sent = respondWith(OK)

    await toggleAgentDebug({
      phone: '+963938113282',
      enabled: true,
      ttl: { kind: 'minutes', minutes: 120 },
    })

    expect(sent).toHaveLength(1)
    expect(bodyOf(sent[0])).toEqual({
      phone: '+963938113282',
      enabled: true,
      ttl_minutes: 120,
    })
  })

  it('carries an explicit enabled:false, and no duration at all', async () => {
    const sent = respondWith({ phone: '+963938113282', enabled: false, expires_at: null })

    await toggleAgentDebug({ phone: '+963938113282', enabled: false, ttl: { kind: 'omit' } })

    const body = bodyOf(sent[0])
    expect(body).toEqual({ phone: '+963938113282', enabled: false })
    // `enabled` is the field whose ABSENCE would be read as a default, so its
    // presence is asserted on its own rather than inferred from the shape above.
    expect(Object.keys(body)).toContain('enabled')
    expect(body.enabled).toBe(false)
  })

  it('omits ttl_minutes entirely rather than sending zero or null', async () => {
    const sent = respondWith(OK)

    await toggleAgentDebug({ phone: '+963938113282', enabled: true, ttl: { kind: 'omit' } })

    // The serialised body is the assertion: `ttl_minutes: undefined` would be a
    // key `Object.keys` still reports, and `0` is a 400.
    expect(rawBody(sent[0])).not.toContain('ttl_minutes')
    expect(Object.keys(bodyOf(sent[0]))).toEqual(['phone', 'enabled'])
  })

  it('sends the phone exactly as given, leading plus included', async () => {
    const sent = respondWith(OK)

    await toggleAgentDebug({
      phone: '+963938113282',
      enabled: true,
      ttl: { kind: 'minutes', minutes: 30 },
    })

    expect(bodyOf(sent[0]).phone).toBe('+963938113282')
  })
})

describe('the transport (AC-1, AC-3, AC-44)', () => {
  it('goes to the same-origin API prefix, and carries the selected device', async () => {
    useDeviceStore.setState({ selectedDeviceId: 'device-7' })
    const sent = respondWith(OK)

    await toggleAgentDebug({ phone: '+963938113282', enabled: true, ttl: { kind: 'omit' } })

    expect(http.getUri(sent[0])).toBe('/api/agent/debug/toggle')
    expect(sent[0].headers['X-Device-Id']).toBe('device-7')
  })

  it('puts the number in the body and nowhere in the URL', async () => {
    useDeviceStore.setState({ selectedDeviceId: 'device-7' })
    const sent = respondWith(OK)

    await toggleAgentDebug({ phone: '+963938113282', enabled: false, ttl: { kind: 'omit' } })

    // A number in a URL is a number in a proxy log, a referrer and a history
    // entry. This endpoint takes it in the body only.
    expect(http.getUri(sent[0])).not.toContain('963938113282')
  })

  it('unwraps the envelope and hands back the upstream body untouched', async () => {
    const passthrough = { phone: '+963938113282', enabled: true, expires_at: null, extra: { a: 1 } }
    respondWith(passthrough)

    const results = await toggleAgentDebug({
      phone: '+963938113282',
      enabled: true,
      ttl: { kind: 'omit' },
    })

    // Additional fields are the omni's and are passed through rather than
    // stripped; `toggleReport` decides what to read off them.
    expect(results).toEqual(passthrough)
  })
})

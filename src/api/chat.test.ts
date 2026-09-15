import { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from '@/stores/auth'
import { useDeviceStore } from '@/stores/device'
import { http } from '@/lib/http'
import { getChatMessages } from './chat'

/**
 * The diagnostics opt-in, asserted on the **request that leaves** (z8pmx9mv3v).
 *
 * The reference's rule for `include_debug` is not "send a boolean" — it is that
 * the parameter is `true` or **absent**, never `false`. That distinction cannot
 * be checked by looking at the params object: a key whose value is `undefined`
 * is still a key, and `Object.keys` reports it. It can only be checked on the
 * serialised URL, which is what `http.getUri` builds and what axios would
 * actually have sent.
 *
 * Driven through the real interceptor chain with a stub adapter, the harness
 * `http.test.ts` established and `accounts.test.ts` follows.
 */

const originalAdapter = http.defaults.adapter

function respondWith(results: unknown): InternalAxiosRequestConfig[] {
  const sent: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config as InternalAxiosRequestConfig)
    return {
      status: 200,
      data: { code: 'SUCCESS', message: '', results },
      statusText: '',
      headers: {},
      config,
    } as AxiosResponse
  }
  http.defaults.adapter = adapter
  return sent
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

const PAGE = { data: [], pagination: { limit: 30, offset: 0, total: 0 }, chat_info: {} }

describe('the include_debug opt-in (AC-3, AC-6, TC-1, TC-4)', () => {
  it('sends no include_debug at all when the opt-in is off', async () => {
    const sent = respondWith(PAGE)

    await getChatMessages('62811@s.whatsapp.net', {
      limit: 30,
      offset: 0,
      includeDebug: false,
    })

    // The query string is the assertion: this is what the server receives.
    expect(http.getUri(sent[0])).not.toContain('include_debug')
    // And the UI-level name never reaches the wire under any spelling.
    expect(http.getUri(sent[0])).not.toContain('includeDebug')
    // `toEqual` ignores members whose value is `undefined`, which is exactly the
    // shape the translation produces.
    expect(sent[0].params).toEqual({ limit: 30, offset: 0 })
  })

  it('sends no include_debug when the caller omits the field entirely', async () => {
    // The first load, before the operator has touched anything (TC-1).
    const sent = respondWith(PAGE)

    await getChatMessages('62811@s.whatsapp.net', { limit: 30, offset: 0 })

    expect(http.getUri(sent[0])).not.toContain('include_debug')
  })

  it('sends include_debug=true, and only that spelling, when the opt-in is on', async () => {
    const sent = respondWith(PAGE)

    await getChatMessages('62811@s.whatsapp.net', {
      limit: 30,
      offset: 0,
      includeDebug: true,
    })

    const uri = http.getUri(sent[0])
    expect(uri).toContain('include_debug=true')
    // The mutant this kills is `include_debug: includeDebug`, which would send
    // `include_debug=false` on the off path — a value the reference never
    // describes and the backend has no documented behaviour for.
    expect(uri).not.toContain('include_debug=false')
  })

  it('leaves every other parameter exactly as it was given', async () => {
    // AC-23: the opt-in changes what each message carries, never which messages
    // come back or how they are paged.
    const sent = respondWith(PAGE)

    await getChatMessages('62811@s.whatsapp.net', {
      limit: 30,
      offset: 60,
      search: 'invoice',
      media_only: true,
      includeDebug: true,
    })

    expect(sent[0].params).toEqual({
      limit: 30,
      offset: 60,
      search: 'invoice',
      media_only: true,
      include_debug: true,
    })
  })

  it('percent-encodes the chat jid into the path', async () => {
    const sent = respondWith(PAGE)

    await getChatMessages('62811-1234@g.us', { limit: 30 })

    expect(sent[0].url).toBe('/chat/62811-1234%40g.us/messages')
  })
})

import { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from '@/stores/auth'
import { useDeviceStore } from '@/stores/device'
import { http } from '@/lib/http'
import { getMessageDebug } from './message'

/**
 * `GET /message/{message_id}/debug` (z8pmx9mv3v).
 *
 * The route the reference documents for a message whose diagnostics fell past
 * the page's 1 MiB embedding budget — fetched for that one message, when the
 * operator opens it. It is **not** in `openapi.yaml` (§12), so what can be
 * asserted is what this client sends: the path, the encoding, and the absence of
 * anything else.
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

describe('the per-message diagnostics fetch (AC-14, TC-3)', () => {
  it('issues exactly one GET for the message it was asked about', async () => {
    const sent = respondWith({ metadata_debug: { model: 'x' } })

    await getMessageDebug('3EB0A1B2C3')

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('get')
    expect(sent[0].url).toBe('/message/3EB0A1B2C3/debug')
  })

  it('carries no parameters — unlike /download, this route takes the id alone', async () => {
    const sent = respondWith({})

    await getMessageDebug('3EB0A1B2C3')

    expect(http.getUri(sent[0])).not.toContain('?')
    expect(sent[0].data).toBeUndefined()
  })

  it('percent-encodes the message id into the path', async () => {
    const sent = respondWith({})

    await getMessageDebug('id with/slash')

    expect(sent[0].url).toBe('/message/id%20with%2Fslash/debug')
  })

  it('returns the unwrapped envelope contents, whatever shape they are', async () => {
    // `unknown` on purpose (§12): the shape is decided at the point of use, on
    // the presence of a key, by debugPayloadOf.
    respondWith({ metadata_debug: { tokens: 12 }, generated_at: '2026-09-15T10:00:00Z' })

    await expect(getMessageDebug('abc')).resolves.toEqual({
      metadata_debug: { tokens: 12 },
      generated_at: '2026-09-15T10:00:00Z',
    })
  })
})

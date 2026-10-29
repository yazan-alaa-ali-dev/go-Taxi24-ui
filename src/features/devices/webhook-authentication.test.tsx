import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AGENT_HMAC_V1_SIGNED_STRING, SCHEME_UNRECOGNISED_PLACEHOLDER } from '@/lib/device-webhook'
import { SchemeInvalidWarning, WebhookAuthentication } from './webhook-authentication'

/**
 * A real render, asserted on real markup (ticket z8pmx9pyre).
 *
 * "The legacy controls are absent under v1, not disabled", "a server that
 * predates the scheme gets no scheme control" and "the invalid warning is an
 * alert with no dismiss control" are claims about **output**. The dialog that
 * mounts these owns a query and two mutations, so the section was extracted
 * hook-free to be rendered here — the `message-transcript.test.tsx` precedent.
 *
 * Under `renderToStaticMarkup` a Radix `Select` emits its trigger and not its
 * options (they live in a portal), so option labels are asserted in
 * `@/lib/device-webhook`'s tests, through `schemeOptionLabel`.
 */

const noop = () => {}

function render(overrides: Partial<Parameters<typeof WebhookAuthentication>[0]> = {}): string {
  return renderToStaticMarkup(
    <WebhookAuthentication
      scheme="legacy"
      seededScheme="legacy"
      effectiveScheme="legacy"
      effectiveAuth={{ headerName: 'X-Hub-Signature-256', mode: 'signed' }}
      v1={false}
      mode="signed"
      headerName=""
      mayWrite
      headerNameError={null}
      authError={null}
      notices={[]}
      onSchemeChange={noop}
      onModeChange={noop}
      onHeaderNameChange={noop}
      {...overrides}
    />,
  )
}

describe('the invalid scheme is an alert nobody can dismiss (AC-3, TC-3)', () => {
  it('renders an alert with no control when the server reports invalid', () => {
    const html = renderToStaticMarkup(<SchemeInvalidWarning effective="invalid" />)
    expect(html).toContain('role="alert"')
    expect(html).toMatch(/no events are delivered/i)
    expect(html).not.toContain('<button')
  })

  it('renders nothing for any other report, or none', () => {
    for (const effective of ['legacy', 'agent_hmac_v1', 'unrecognised', null] as const) {
      expect(renderToStaticMarkup(<SchemeInvalidWarning effective={effective} />)).toBe('')
    }
  })
})

describe('the scheme in force decides which controls exist (AC-4, TC-4, TC-13)', () => {
  it('under v1, renders the fixed contract and not the legacy controls', () => {
    const html = render({ scheme: 'agent_hmac_v1', v1: true })
    expect(html).not.toContain('id="device-webhook-mode"')
    expect(html).not.toContain('id="device-webhook-header"')
    expect(html).toContain('X-Agent-Timestamp')
    expect(html).toContain('X-Agent-Request-Id')
    expect(html).toContain('the signature header')
    expect(html).toContain(AGENT_HMAC_V1_SIGNED_STRING)
  })

  it('under an inherited v1, hides the legacy controls the same way', () => {
    const html = render({
      scheme: 'inherit',
      seededScheme: 'inherit',
      effectiveScheme: 'agent_hmac_v1',
      v1: true,
    })
    expect(html).not.toContain('id="device-webhook-mode"')
    expect(html).toContain(AGENT_HMAC_V1_SIGNED_STRING)
  })

  it('under legacy, renders the legacy controls and not the v1 contract', () => {
    const html = render()
    expect(html).toContain('id="device-webhook-mode"')
    expect(html).toContain('id="device-webhook-header"')
    expect(html).not.toContain('X-Agent-Timestamp')
    expect(html).not.toContain(AGENT_HMAC_V1_SIGNED_STRING)
  })
})

describe('the scheme control exists only where the server knows the field (AC-12, AC-13, TC-10)', () => {
  it('renders no scheme control for a server that predates it', () => {
    const html = render({ scheme: 'unreported', seededScheme: 'unreported', effectiveScheme: null })
    expect(html).not.toContain('id="device-webhook-scheme"')
    expect(html).toContain('id="device-webhook-mode"')
  })

  it('renders the scheme control otherwise', () => {
    expect(render()).toContain('id="device-webhook-scheme"')
  })

  it('shows an unrecognised stored value as kept, not as one of the choices', () => {
    const html = render({ scheme: 'unrecognised', seededScheme: 'unrecognised' })
    expect(html).toContain(SCHEME_UNRECOGNISED_PLACEHOLDER)
  })
})

describe('the summary under the controls follows the server (AC-14)', () => {
  it('says nothing is sent when the scheme is invalid', () => {
    const html = render({ effectiveScheme: 'invalid' })
    expect(html).toContain('Nothing is being sent')
    expect(html).not.toContain('X-Hub-Signature-256')
  })

  it('renders the notices it is given', () => {
    expect(render({ notices: ['A notice about the default.'] })).toContain(
      'A notice about the default.',
    )
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AGENT_HMAC_V1_SIGNED_STRING, SCHEME_UNRECOGNISED_PLACEHOLDER } from '@/lib/device-webhook'
import {
  SchemeInvalidWarning,
  SchemeSwitchConfirmation,
  WebhookAuthentication,
} from './webhook-authentication'

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
      schemeError={null}
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

describe('the scheme-switch confirmation sends only from its own button (AC-1, AC-15, TC-3, TC-12)', () => {
  const copy = {
    title: 'Switch this device to Agent HMAC v1?',
    lines: ['First consequence.', 'Second consequence.'],
    action: 'Switch to Agent HMAC v1 and save',
  }

  function confirmation(disabled: boolean): string {
    return renderToStaticMarkup(
      <SchemeSwitchConfirmation copy={copy} disabled={disabled} onCancel={noop} onConfirm={noop} />,
    )
  }

  it('is announced, lists every line, and offers Cancel and the named action', () => {
    const html = confirmation(false)
    expect(html).toContain('role="alert"')
    expect(html).toContain(copy.title)
    for (const line of copy.lines) expect(html).toContain(`<li>${line}</li>`)
    expect(html).toContain('>Cancel</button>')
    expect(html).toContain(copy.action)
  })

  it('has no submit button: neither button can be reached by the form’s own submit', () => {
    const html = confirmation(false)
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html.match(/type="button"/g)).toHaveLength(2)
    expect(html).not.toContain('type="submit"')
  })

  it('disables Confirm when told — a blocked form or a save in flight — and never Cancel', () => {
    const html = confirmation(true)
    expect(html.match(/disabled=""/g)).toHaveLength(1)
    expect(html).toMatch(/disabled=""[^>]*>Switch to Agent HMAC v1 and save/)
    expect(confirmation(false)).not.toContain('disabled=""')
  })
})

describe('a scheme rejection is shown under the select (AC-8, AC-9)', () => {
  it('renders the sentence and marks the select invalid', () => {
    const html = render({ schemeError: 'The server did not accept this signature scheme.' })
    expect(html).toContain('The server did not accept this signature scheme.')
    expect(html).toMatch(
      /id="device-webhook-scheme"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="device-webhook-scheme"/,
    )
  })

  it('has nowhere to render it when the server does not report the scheme', () => {
    const html = render({
      scheme: 'unreported',
      seededScheme: 'unreported',
      effectiveScheme: null,
      schemeError: 'The server did not accept this signature scheme.',
    })
    // The dialog places it beside Save instead (rejectionShownAt).
    expect(html).not.toContain('The server did not accept this signature scheme.')
  })
})

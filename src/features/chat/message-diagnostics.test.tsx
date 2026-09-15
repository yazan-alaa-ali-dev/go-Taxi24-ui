import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MessageInfo } from '@/api/chat'
import { MessageDiagnostics } from './message-diagnostics'

/**
 * A real render, asserted on real markup (ticket z8pmx9mv3v).
 *
 * "Absent from the DOM, not disabled" is a claim about **output**, so it is
 * asserted on output. There is no jsdom and no React Testing Library here, and
 * adding either would add a dependency to a build that inlines everything into
 * one file — `src/components/shared/can.test.tsx` explains that choice, and
 * `react-dom/server` answers this question exactly.
 *
 * **No `QueryClientProvider` is needed, and that absence is itself the
 * assertion.** `useQuery` outside a provider throws. Every case below renders
 * cleanly, which is only possible because a closed panel is not rendered at all
 * — so an unopened row mounts no query observer, and a conversation of thirty
 * messages issues no diagnostics requests until the operator opens one (AC-17).
 * If somebody replaces the conditional render with an `enabled:` gate, these
 * tests stop passing rather than quietly weakening.
 */

/** The fields of a stored message this surface reads; the rest is scaffolding. */
function message(overrides: Partial<MessageInfo>): MessageInfo {
  return {
    id: '3EB0A1B2C3',
    chat_jid: '62811@s.whatsapp.net',
    sender_jid: '62811@s.whatsapp.net',
    content: 'Thanks, that worked.',
    timestamp: '2026-09-15T09:30:00Z',
    is_from_me: false,
    media_type: '',
    filename: '',
    url: '',
    file_length: 0,
    sent_via: 'whatsapp',
    ...overrides,
  }
}

describe('the diagnostics badge is absent, never disabled (AC-1, AC-2, TC-4)', () => {
  it('renders nothing without the permission, even for a message that carries diagnostics', () => {
    const markup = renderToStaticMarkup(
      <MessageDiagnostics message={message({ has_debug: true })} canRead={false} />,
    )

    expect(markup).toBe('')
  })

  it('renders nothing disabled anywhere — absence is the whole mechanism', () => {
    const markup = renderToStaticMarkup(
      <MessageDiagnostics message={message({ has_debug: true })} canRead={false} />,
    )

    // A disabled badge still announces a capability this principal does not
    // have, which is precisely what hiding it spares them.
    expect(markup).not.toContain('disabled')
  })
})

describe('the badge follows has_debug and nothing else (AC-9, AC-11, AC-12, TC-5, TC-8)', () => {
  it('renders a badge for a permitted principal when has_debug is true', () => {
    const markup = renderToStaticMarkup(
      <MessageDiagnostics message={message({ has_debug: true })} canRead={true} />,
    )

    expect(markup).toContain('Diagnostics')
    expect(markup).toContain('aria-expanded="false"')
  })

  it('renders nothing at all when the key is absent — no placeholder, no empty panel', () => {
    // TC-5: the row must be indistinguishable from one that never carried
    // diagnostics. Not "no diagnostics" text, not a greyed badge — nothing.
    const markup = renderToStaticMarkup(<MessageDiagnostics message={message({})} canRead={true} />)

    expect(markup).toBe('')
  })

  it('renders nothing for an explicit false, which the backend never sends', () => {
    // TC-8. The mutant is `!== false`, which would badge every message.
    const markup = renderToStaticMarkup(
      <MessageDiagnostics message={message({ has_debug: false })} canRead={true} />,
    )

    expect(markup).toBe('')
  })

  it('badges an over-budget message that carries no payload (AC-10)', () => {
    // has_debug with no metadata_debug is the 1 MiB-budget case, and it is the
    // message most worth opening. A badge keyed on the payload would hide it.
    const markup = renderToStaticMarkup(
      <MessageDiagnostics message={message({ has_debug: true })} canRead={true} />,
    )

    expect(markup).toContain('Diagnostics')
  })

  it('badges regardless of whether a payload rode along (AC-11)', () => {
    const embedded = renderToStaticMarkup(
      <MessageDiagnostics
        message={message({ has_debug: true, metadata_debug: { model: 'x' } })}
        canRead={true}
      />,
    )

    expect(embedded).toContain('Diagnostics')
  })
})

describe('the panel is collapsed, so nothing is fetched or shown until it is opened (AC-17)', () => {
  it('puts no payload in the initial markup, even when one is embedded', () => {
    // The operator sees that diagnostics exist; they do not see them, and no
    // request was issued to find out.
    const markup = renderToStaticMarkup(
      <MessageDiagnostics
        message={message({ has_debug: true, metadata_debug: { secret_prompt: 'nope' } })}
        canRead={true}
      />,
    )

    expect(markup).not.toContain('secret_prompt')
    expect(markup).not.toContain('<pre')
  })

  it('renders no payload as HTML anywhere (AC-16, AC-27)', () => {
    // React escapes a text child; this asserts the payload never reaches a node
    // that would interpret it, and that nothing offers to move it elsewhere.
    const markup = renderToStaticMarkup(
      <MessageDiagnostics
        message={message({ has_debug: true, metadata_debug: { html: '<img src=x>' } })}
        canRead={true}
      />,
    )

    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('href')
    expect(markup).not.toContain('download')
  })
})

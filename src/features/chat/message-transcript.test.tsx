import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MessageInfo } from '@/api/chat'
import { MessageTranscript } from './message-transcript'

/**
 * A real render, asserted on real markup (ticket z8pmx9mv3w).
 *
 * "Absent from the DOM, not disabled", `dir="auto"` on the text and nowhere
 * else, and "no retry control" are all claims about **output**, so they are
 * asserted on output. There is no jsdom and no React Testing Library here, and
 * adding either would add a dependency to a build that inlines everything into
 * one file — `src/components/shared/can.test.tsx` explains that choice, and
 * `react-dom/server` answers these questions exactly.
 *
 * Unlike `message-diagnostics.test.tsx`, the absence of a `QueryClientProvider`
 * proves nothing here: that component genuinely calls `useQuery`, and this one
 * has no query at all. "No observer per row" is asserted where it can be —
 * `src/lib/source-policy.test.ts`.
 */

/** The fields of a stored message this surface reads; the rest is scaffolding. */
function message(overrides: Partial<MessageInfo>): MessageInfo {
  return {
    id: '3EB0A1B2C3',
    chat_jid: '62811@s.whatsapp.net',
    sender_jid: '62811@s.whatsapp.net',
    content: '',
    timestamp: '2026-09-16T09:30:00Z',
    is_from_me: false,
    media_type: 'audio',
    filename: 'PTT-20260916.ogg',
    url: '',
    file_length: 18_204,
    sent_via: 'whatsapp',
    ...overrides,
  }
}

const TRANSCRIBED = {
  transcript: 'The order shipped on Tuesday.',
  transcript_status: 'done',
  transcript_language: 'en',
}

describe('the transcript is absent, never disabled (AC-7, TC-4)', () => {
  it('renders nothing without the permission, even for a message that carries one', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript message={message(TRANSCRIBED)} canRead={false} />,
    )

    expect(markup).toBe('')
  })

  it('renders nothing disabled anywhere — absence is the whole mechanism', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript message={message(TRANSCRIBED)} canRead={false} />,
    )

    expect(markup).not.toContain('disabled')
  })

  it('leaks no part of the transcript without the permission', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ transcript: 'card ending 4242', transcript_status: 'done' })}
        canRead={false}
      />,
    )

    expect(markup).not.toContain('4242')
    expect(markup).not.toContain('Transcript')
  })
})

describe('a message with no transcript keys is untouched (AC-5, TC-6)', () => {
  it('renders nothing for a plain text message', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ content: 'Thanks, that worked.', media_type: '' })}
        canRead={true}
      />,
    )

    expect(markup).toBe('')
  })

  it('renders nothing for a voice note whose keys were redacted away', () => {
    // No empty block, no dash, no "no transcript" placeholder — the row must be
    // indistinguishable from one that never carried a transcript.
    const markup = renderToStaticMarkup(<MessageTranscript message={message({})} canRead={true} />)

    expect(markup).toBe('')
  })
})

describe('a transcribed voice note reads under its player (AC-11, AC-18, AC-38, TC-1)', () => {
  const markup = renderToStaticMarkup(
    <MessageTranscript message={message(TRANSCRIBED)} canRead={true} />,
  )

  it('renders the transcript text', () => {
    expect(markup).toContain('The order shipped on Tuesday.')
  })

  it('heads the block with an app-authored caption', () => {
    // A voice note often carries no `content`, so without this the bubble's
    // entire visible text would be a machine transcription of a caller's
    // speech — indistinguishable from a message somebody actually typed.
    expect(markup).toContain('Transcript')
  })

  it('labels the language as detected, never as a setting', () => {
    expect(markup).toContain('Detected language: en')
    expect(markup).not.toMatch(/selected|chosen|preferred/i)
  })
})

describe('direction is per-element, and the decoration does not move (AC-20, AC-36, TC-13)', () => {
  it('puts dir="auto" on the text', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript message={message(TRANSCRIBED)} canRead={true} />,
    )

    expect(markup).toContain('dir="auto"')
  })

  it('puts dir on exactly one element, and not on the wrapper', () => {
    // With `dir="auto"` on the wrapper instead, an Arabic transcript's first
    // strong character would resolve the block's start edge and move the caption
    // and the rule to the other side of the bubble — letting transcribed content
    // reposition the marker that identifies it as transcribed content.
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ ...TRANSCRIBED, transcript: 'شكراً، وصل الطلب.' })}
        canRead={true}
      />,
    )

    expect(markup.match(/dir="/g) ?? []).toHaveLength(1)
    // The wrapper is the first element rendered, and it carries the decoration.
    expect(markup).toMatch(/^<div class="[^"]*border-l-2[^"]*"><p/)
  })

  it('sets no dir on a status line, which is this application’s own English', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript message={message({ transcript_status: 'failed' })} canRead={true} />,
    )

    expect(markup).not.toContain('dir="')
  })
})

describe('each status says its own thing, and none offers a retry (AC-12..AC-14, TC-3)', () => {
  function noteMarkup(status: string): string {
    return renderToStaticMarkup(
      <MessageTranscript message={message({ transcript_status: status })} canRead={true} />,
    )
  }

  it('says the transcription is still running for pending, with no spinner', () => {
    const markup = noteMarkup('pending')

    expect(markup).toContain('Still being transcribed')
    expect(markup).not.toContain('animate-spin')
  })

  it('states the failure as a fact and offers no control to retry it', () => {
    const markup = noteMarkup('failed')

    expect(markup).toContain('did not succeed')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('href')
    expect(markup).not.toMatch(/retry|try again/i)
  })

  it('words no_speech differently from failed', () => {
    expect(noteMarkup('no_speech')).toContain('No speech was detected')
    expect(noteMarkup('no_speech')).not.toBe(noteMarkup('failed'))
  })

  it('renders a status line rather than an empty block when there is no text', () => {
    // AC-16: a pending row has no text by definition and must still say so.
    expect(noteMarkup('pending')).not.toBe('')
  })

  it('renders nothing at all for an unrecognised status (AC-15, TC-7)', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ transcript: 'Real text', transcript_status: 'queued' })}
        canRead={true}
      />,
    )

    expect(markup).toBe('')
  })

  it('shows no language label beside a status line (AC-19)', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ transcript_status: 'no_speech', transcript_language: 'ar' })}
        canRead={true}
      />,
    )

    expect(markup).not.toContain('Detected language')
  })
})

describe('the transcript is a text child and nothing else (AC-27)', () => {
  it('renders no markup from a payload that contains some', () => {
    // React escapes a text child; this asserts the transcript never reaches a
    // node that would interpret it.
    //
    // The assertion is on the ESCAPED form rather than on the absence of the
    // word `onerror`: the attribute name survives as literal text, which is the
    // correct outcome — it is the `<` becoming `&lt;` that makes it inert. An
    // assertion that the substring is absent would fail against code that is
    // doing exactly the right thing, and "make the test pass" would then mean
    // weakening the render.
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ transcript: '<img src=x onerror=alert(1)>', transcript_status: 'done' })}
        canRead={true}
      />,
    )

    expect(markup).not.toContain('<img')
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('offers nothing that moves the text elsewhere', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript message={message(TRANSCRIBED)} canRead={true} />,
    )

    expect(markup).not.toContain('href')
    expect(markup).not.toContain('download')
    expect(markup).not.toContain('<a ')
  })

  it('clamps the rendered block rather than growing the bubble (AC-21, AC-28)', () => {
    const markup = renderToStaticMarkup(
      <MessageTranscript
        message={message({ transcript: 'word '.repeat(400), transcript_status: 'done' })}
        canRead={true}
      />,
    )

    expect(markup).toContain('max-h-48')
    expect(markup).toContain('break-words')
  })
})

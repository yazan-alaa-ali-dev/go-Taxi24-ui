import { describe, expect, it } from 'vitest'
import {
  MAX_TRANSCRIPT_LANGUAGE,
  MAX_TRANSCRIPT_RAW,
  MAX_TRANSCRIPT_TEXT,
  TRANSCRIPT_STATUSES,
  transcriptNote,
  transcriptView,
  type TranscriptOf,
} from './transcript'

/**
 * The transcript decisions (ticket z8pmx9mv3w).
 *
 * The cases that matter here are the ones that cannot be reached from a
 * renderer: an absent key against an empty value, a status the reference does
 * not list, and the difference between the two. `../features/chat/
 * message-transcript.test.tsx` asserts what comes out the other end.
 */

/** A redacted message: none of the three keys, which is what masking looks like. */
const REDACTED: TranscriptOf = {}

/** Reads as a payload, not as a literal, so an absent key stays absent. */
function message(fields: TranscriptOf): TranscriptOf {
  return fields
}

describe('the permission decides whether the surface exists at all (AC-6, AC-7, TC-4)', () => {
  it('answers none for a full transcript when the principal may not read it', () => {
    const view = transcriptView(
      message({ transcript: 'Hello there', transcript_status: 'done', transcript_language: 'en' }),
      false,
    )

    expect(view).toEqual({ kind: 'none' })
  })

  it('answers none without the permission for every status, not just done', () => {
    for (const status of TRANSCRIPT_STATUSES) {
      expect(transcriptView(message({ transcript_status: status }), false)).toEqual({
        kind: 'none',
      })
    }
  })
})

describe('the four documented statuses each say their own thing (AC-10..AC-14, TC-3)', () => {
  it('renders the text for done', () => {
    const view = transcriptView(
      message({ transcript: 'The order shipped on Tuesday.', transcript_status: 'done' }),
      true,
    )

    expect(view).toEqual({
      kind: 'text',
      text: 'The order shipped on Tuesday.',
      language: null,
    })
  })

  it('renders a note for pending, failed and no_speech', () => {
    for (const status of ['pending', 'failed', 'no_speech'] as const) {
      expect(transcriptView(message({ transcript_status: status }), true)).toEqual({
        kind: 'note',
        status,
      })
    }
  })

  it('gives the three notes three different sentences', () => {
    // AC-14: no_speech must not read as a failure — that recording was
    // processed successfully and simply had nothing in it.
    const notes = [
      transcriptNote('pending'),
      transcriptNote('failed'),
      transcriptNote('no_speech'),
    ]

    expect(new Set(notes).size).toBe(3)
    for (const note of notes) expect(note.length).toBeGreaterThan(0)
  })

  it('does not promise that a pending transcript will arrive by itself', () => {
    // NFR-2: nothing polls, so wording implying this browser is watching would
    // be a promise the UI cannot keep.
    expect(transcriptNote('pending')).toMatch(/loaded again/)
  })

  it('offers no retry in the failed sentence', () => {
    // AC-13: there is no endpoint to retry with.
    expect(transcriptNote('failed')).not.toMatch(/retry|try again/i)
  })
})

describe('an unrecognised status is neutral, never a failure and never done (AC-15, TC-7)', () => {
  it('answers none for a status outside the closed set', () => {
    expect(transcriptView(message({ transcript_status: 'queued' }), true)).toEqual({ kind: 'none' })
  })

  it('answers none even when the message carries usable text', () => {
    // The fail-closed direction, and the module's documented known failure mode:
    // the server made a statement this UI does not understand, so it declines to
    // interpret the text beside it rather than guessing `done`.
    expect(
      transcriptView(message({ transcript: 'Real text', transcript_status: 'partial' }), true),
    ).toEqual({ kind: 'none' })
  })

  it('answers none for an empty-string status, which is not one of the four', () => {
    expect(transcriptView(message({ transcript: 'Real text', transcript_status: '' }), true)).toEqual(
      { kind: 'none' },
    )
  })
})

describe('an absent key is not an empty transcript and not a failure (AC-17, AC-22, AC-24, TC-5)', () => {
  it('answers none for a fully redacted message', () => {
    expect(transcriptView(REDACTED, true)).toEqual({ kind: 'none' })
  })

  it('answers none for done with no transcript key', () => {
    // The mutant here is a "transcription complete" line above empty space,
    // which announces that a field belongs here and is empty — exactly the
    // distinction §09 deletes by removing the key.
    expect(transcriptView(message({ transcript_status: 'done' }), true)).toEqual({ kind: 'none' })
  })

  it('answers none for done with an empty transcript', () => {
    expect(transcriptView(message({ transcript: '', transcript_status: 'done' }), true)).toEqual({
      kind: 'none',
    })
  })

  it('answers none for done with a whitespace-only transcript', () => {
    expect(
      transcriptView(message({ transcript: '   \n  ', transcript_status: 'done' }), true),
    ).toEqual({ kind: 'none' })
  })

  it('tests the KEY, not the value: undefined at a present key is still not a crash', () => {
    // `transcript: undefined` is a present key with no value — the case a
    // truthiness test collapses with an absent key and with a legitimate empty
    // string. `hasField` is `key in value`, so it answers true here and the
    // typeof guard does the rest.
    const present = { transcript: undefined, transcript_status: 'done' } as TranscriptOf

    expect(transcriptView(present, true)).toEqual({ kind: 'none' })
  })

  it('never reports a failure for an absent key', () => {
    // The specific mutant: `transcript_status === 'done' ? text : 'failed'`,
    // which turns every redacted message into a failed transcription.
    const view = transcriptView(REDACTED, true)

    expect(view.kind).not.toBe('note')
  })
})

describe('a status outranks a partial artefact of the recording (AC-16, AC-34, TC-8, TC-11)', () => {
  it('renders the note for a recognised non-done status with no text', () => {
    expect(transcriptView(message({ transcript_status: 'failed' }), true)).toEqual({
      kind: 'note',
      status: 'failed',
    })
  })

  it('renders the note, not the text, when a non-done status carries text', () => {
    expect(
      transcriptView(message({ transcript: 'half a sen', transcript_status: 'pending' }), true),
    ).toEqual({ kind: 'note', status: 'pending' })
  })

  it('carries no language label on a note', () => {
    // "No speech was detected" beside a detected-language label is a
    // self-contradicting pair, and a contradicting pair teaches the operator to
    // distrust the honest line next to it.
    const view = transcriptView(
      message({ transcript_status: 'no_speech', transcript_language: 'ar' }),
      true,
    )

    expect(view).toEqual({ kind: 'note', status: 'no_speech' })
    expect('language' in view).toBe(false)
  })
})

describe('text with no status key is still text (the mirror case)', () => {
  it('renders the text when the server made no statement about status', () => {
    // Refusing to show a field the principal already holds because a SIBLING key
    // is absent would be the UI inventing a rule the payload does not have.
    expect(transcriptView(message({ transcript: 'Said and done.' }), true)).toEqual({
      kind: 'text',
      text: 'Said and done.',
      language: null,
    })
  })

  it('still answers none when there is no status and no text', () => {
    expect(transcriptView(message({ transcript: '' }), true)).toEqual({ kind: 'none' })
  })
})

describe('the detected language is labelled only when there is a code to label (AC-19, AC-35, TC-12)', () => {
  function languageOf(fields: TranscriptOf): string | null {
    const view = transcriptView(message({ transcript: 'text', ...fields }), true)
    return view.kind === 'text' ? view.language : null
  }

  it('carries the code when the key is present and well formed', () => {
    expect(languageOf({ transcript_language: 'ar' })).toBe('ar')
    expect(languageOf({ transcript_language: 'en-GB' })).toBe('en-GB')
    expect(languageOf({ transcript_language: 'zh-Hant-TW' })).toBe('zh-Hant-TW')
  })

  it('carries null when the key is absent — no label and no default', () => {
    expect(languageOf({})).toBeNull()
  })

  it('carries null for a blank or whitespace-only value', () => {
    expect(languageOf({ transcript_language: '' })).toBeNull()
    expect(languageOf({ transcript_language: '   ' })).toBeNull()
  })

  it('carries null for prose, which is not a code (AC-35)', () => {
    // `displayText` strips and caps; it says nothing about twenty-four
    // characters of arbitrary text arriving where this app's own chrome sits.
    // The same rule an unrecognised status gets: say nothing.
    expect(languageOf({ transcript_language: 'Arabic (detected)' })).toBeNull()
    expect(languageOf({ transcript_language: 'not a language at all' })).toBeNull()
    expect(languageOf({ transcript_language: '../../etc/passwd' })).toBeNull()
  })

  it('carries null for a value that is only long enough to be suspicious', () => {
    expect(languageOf({ transcript_language: 'a'.repeat(MAX_TRANSCRIPT_LANGUAGE + 10) })).toBeNull()
  })
})

describe('server-authored text is stripped, collapsed and capped (AC-26, AC-28, AC-37, TC-9, TC-10)', () => {
  function textOf(transcript: string): string {
    const view = transcriptView(message({ transcript, transcript_status: 'done' }), true)
    return view.kind === 'text' ? view.text : ''
  }

  it('strips a bidi override rather than rendering it', () => {
    // React escapes HTML; it does not neutralise U+202E, which reorders what is
    // printed around it inside a bubble beside real message content.
    expect(textOf('Pay ‭now‮ immediately')).toBe('Pay now immediately')
    expect(textOf('Pay ‮now')).not.toContain('‮')
  })

  it('strips a bidi override from the language label too', () => {
    const view = transcriptView(
      message({ transcript: 'text', transcript_status: 'done', transcript_language: 'a‮r' }),
      true,
    )

    // Stripping leaves `ar`, which is a well-formed code — the point is that the
    // override never survives into a rendered node.
    expect(view.kind === 'text' && view.language).toBe('ar')
  })

  it('turns a newline into a space, never into nothing (AC-37, TC-10)', () => {
    // The regression this guards: `displayText`'s class is [\p{Cc}\p{Cf}]
    // replaced with the EMPTY string, and Cc contains U+000A — so without the
    // collapse in front of it, two sentences are welded into one word.
    expect(textOf('Yes, that worked.\nCall me back.')).toBe('Yes, that worked. Call me back.')
  })

  it('collapses every run of whitespace to a single space', () => {
    expect(textOf('one\t\t two\r\n\n  three')).toBe('one two three')
  })

  it('caps a long transcript and marks the cut', () => {
    const capped = textOf('x'.repeat(MAX_TRANSCRIPT_TEXT + 500))

    expect(capped).toHaveLength(MAX_TRANSCRIPT_TEXT + 1)
    expect(capped.endsWith('…')).toBe(true)
  })

  it('leaves a transcript at exactly the cap unmarked', () => {
    const exact = textOf('x'.repeat(MAX_TRANSCRIPT_TEXT))

    expect(exact).toHaveLength(MAX_TRANSCRIPT_TEXT)
    expect(exact.endsWith('…')).toBe(false)
  })
})

describe('the per-row cost is bounded by a constant, not by the server (AC-39, TC-14)', () => {
  it('reads no more of the raw field than the raw bound', () => {
    // `displayText` replaces and trims the WHOLE value before it slices, so
    // without the bound a 100 000-character transcript costs a 100 000-character
    // regex pass per row per render — and memo() does not save it, because a
    // refetch replaces all thirty message identities at once.
    //
    // **Observing the bound takes care.** The obvious test — a huge input and
    // the same input hand-truncated, asserted equal — passes whether or not the
    // slice is there, because the display cap cuts at 1 500 long before the tail
    // could matter. It is a tautology wearing a test's clothes, and the mutation
    // pass is what exposed it.
    //
    // This input makes the slice *observable* instead: the first
    // MAX_TRANSCRIPT_RAW characters are whitespace, which collapses to one space
    // and is then trimmed to nothing. Bounded, the answer is `none`. Unbounded,
    // the tail survives the collapse and renders. Removing the slice flips the
    // result rather than leaving it alone.
    const leadingWhitespace = ' '.repeat(MAX_TRANSCRIPT_RAW) + 'past the bound'

    expect(
      transcriptView(message({ transcript: leadingWhitespace, transcript_status: 'done' }), true),
    ).toEqual({ kind: 'none' })
  })

  it('keeps the raw bound comfortably above the display cap', () => {
    // Stripping only ever REMOVES characters, so the bound has to leave enough
    // raw material to fill the cap after a plausible strip.
    expect(MAX_TRANSCRIPT_RAW).toBeGreaterThan(MAX_TRANSCRIPT_TEXT)
  })

  it('holds both bounds to an absolute ceiling, not merely to each other', () => {
    // Every other assertion in this file measures the output against
    // MAX_TRANSCRIPT_TEXT, so raising the constant keeps them all passing — the
    // cap could be deleted by being set to ten million and nothing would fail.
    // The mutation pass caught exactly that, so the constant is pinned to a real
    // number here: thirty bubbles share one non-virtualised scroll area whose
    // scroll-to-bottom effect reads `scrollHeight` on every change to the list,
    // and the aggregate is what costs.
    expect(MAX_TRANSCRIPT_TEXT).toBeLessThanOrEqual(4_000)
    expect(MAX_TRANSCRIPT_RAW).toBeLessThanOrEqual(16_000)
  })

  it('caps a fixed enormous input to a fixed small length', () => {
    // Stated without reference to the constant, so it holds even if the constant
    // is changed: 50 000 characters in must not become 50 000 characters out.
    const view = transcriptView(
      message({ transcript: 'x'.repeat(50_000), transcript_status: 'done' }),
      true,
    )

    expect(view.kind === 'text' && view.text.length).toBeLessThanOrEqual(4_001)
  })
})

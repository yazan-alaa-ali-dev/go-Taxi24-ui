import { transcriptNote, transcriptView } from '@/lib/transcript'
import type { MessageInfo } from '@/api/chat'

/**
 * One voice note's transcript, beneath the player that is already on the row.
 *
 * **It calls no permission hook, and it may not.** `canRead` is
 * `messages.transcript.read`, resolved once in `src/pages/chats.tsx` and passed
 * down as a boolean — this component is instantiated per message row, inside a
 * component that holds the composer's `draft`, so a hook here would be one store
 * subscription per message re-evaluated on every keystroke. `message-media.tsx`
 * and `message-diagnostics.tsx` are written the same way for the same reason,
 * and `src/lib/source-policy.test.ts` fails the build if any of them ever opens
 * a subscription of its own.
 *
 * **It calls no hook at all, and not because there is nothing to cache.** A
 * `useMemo` here would be a guaranteed *miss*: the only thing that re-renders
 * this component is a new `message` identity, which is exactly what the memo
 * would key on. `memo()` on the row shields the keystroke path, but a refetch —
 * the post-send invalidation, every debounced search keystroke, the pager, every
 * mount — replaces all thirty message identities at once, so this work runs
 * thirty times whatever we do. The lever is therefore bounding the *input*,
 * which `MAX_TRANSCRIPT_RAW` does, not caching the output.
 *
 * **The `TranscriptView` is computed inside this component and must never become
 * a prop.** It is a fresh object identity per call; hoisting it into
 * `MessageBubble` and passing it down would break that row's `memo()` on all
 * thirty rows at once — the exact failure the bare-boolean prop rule exists to
 * prevent.
 *
 * **Absent, never disabled, and never an empty frame.** Without the permission
 * this renders nothing at all. A message with no transcript renders nothing in
 * its place either — no "no transcript" text, no dash, no empty block. The UI
 * cannot tell "none stored" from "not yours to see", because the backend deletes
 * the keys rather than sending empty ones, and it must not claim either.
 *
 * **There is no retry control, and that is a fact about the backend rather than
 * an omission.** No endpoint exists to ask for a transcription, so a button here
 * would be a control that cannot do anything.
 */
export function MessageTranscript({
  message,
  canRead,
}: {
  message: MessageInfo
  canRead: boolean
}) {
  const view = transcriptView(message, canRead)

  if (view.kind === 'none') return null

  return (
    /*
     * The decoration lives on this wrapper, which carries **no `dir`** and so
     * inherits the application's direction. That separation is the point: with
     * `dir="auto"` on this element instead, the transcript's own first strong
     * character would resolve the block's start edge, and a recording opening
     * with an Arabic word would move the caption and the rule to the other side
     * of the bubble — letting the transcribed content reposition the marker that
     * identifies it as transcribed content.
     *
     * Physical utilities rather than logical ones, deliberately: nothing else in
     * `src/` uses `ps-*`/`border-s-*`, and since the direction is fixed here the
     * logical form would resolve to exactly this anyway.
     */
    <div className="mt-1 border-l-2 pl-2">
      {/* An app-authored label, so a machine transcription of a caller's speech
          can never be the entire visible text of a bubble. A voice note often
          carries no `content`, and without this the row would be indistinguishable
          from a message somebody actually typed — which is a free impersonation
          surface and, more mundanely, an invitation to act on "what the customer
          said" when it is "what the recogniser heard". It renders only when
          something is already being rendered, so it discloses nothing that an
          absent key would have hidden. */}
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        Transcript
      </p>
      {view.kind === 'text' ? (
        <>
          {/* `dir="auto"` on the text and on nothing else: an Arabic transcript
              reads right-to-left inside a row whose chrome does not move. The
              height clamp is the treatment `message-diagnostics.tsx` already
              gives an unbounded payload — thirty bubbles share one
              non-virtualised scroll area whose scroll-to-bottom effect reads
              `scrollHeight` on every change to the list. */}
          <p dir="auto" className="max-h-48 overflow-y-auto text-sm break-words">
            {view.text}
          </p>
          {/* "Detected", never "selected": this is what the recogniser heard,
              not a setting anybody chose. Absent unless the key is present AND
              its value is a well-formed code — see `transcriptLanguage`. */}
          {view.language && (
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              Detected language: {view.language}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-xs">{transcriptNote(view.status)}</p>
      )}
    </div>
  )
}

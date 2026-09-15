import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bug, Loader2 } from 'lucide-react'
import { getMessageDebug } from '@/api/message'
import { Badge } from '@/components/ui/badge'
import { toApiError } from '@/lib/api-error'
import {
  debugPayloadOf,
  diagnosticsFailure,
  diagnosticsSource,
  diagnosticsText,
  showsDiagnosticsBadge,
} from '@/lib/diagnostics'
import type { MessageInfo } from '@/api/chat'

/**
 * One message's stored AI diagnostics: a badge, and the panel behind it.
 *
 * **It calls no permission hook, and it may not.** `canRead` is
 * `messages.debug.read`, resolved once in `src/pages/chats.tsx` and passed down
 * as a boolean — this component is instantiated per message row, inside a
 * component that holds the composer's `draft`, so a hook here would be one store
 * subscription per message re-evaluated on every keystroke. `message-media.tsx`
 * is written the same way for the same reason, and `src/lib/source-policy.test.ts`
 * fails the build if either of them ever opens a subscription of its own.
 *
 * **Absent, never disabled.** Without the permission this renders nothing at
 * all: a disabled badge still announces a capability the principal does not
 * have. And a message with no diagnostics renders nothing in its place either —
 * no "no diagnostics" text, no empty frame. The UI cannot tell "none stored"
 * from "not yours to see", because the backend deletes the key rather than
 * sending `false`, and it must not claim either.
 */
export function MessageDiagnostics({
  message,
  canRead,
}: {
  message: MessageInfo
  canRead: boolean
}) {
  // Declared before the early return: a hook after a conditional return is a
  // rules-of-hooks violation, and `canRead` can change under a mounted row when
  // a refreshed principal comes back with a different permission set.
  const [open, setOpen] = useState(false)

  if (!showsDiagnosticsBadge(message, canRead)) return null

  return (
    <div className="mt-1">
      <Badge asChild variant="outline">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Bug />
          Diagnostics
        </button>
      </Badge>
      {/* The panel is not merely hidden when closed — it is not rendered, so an
          unopened row mounts no query observer at all. A conversation of thirty
          messages therefore issues zero diagnostics requests until the operator
          opens one. */}
      {open && <DiagnosticsPanel message={message} canRead={canRead} />}
    </div>
  )
}

/**
 * The opened panel, and the only place in this ticket that can issue a request.
 *
 * Mounted only while open, which is what makes the guarantee above true, and
 * what lets it read its source exactly once.
 */
function DiagnosticsPanel({ message, canRead }: { message: MessageInfo; canRead: boolean }) {
  /**
   * Read **once**, when the panel opens, and held for its lifetime.
   *
   * Recomputing this per render turns one opt-in flip into one request per open
   * panel: turning the embed off replaces every row with a message carrying no
   * `metadata_debug`, so every open panel would flip from `embedded` to `fetch`
   * in the same instant. Latching it means a request is reachable only by an
   * operator opening a row, which is what the panel is for.
   */
  const [source] = useState(() => diagnosticsSource(message))

  const query = useQuery({
    // Scoped by chat as well as by message, matching the media query beside it:
    // the cache outlives a device switch, and a bare message id is not unique
    // across devices.
    queryKey: ['message-debug', message.id, message.chat_jid],
    queryFn: () => getMessageDebug(message.id),
    // `canRead` belongs here as well as on the badge above, exactly as
    // `message-media.tsx` writes `enabled: open && canDownload`. A hidden
    // control whose request still fires manufactures the refusal the guard
    // existed to spare the user — and this line is the only executable guard a
    // test suite with no renderer can put on "no debug request without the
    // permission".
    enabled: canRead && source.kind === 'fetch',
    // Never refetched while the panel is open: this payload is a stored record
    // of something that already happened, not live state.
    staleTime: Infinity,
    // The client default keeps an unobserved query for five minutes. This one
    // holds arbitrary server-authored diagnostics of unknown sensitivity, so it
    // follows the precedent `webhook-dialog.tsx` set for an entry holding a
    // signing secret: long enough to survive a re-open, short enough that a
    // closed panel does not leave the payload in memory for an idle session.
    gcTime: 60_000,
    retry: false,
  })

  // Formatting is a full stringify of a payload with no size contract, and the
  // message list re-renders whenever the conversation refetches — so it is
  // computed on the payload's identity rather than on every render.
  const text = useMemo(
    () =>
      diagnosticsText(
        source.kind === 'embedded' ? source.payload : payloadValue(debugPayloadOf(query.data)),
      ),
    [source, query.data],
  )

  if (query.isLoading) {
    return <Loader2 className="text-muted-foreground mt-1 size-4 animate-spin" />
  }

  if (query.isError) {
    // The one error path in this surface: the operator explicitly asked for this
    // payload and the request failed. It is never built from a missing key.
    return (
      <p className="text-destructive mt-1 text-xs">{diagnosticsFailure(toApiError(query.error))}</p>
    )
  }

  // Nothing to show is shown as nothing — no frame, no border, no placeholder.
  // An empty box would announce that a field belongs here and is empty, which is
  // precisely the distinction the backend deletes by removing the key.
  if (!text) return null

  return (
    <pre
      dir="ltr"
      className="bg-background text-muted-foreground mt-1 max-h-64 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap"
    >
      {text}
    </pre>
  )
}

/** `none` and "an embedded payload that is genuinely `undefined`" format alike. */
function payloadValue(diagnostics: ReturnType<typeof debugPayloadOf>): unknown {
  return diagnostics.kind === 'payload' ? diagnostics.value : undefined
}

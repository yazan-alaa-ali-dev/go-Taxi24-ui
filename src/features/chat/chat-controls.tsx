import { memo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Bug, MoreVertical, Pin, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { archiveChat, pinChat, setDisappearing, type ChatInfo } from '@/api/chat'
import { AgentDebugDialog } from '@/features/chat/agent-debug-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toApiError } from '@/lib/api-error'
import { debugToggleTarget } from '@/lib/agent-debug'

const DISAPPEARING_OPTIONS: { label: string; seconds: number }[] = [
  { label: 'Off', seconds: 0 },
  { label: '24 hours', seconds: 86_400 },
  { label: '7 days', seconds: 604_800 },
  { label: '90 days', seconds: 7_776_000 },
]

/**
 * The per-conversation actions menu, and the two permissions that fill it.
 *
 * **It decides its own absence.** Until z8pmx9mw2x this component was rendered
 * behind `{mayWriteChats && …}` at its call site, which was fine while
 * `chats.write` was the only reason to open it. It is not any more: an
 * administrator may hold `admin.debug.toggle` and *not* `chats.write` — those are
 * independent permissions, and a permission set is never derived from a role name
 * — and gating the whole menu on one of them would hide the other. So the call
 * site renders it unconditionally, each group is gated separately below, and the
 * component returns `null` when it has nothing to offer. That is also the only
 * shape this repository's renderless test suite can assert: `renderToStaticMarkup`
 * is `''` or it is not. `message-diagnostics.tsx` owns its absence for the same
 * reason.
 *
 * **Memoised, and that is load-bearing rather than tidy.** It now mounts for
 * every principal, inside `MessageView`, which holds the composer's `draft` — so
 * without this, every keystroke re-rendered the whole menu tree and re-allocated
 * the four closures the disappearing list builds. `chat` is `selected`, a
 * `useState` object whose identity is stable between renders, and the other two
 * props are bare booleans: the comparison holds, exactly as `MessageBubble`'s
 * does.
 *
 * **It calls no permission hook, and may not.** Both booleans are resolved once
 * in `src/pages/chats.tsx`; `src/lib/source-policy.test.ts` lists this file among
 * the ones that may not open a subscription of their own.
 */
export const ChatControls = memo(function ChatControls({
  chat,
  mayWriteChats,
  mayToggleDebug,
}: {
  chat: ChatInfo
  mayWriteChats: boolean
  mayToggleDebug: boolean
}) {
  const queryClient = useQueryClient()
  const [intent, setIntent] = useState<'on' | 'off' | null>(null)

  /**
   * The number the diagnostics items would act on, or `null`.
   *
   * Both authorities in one call: the permission, and whether this conversation
   * has a phone number behind it at all. A group, a newsletter,
   * `status@broadcast` and a `@lid` all answer `null`, and the items are then
   * absent rather than disabled — a disabled item would announce a capability
   * that cannot exist for this chat.
   *
   * Uncached deliberately: one `indexOf`, one `slice`, one `split` and a short
   * regex is cheaper than the `useMemo` bookkeeping that would wrap it.
   */
  const debugPhone = debugToggleTarget(chat.jid, mayToggleDebug)

  if (!mayWriteChats && !debugPhone) return null

  const run = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action()
      toast.success(label)
      void queryClient.invalidateQueries({ queryKey: ['chats'] })
    } catch (error) {
      toast.error(toApiError(error).message)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Chat actions">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {mayWriteChats && (
            <>
              <DropdownMenuItem onClick={() => run('Chat pinned', () => pinChat(chat.jid, true))}>
                <Pin className="size-4" /> Pin
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => run('Chat unpinned', () => pinChat(chat.jid, false))}>
                <Pin className="size-4" /> Unpin
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  run(chat.archived ? 'Chat unarchived' : 'Chat archived', () =>
                    archiveChat(chat.jid, !chat.archived),
                  )
                }
              >
                <Archive className="size-4" /> {chat.archived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2">
                <Timer className="size-4" /> Disappearing
              </DropdownMenuLabel>
              {DISAPPEARING_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.seconds}
                  onClick={() =>
                    run(`Disappearing set: ${option.label}`, () =>
                      setDisappearing(chat.jid, option.seconds),
                    )
                  }
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </>
          )}

          {/* Only when both groups are present — otherwise a principal holding
              admin.debug.toggle alone gets a menu whose first child is a rule. */}
          {mayWriteChats && debugPhone && <DropdownMenuSeparator />}

          {/* Two explicitly-labelled outcomes, never one switch. There is no
              endpoint that reads whether collection is currently on, so a switch
              position would be a claim this app cannot support and its change
              handler would send an `enabled` inferred from that claim. The word
              the operator reads is the word that travels. */}
          {debugPhone && (
            <>
              <DropdownMenuLabel className="flex items-center gap-2">
                <Bug className="size-4" /> AI diagnostics collection
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setIntent('on')}>Turn collection on</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIntent('off')}>
                Turn collection off
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Not merely hidden when closed — not rendered, so nothing mounts a
          mutation observer until an operator opens it. */}
      {debugPhone && intent && (
        <AgentDebugDialog phone={debugPhone} intent={intent} onClose={() => setIntent(null)} />
      )}
    </>
  )
})

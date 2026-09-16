import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { ChatInfo } from '@/api/chat'
import { ChatControls } from './chat-controls'

/**
 * "Absent, never disabled" is a claim about **output**, so it is asserted on
 * output (ticket z8pmx9mw2x).
 *
 * There is no jsdom and no React Testing Library here, and adding either would
 * add a dependency to a build that inlines everything into one file —
 * `src/components/shared/can.test.tsx` explains that choice, and
 * `react-dom/server` answers this particular question exactly.
 *
 * **A `QueryClientProvider` is required here, and its presence is not an
 * oversight.** `message-diagnostics.test.tsx` renders with *no* provider on
 * purpose, because `useQuery` outside one throws and a clean render is therefore
 * proof that no observer was mounted. That reasoning does not transfer:
 * `ChatControls` calls `useQueryClient()` above its early return — it has since
 * before this ticket, for the pin/archive invalidation — so without a provider
 * every case below would throw rather than assert. The provider is scaffolding,
 * not a claim.
 *
 * **What this file can and cannot reach.** Radix renders `DropdownMenuContent`
 * through a portal and only while the menu is open, so the individual items are
 * out of reach of a server render: this file proves the **whole menu's** absence
 * and presence, and nothing about which items are inside it. The items' guard is
 * `debugToggleTarget`, which is unit-tested in `src/lib/agent-debug.test.ts`, and
 * `src/lib/source-policy.test.ts` asserts that it is the guard actually used.
 */

function chat(overrides: Partial<ChatInfo> = {}): ChatInfo {
  return {
    jid: '963938113282@s.whatsapp.net',
    name: 'A customer',
    last_message_time: '2026-09-16T09:30:00Z',
    ephemeral_expiration: 0,
    created_at: '2026-09-01T09:30:00Z',
    updated_at: '2026-09-16T09:30:00Z',
    archived: false,
    ...overrides,
  }
}

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  )
}

describe('the menu decides its own absence (AC-6, TC-5, TC-6)', () => {
  it('renders nothing at all for a principal holding neither permission', () => {
    const markup = render(
      <ChatControls chat={chat()} mayWriteChats={false} mayToggleDebug={false} />,
    )

    expect(markup).toBe('')
  })

  it('renders nothing disabled — absence is the whole mechanism', () => {
    // A disabled menu still announces that the capability exists, which is
    // precisely what hiding it spares the principal.
    const markup = render(
      <ChatControls chat={chat()} mayWriteChats={false} mayToggleDebug={false} />,
    )

    expect(markup).not.toContain('disabled')
    expect(markup).not.toContain('Chat actions')
  })

  it('renders for chats.write alone, exactly as it did before this ticket', () => {
    const markup = render(
      <ChatControls chat={chat()} mayWriteChats={true} mayToggleDebug={false} />,
    )

    expect(markup).toContain('Chat actions')
  })

  it('renders for admin.debug.toggle alone — the two permissions are independent', () => {
    // This is the case the previous call site could not express: it gated the
    // whole menu on `chats.write`, so an administrator holding the toggle
    // permission and not that one had nowhere for the item to live.
    const markup = render(
      <ChatControls chat={chat()} mayWriteChats={false} mayToggleDebug={true} />,
    )

    expect(markup).toContain('Chat actions')
  })

  it('renders nothing for a chat with no number behind it, permission or not', () => {
    // A group has no phone number, so `admin.debug.toggle` alone buys nothing
    // here and the menu has nothing left to offer.
    for (const jid of ['120363001@g.us', '120363001@newsletter', 'status@broadcast', '9876@lid']) {
      const markup = render(
        <ChatControls chat={chat({ jid })} mayWriteChats={false} mayToggleDebug={true} />,
      )
      expect(markup, jid).toBe('')
    }
  })

  it('leaves the chats.write menu untouched for a chat with no number', () => {
    // The regression this ticket must not cause: pin, archive and disappearing
    // are about the chat, not about a phone number.
    const markup = render(
      <ChatControls chat={chat({ jid: '120363001@g.us' })} mayWriteChats={true} mayToggleDebug={true} />,
    )

    expect(markup).toContain('Chat actions')
  })

  it('mounts no dialog until an operator opens one', () => {
    // The dialog holds the mutation. Rendering it unopened would put a mutation
    // observer on screen for every conversation a principal looks at.
    const markup = render(
      <ChatControls chat={chat()} mayWriteChats={true} mayToggleDebug={true} />,
    )

    expect(markup).not.toContain('Turn collection on')
    expect(markup).not.toContain('963938113282')
  })
})

import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, TriangleAlert } from 'lucide-react'
import { toggleAgentDebug, type TtlField } from '@/api/agent'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toApiError } from '@/lib/api-error'
import {
  expiryAt,
  expiryDelay,
  parseTtl,
  toggleFailure,
  toggleReport,
  toggleSummary,
  TTL_PRESETS,
} from '@/lib/agent-debug'
import { formatDate } from '@/lib/format'

/**
 * Turning the AI agent's diagnostics collection on or off for one number.
 *
 * **An action, not a settings switch — and the shape is the argument.** There is
 * no endpoint that reads whether collection is currently on for a number, so a
 * `<Switch>` here would be a control whose position is a claim this application
 * cannot support, and whose change handler would send an `enabled` inferred from
 * that claim. Instead the menu above offers two separately-labelled items, each
 * carrying its own literal `enabled`, and this dialog confirms the one the
 * operator chose. The word they read is the word that travels.
 *
 * **It latches its target when it opens.** `phone` is derived from the open
 * conversation's JID, and the promise this dialog makes is that the number on
 * screen is the number sent. Latching makes that true by construction rather
 * than by depending on `key={selected.jid}` in `src/pages/chats.tsx` remounting
 * the subtree — the same latch `message-diagnostics.tsx` uses for its source,
 * for the same reason.
 *
 * **It calls no permission hook.** `admin.debug.toggle` is resolved once in
 * `src/pages/chats.tsx` and travels down as a boolean; by the time this
 * component exists the answer is already yes. `src/lib/source-policy.test.ts`
 * fails the build if this file ever opens a subscription of its own.
 *
 * **Nothing is invalidated and nothing is retried.** A toggle changes nothing
 * about the conversation, its messages or the chat list, so no query cache is
 * touched; and `retry: false` means TanStack cannot re-send a refused call by
 * itself. Every retry in this file is a button an operator presses.
 */
export function AgentDebugDialog({
  phone,
  intent,
  onClose,
}: {
  phone: string
  intent: 'on' | 'off'
  onClose: () => void
}) {
  // Read once, held for the dialog's life. See the header.
  const [target] = useState(() => phone)
  const [ttl, setTtl] = useState('')
  const [ttlError, setTtlError] = useState<string | null>(null)

  const enabled = intent === 'on'

  // `TtlField` has no arm for a bare number, so the body cannot carry a duration
  // `parseTtl` did not produce — a hand-rolled `+ttl` here would not compile.
  const toggle = useMutation({
    mutationFn: (ttlField: TtlField) => toggleAgentDebug({ phone: target, enabled, ttl: ttlField }),
    retry: false,
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (toggle.isPending) return
    // Switching off takes no duration, so the field is not rendered and not read
    // — a window is meaningless when the answer is "stop collecting".
    const parsed = enabled ? parseTtl(ttl) : ({ kind: 'omit' } as const)
    if (parsed.kind === 'error') {
      // No request is built and none leaves: the server would answer 400 for
      // exactly these values, and agreeing with it here costs the operator one
      // round trip less.
      setTtlError(parsed.message)
      return
    }
    setTtlError(null)
    toggle.mutate(parsed)
  }

  const report = toggle.isSuccess
    ? toggleReport({ phone: target, enabled }, toggle.data)
    : null
  const failure = toggle.isError ? toggleFailure(toApiError(toggle.error)) : null

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Ignored while a request is in flight: an audited action whose outcome
        // the operator never sees is worse than a dialog they have to wait on.
        if (!next && !toggle.isPending) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {enabled ? 'Turn diagnostics collection on' : 'Turn diagnostics collection off'}
          </DialogTitle>
          {/* The exact string that will be transmitted, in the exact form — so
              the operator sees what the request targets before confirming. */}
          <DialogDescription className="font-mono">{target}</DialogDescription>
        </DialogHeader>

        {report ? (
          <SuccessNotice report={report} onClose={onClose} />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            {enabled ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent-debug-ttl">Duration (minutes)</Label>
                <div className="flex flex-wrap gap-2">
                  {TTL_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={ttl === String(preset) ? 'default' : 'outline'}
                      onClick={() => {
                        setTtl(String(preset))
                        setTtlError(null)
                      }}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <Input
                  id="agent-debug-ttl"
                  inputMode="numeric"
                  placeholder="Leave empty for the agent's own default"
                  value={ttl}
                  onChange={(event) => {
                    setTtl(event.target.value)
                    setTtlError(null)
                  }}
                  aria-invalid={ttlError !== null}
                />
                {ttlError && <p className="text-destructive text-xs">{ttlError}</p>}
                <p className="text-muted-foreground text-xs">
                  How long the AI agent keeps collecting. Leave it empty to use whatever default
                  the agent is configured with.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Collection stops for this number. No duration applies.
              </p>
            )}

            <p className="text-muted-foreground text-xs">
              This dashboard cannot read back whether collection is currently on — the AI agent
              owns that state and exposes no way to ask. What you see here is the outcome of this
              action and nothing more.
            </p>

            {failure && (
              <div className="border-destructive/50 flex flex-col gap-2 rounded-lg border p-3 text-xs">
                <p className="text-destructive flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{failure.message}</span>
                </p>
                {/* Stated rather than implied. "The outcome is unknown" is the
                    one thing an operator must not have to infer from wording. */}
                <p className="text-muted-foreground">
                  {failure.applied === 'no'
                    ? 'Nothing about this number changed.'
                    : 'This dashboard cannot tell whether the change took effect.'}
                </p>
              </div>
            )}

            {/* One submit control, and it is absent entirely for a failure the
                operator cannot act on from here — a device that is not selected
                and a server with no agent integration are both fixed somewhere
                else, and inviting a retry would be inviting the same refusal.
                Disabled while a request is in flight, so one decision is one
                request however slow the connection. */}
            <DialogFooter>
              {(!failure || failure.offersRetry) && (
                <Button type="submit" disabled={toggle.isPending}>
                  {toggle.isPending && <Loader2 className="size-4 animate-spin" />}
                  {failure ? 'Try again' : enabled ? 'Turn collection on' : 'Turn collection off'}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * What a `200` reported, and the moment that report stops meaning anything.
 *
 * The expiry is a **cache**: the agent owns the state, nothing reads it back,
 * and once the reported instant passes this dashboard knows nothing about the
 * number again. So when the timer fires the *whole* claim is withdrawn, not just
 * the timestamp — "collection is on" beside a window that has demonstrably
 * closed is precisely the persistent-state claim this surface may not make.
 *
 * Nothing here is written to storage; a reload makes no claim about any number.
 */
function SuccessNotice({
  report,
  onClose,
}: {
  report: ReturnType<typeof toggleReport>
  onClose: () => void
}) {
  const at = expiryAt(report.expiresAt)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    // `null` when there is nothing to forget — absent, unparseable, already
    // past, or further out than setTimeout can hold without overflowing and
    // firing at once. Keyed on the instant and cleared on change, so a second
    // toggle in the same dialog cannot leave two timers racing.
    const delay = expiryDelay(report.expiresAt)
    if (delay === null) return
    const timer = window.setTimeout(() => setExpired(true), delay)
    return () => window.clearTimeout(timer)
  }, [report.expiresAt])

  return (
    <div className="flex flex-col gap-3">
      {expired ? (
        <p className="text-sm">
          The window the agent reported for {report.phone} has passed. This dashboard cannot read
          the current state, so it makes no claim about this number.
        </p>
      ) : (
        <>
          <p className="text-sm">{toggleSummary(report)}</p>
          {at !== null && (
            <p className="text-muted-foreground text-xs">
              The agent reported this lasting until {formatDate(new Date(at).toISOString())}. That
              is what it said at the time, not a state read back — treat it as expired once it
              passes.
            </p>
          )}
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  )
}

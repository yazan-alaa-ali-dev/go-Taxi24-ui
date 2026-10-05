import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getDeviceWebhook, setDeviceWebhookEnabled, updateDeviceWebhook } from '@/api/devices'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useHasPermission } from '@/hooks/use-permissions'
import {
  AUTH_MODE_LABELS,
  CLEARS_WEBHOOK_WARNING,
  DISABLED_MEANS,
  EFFECTIVE_UNKNOWN,
  ENABLING_RESUMES,
  INSECURE_SKIP_VERIFY_MEANS,
  WEBHOOK_EVENTS,
  WEBHOOK_SAVE_FAILED_REDACTED,
  authModeFrom,
  effectiveAuthFrom,
  inheritedPlainWarning,
  parseWebhookEvents,
  plainWarning,
  serializeWebhookEvents,
  webhookEnabledFrom,
  webhookFieldsDiffer,
  webhookFieldsFrom,
  webhookFormEdited,
  webhookFormErrors,
  webhookPayloadFrom,
  webhookSaveEffect,
  webhookSaveFailure,
  webhookUrlNotice,
  type WebhookAuthMode,
  type WebhookFields,
} from '@/lib/device-webhook'
import { toActionErrorMessage } from '@/lib/auth-messages'
import { PERMISSIONS } from '@/lib/permissions'
import { deviceWebhookKey } from '@/lib/query-keys'

const AUTH_MODES: WebhookAuthMode[] = ['inherit', 'signed', 'plain']

/**
 * One device's webhook: where its events go, whether they go at all, and how
 * the receiver can tell they came from us.
 *
 * **Stopping delivery and removing the configuration are different operations,
 * and this dialog exists in its corrected form because the product conflated
 * them.** Its previous description told the operator to "leave the URL empty
 * and save to disable the webhook", which is the one thing the reference
 * explicitly warns against: emptying `webhook_url` is a **deletion** — the URL,
 * the secret and the event list are erased, and the device's events then fall
 * back to the deployment-wide webhook list, so they keep going out, to an
 * endpoint nobody chose for this customer. The switch below is what stops
 * delivery, and it keeps everything.
 *
 * **The stored secret is never rendered.** It is a credential for the
 * customer's endpoint, and this dialog is reachable from every account device
 * row, including by a viewer holding only `devices.webhook.read`. So the panel
 * says whether a secret is *set* and offers to replace it; the stored value
 * stays in state, travels back in the payload so an unrelated save cannot
 * destroy it, and reaches no DOM node, no toast and no error message.
 *
 * **The form is filled once per open and never overwritten under an edit.**
 * Another operator's save reaches this dialog through the WebSocket; it is
 * applied silently when nothing here was changed, and announced — with Save
 * held until the operator reloads — when something was. Saving a stale form
 * would otherwise put back a secret that was just rotated elsewhere. Every
 * decision behind that is in `@/lib/device-webhook`, where it is tested.
 *
 * Identified by id rather than by a `RegistryDevice`, because an account device
 * row may have no registry entry at all and manufacturing one would be the
 * invented row the account devices surface refuses.
 */
export function DeviceWebhookDialog({
  deviceId,
  deviceName,
  open,
  onOpenChange,
}: {
  deviceId: string
  deviceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  // Disabling the controls is an affordance and never enforcement: the server
  // refuses the write regardless. What it buys is that a viewer is not offered a
  // form whose only outcome is a 403.
  const mayWrite = useHasPermission(PERMISSIONS.DEVICES_WEBHOOK_WRITE)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [replacementSecret, setReplacementSecret] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [unknownEvents, setUnknownEvents] = useState<string[]>([])
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false)
  const [headerName, setHeaderName] = useState('')
  const [mode, setMode] = useState<WebhookAuthMode>('inherit')
  // What the form was filled from. `null` until this open's first read settles.
  const [seed, setSeed] = useState<WebhookFields | null>(null)
  const [changedElsewhere, setChangedElsewhere] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const config = useQuery({
    queryKey: deviceWebhookKey(deviceId),
    queryFn: () => getDeviceWebhook(deviceId),
    enabled: open,
    // This entry holds a secret. The client default keeps an unobserved query
    // for five minutes; a minute is long enough to survive a re-open and short
    // enough that a closed dialog does not leave a credential in memory for an
    // idle session.
    gcTime: 60_000,
  })

  const events = serializeWebhookEvents(selectedEvents, unknownEvents)
  const edited =
    seed !== null &&
    webhookFormEdited(seed, {
      url,
      events,
      insecureSkipVerify,
      headerName,
      replacementSecret,
      mode,
    })

  const fill = (fields: WebhookFields) => {
    const parsed = parseWebhookEvents(fields.events)
    setUrl(fields.url)
    setSecret(fields.secret)
    setReplacementSecret('')
    setSelectedEvents(parsed.selected)
    setUnknownEvents(parsed.unknown)
    setInsecureSkipVerify(fields.insecureSkipVerify)
    setHeaderName(fields.headerName)
    setMode(authModeFrom(fields.sign))
    setSeed(fields)
    setChangedElsewhere(false)
    setConfirmingClear(false)
  }

  useEffect(() => {
    // Only a settled read counts. Seeding from a cached copy while its refetch
    // is in flight would fill the form with what may be the pre-save state and
    // then announce the operator's own save as somebody else's change.
    if (!open || !config.data || config.isFetching) return
    const next = webhookFieldsFrom(config.data)
    if (seed === null || (!edited && webhookFieldsDiffer(seed, next))) {
      fill(next)
    } else {
      // Equal on every form field — the dialog's own delivery toggle, or an
      // echo of nothing — is not a change; a difference under an edit is.
      setChangedElsewhere(webhookFieldsDiffer(seed, next))
    }
    // `fill` and `edited` are derived each render; the trigger is a new read.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config.data, config.isFetching])

  useEffect(() => {
    // A closed dialog holds no secret. The query's own gcTime covers the cache;
    // this covers component state, which otherwise survives until the parent
    // unmounts — the seed included, since it carries the stored secret.
    if (!open) {
      setSecret('')
      setReplacementSecret('')
      setSeed(null)
      setChangedElsewhere(false)
      setConfirmingClear(false)
      setFailure(null)
    }
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      updateDeviceWebhook(
        deviceId,
        webhookPayloadFrom({
          url,
          // The replacement when one was typed, otherwise the stored value
          // travelling back unchanged. The reference does not say what an
          // omitted `webhook_secret` does to the stored one, and guessing "it is
          // kept" would silently destroy a customer's secret on every unrelated
          // save if the guess were wrong.
          secret: replacementSecret === '' ? secret : replacementSecret,
          events,
          insecureSkipVerify,
          headerName,
          mode,
        }),
      ),
    onSuccess: () => {
      toast.success(`Webhook updated for ${deviceId}`)
      void queryClient.invalidateQueries({ queryKey: deviceWebhookKey(deviceId) })
      onOpenChange(false)
    },
    // Never `toApiError(error).message`: this request carried the secret and a
    // 4xx rejecting it may quote the field it rejected.
    onError: (error) =>
      setFailure(
        webhookSaveFailure(error) === 'redacted'
          ? WEBHOOK_SAVE_FAILED_REDACTED
          : toActionErrorMessage(error),
      ),
  })

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setDeviceWebhookEnabled(deviceId, enabled),
    onSuccess: (state) => {
      toast.success(
        state.webhook_enabled
          ? `Webhook delivery resumed for ${state.device_id}`
          : `Webhook delivery stopped for ${state.device_id}`,
      )
      void queryClient.invalidateQueries({ queryKey: deviceWebhookKey(deviceId) })
    },
    // This request carries no secret, so the server's own text is safe to show.
    onError: (error) => setFailure(toActionErrorMessage(error)),
  })

  const secretToSend = replacementSecret === '' ? secret : replacementSecret
  const errors = webhookFormErrors({
    url,
    headerName,
    mode,
    replacementSecret,
    storedSecret: secret,
  })
  const invalid = errors.headerName !== null || errors.secret !== null || errors.auth !== null

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFailure(null)
    // The same values the inline messages render, so what is shown and what is
    // refused cannot disagree.
    if (invalid || changedElsewhere) return
    // An empty URL is a deletion, and the operator is told what it destroys
    // before it happens. Both the warning and the request read the same
    // function, so they cannot describe different outcomes.
    if (webhookSaveEffect(url) === 'clear' && !confirmingClear) {
      setConfirmingClear(true)
      return
    }
    save.mutate()
  }

  const toggleEvent = (name: string, checked: boolean) =>
    setSelectedEvents((current) =>
      checked ? [...current, name] : current.filter((event) => event !== name),
    )

  const delivery = config.data ? webhookEnabledFrom(config.data) : null
  const effective = config.data ? effectiveAuthFrom(config.data) : null
  const urlNotice = webhookUrlNotice(url)
  const clearing = webhookSaveEffect(url) === 'clear'
  const plainNotice = plainWarning(mode, url)
  const inheritedPlainNotice = inheritedPlainWarning(mode, effective, secretToSend)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Webhook for {deviceName || deviceId}</DialogTitle>
          <DialogDescription>
            Events from this device are POSTed to the URL below. Stopping delivery and removing the
            configuration are two different things — see each control.
          </DialogDescription>
        </DialogHeader>
        {config.error && !config.data ? (
          <p className="text-destructive text-sm">{toActionErrorMessage(config.error)}</p>
        ) : seed === null ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Rendered only once the read has resolved. Binding a switch to a
                default while `config.data` is undefined would show a disabled
                webhook as "on" for the length of the load — on the one screen
                that exists to stop exactly that confusion. */}
            {delivery && (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="device-webhook-enabled" className="font-medium">
                    Deliver events to this webhook
                    {!delivery.reported && (
                      <span className="text-muted-foreground ml-1 font-normal">
                        (reported on — this server did not send the switch state)
                      </span>
                    )}
                  </Label>
                  <Switch
                    id="device-webhook-enabled"
                    checked={delivery.enabled}
                    disabled={!mayWrite || toggle.isPending}
                    onCheckedChange={(next) => {
                      setFailure(null)
                      toggle.mutate(next)
                    }}
                  />
                </div>
                <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-xs">
                  {DISABLED_MEANS.map((consequence) => (
                    <li key={consequence}>{consequence}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-xs">{ENABLING_RESUMES}</p>
              </div>
            )}

            {changedElsewhere && (
              <div className="border-destructive text-destructive flex flex-col gap-2 rounded-lg border p-3 text-xs">
                <p>
                  This webhook was changed elsewhere while you were editing. Saving now would
                  overwrite that change — including a secret that may just have been replaced — so
                  saving is held until you reload. Reloading discards your edits here.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => config.data && fill(webhookFieldsFrom(config.data))}
                >
                  Reload the current configuration
                </Button>
              </div>
            )}

            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="device-webhook-url">Webhook URL</Label>
                <Input
                  id="device-webhook-url"
                  placeholder="https://example.com/webhook"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setConfirmingClear(false)
                  }}
                  readOnly={!mayWrite}
                />
                {urlNotice && <p className="text-destructive text-xs">{urlNotice}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="device-webhook-new-secret">Secret</Label>
                {/* The stored value is never rendered — only whether there is
                    one. It stays in state and travels back in the payload. */}
                <p className="text-muted-foreground text-xs">
                  {secret
                    ? 'A secret is set for this device. It is not shown here: the server never needs to display it, and this panel is open to anyone who may read this device’s webhook.'
                    : 'No secret is set for this device. Under Inherit, the deployment-wide secret applies if the server has one.'}
                </p>
                {mayWrite && (
                  <>
                    <Input
                      id="device-webhook-new-secret"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={secret ? 'type a new one to replace it' : 'optional'}
                      value={replacementSecret}
                      onChange={(event) => setReplacementSecret(event.target.value)}
                      aria-invalid={errors.secret !== null}
                    />
                    <p className="text-muted-foreground text-xs">
                      Signed mode uses it as the HMAC key; Plain mode sends it as the header value.
                      Leave this empty to keep the one already stored. Copy a new value now — it is
                      not shown again.
                    </p>
                  </>
                )}
                {errors.secret && <p className="text-destructive text-xs">{errors.secret}</p>}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Authentication</p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="device-webhook-mode">Mode</Label>
                  <Select
                    value={mode}
                    onValueChange={(next) => setMode(next as WebhookAuthMode)}
                    disabled={!mayWrite}
                  >
                    <SelectTrigger id="device-webhook-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTH_MODES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {AUTH_MODE_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.auth && <p className="text-destructive text-xs">{errors.auth}</p>}
                  {plainNotice && <p className="text-destructive text-xs">{plainNotice}</p>}
                  {inheritedPlainNotice && (
                    <p className="text-destructive text-xs">{inheritedPlainNotice}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="device-webhook-header">Header name</Label>
                  <Input
                    id="device-webhook-header"
                    placeholder="empty inherits the server default"
                    autoComplete="off"
                    spellCheck={false}
                    value={headerName}
                    onChange={(event) => setHeaderName(event.target.value)}
                    readOnly={!mayWrite}
                    aria-invalid={errors.headerName !== null}
                  />
                  {errors.headerName && (
                    <p className="text-destructive text-xs">{errors.headerName}</p>
                  )}
                </div>

                {/* What the server says it will send, after inheritance. Never
                    filled in from a guessed default. */}
                <p className="text-muted-foreground text-xs">
                  {effective ? (
                    <>
                      Currently sent: header{' '}
                      <span className="text-foreground font-mono">{effective.headerName}</span>,{' '}
                      {effective.mode === 'signed'
                        ? 'signed (sha256= HMAC of the body)'
                        : 'plain (the secret verbatim)'}
                      . This reflects the last saved configuration.
                    </>
                  ) : (
                    EFFECTIVE_UNKNOWN
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Events</p>
                <p className="text-muted-foreground text-xs">
                  Leave every box unticked to forward all events.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WEBHOOK_EVENTS.map((event) => {
                    const id = `device-webhook-event-${event.name}`
                    return (
                      <div key={event.name} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={selectedEvents.includes(event.name)}
                          disabled={!mayWrite}
                          onCheckedChange={(checked) => toggleEvent(event.name, checked === true)}
                        />
                        <Label htmlFor={id} className="flex flex-col items-start gap-0 font-normal">
                          <span className="font-mono text-xs">{event.name}</span>
                          <span className="text-muted-foreground text-xs">{event.description}</span>
                        </Label>
                      </div>
                    )
                  })}
                </div>
                {unknownEvents.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Also kept, as stored (not in this list):{' '}
                    <span className="font-mono">{unknownEvents.join(', ')}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="device-webhook-skip-verify" className="font-normal">
                    Skip TLS certificate verification (insecure)
                  </Label>
                  <Switch
                    id="device-webhook-skip-verify"
                    checked={insecureSkipVerify}
                    disabled={!mayWrite}
                    onCheckedChange={setInsecureSkipVerify}
                  />
                </div>
                <p className="text-muted-foreground text-xs">{INSECURE_SKIP_VERIFY_MEANS}</p>
              </div>

              {confirmingClear && (
                <div className="border-destructive text-destructive flex gap-2 rounded-lg border p-3 text-xs">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{CLEARS_WEBHOOK_WARNING}</p>
                </div>
              )}

              {failure && (
                <div className="border-destructive/50 text-destructive rounded-lg border p-3 text-xs">
                  {failure}
                </div>
              )}

              {mayWrite ? (
                <DialogFooter>
                  <Button
                    type="submit"
                    variant={confirmingClear ? 'destructive' : 'default'}
                    disabled={save.isPending || invalid || changedElsewhere}
                  >
                    {save.isPending && <Loader2 className="size-4 animate-spin" />}
                    {confirmingClear
                      ? 'Delete this webhook configuration'
                      : clearing
                        ? 'Save (this empties the URL)'
                        : 'Save webhook'}
                  </Button>
                </DialogFooter>
              ) : (
                <p className="text-muted-foreground text-xs">
                  These values are shown read-only: changing a device&rsquo;s webhook needs a
                  permission this user does not hold.
                </p>
              )}
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

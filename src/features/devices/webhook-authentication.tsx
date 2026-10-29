import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AGENT_HMAC_V1_HEADERS,
  AGENT_HMAC_V1_SIGNED_STRING,
  AUTH_MODE_LABELS,
  SCHEME_INVALID_WARNING,
  SCHEME_OPTIONS,
  SCHEME_UNRECOGNISED_PLACEHOLDER,
  effectiveSummary,
  schemeOptionLabel,
  type EffectiveAuth,
  type EffectiveScheme,
  type SchemeSwitchCopy,
  type WebhookAuthMode,
  type WebhookScheme,
  type WebhookSchemeState,
} from '@/lib/device-webhook'

const AUTH_MODES: WebhookAuthMode[] = ['inherit', 'signed', 'plain']

/**
 * The red notice for a device whose delivery the server has stopped (z8pmx9pyre).
 *
 * Its own export so it can be rendered by `react-dom/server` in a test: "has
 * `role="alert"`" and "has no dismiss control" are claims about output, and the
 * dialog that mounts it owns a query and two mutations. Rendered for every
 * viewer, the read-only one included — the wording assumes no edit right.
 */
export function SchemeInvalidWarning({ effective }: { effective: EffectiveScheme | null }) {
  if (effective !== 'invalid') return null
  return (
    <div
      role="alert"
      className="border-destructive text-destructive flex gap-2 rounded-lg border p-3 text-xs"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>{SCHEME_INVALID_WARNING}</p>
    </div>
  )
}

/**
 * The confirmation a scheme switch waits on (z8pmx9pyrj).
 *
 * The only control that sends a switch: the form's own submit never does, so a
 * double-click on Save or Enter in a field cannot confirm. Both buttons are
 * `type="button"` for the same reason. `role="alert"` announces it when it
 * appears. Every string arrives built by `@/lib/device-webhook`.
 */
export function SchemeSwitchConfirmation({
  copy,
  disabled,
  onCancel,
  onConfirm,
}: {
  copy: SchemeSwitchCopy
  /** Blocked form, or the save already in flight. */
  disabled: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      role="alert"
      className="border-destructive flex flex-col gap-2 rounded-lg border p-3 text-xs"
    >
      <p className="text-destructive flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 shrink-0" />
        {copy.title}
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-4">
        {copy.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={disabled}
          onClick={onConfirm}
        >
          {copy.action}
        </Button>
      </div>
    </div>
  )
}

/**
 * How the device's webhook proves itself to the receiver: the signature scheme,
 * then either the fixed Agent HMAC v1 contract or the legacy mode and header.
 *
 * Presentational and hook-free, so `react-dom/server` can answer the questions
 * that are about output — the legacy controls are *absent* under v1, not
 * disabled; a server that predates the scheme gets no scheme control. Every
 * decision comes in as a prop computed by `@/lib/device-webhook`.
 *
 * **No secret crosses into this component** — only the error and notice strings
 * computed from it. The secret input stays in the dialog, beside the rule that
 * the stored value is never rendered.
 */
export function WebhookAuthentication({
  scheme,
  seededScheme,
  effectiveScheme,
  effectiveAuth,
  v1,
  mode,
  headerName,
  mayWrite,
  schemeError,
  headerNameError,
  authError,
  notices,
  onSchemeChange,
  onModeChange,
  onHeaderNameChange,
}: {
  scheme: WebhookSchemeState
  seededScheme: WebhookSchemeState
  effectiveScheme: EffectiveScheme | null
  effectiveAuth: EffectiveAuth | null
  /** `v1InForce(...)`: decides which controls exist. */
  v1: boolean
  mode: WebhookAuthMode
  headerName: string
  mayWrite: boolean
  /** A server rejection naming the scheme; never blocking. */
  schemeError: string | null
  headerNameError: string | null
  authError: string | null
  /** Warnings shown beneath the controls in force; never blocking. */
  notices: readonly string[]
  onSchemeChange: (scheme: WebhookScheme) => void
  onModeChange: (mode: WebhookAuthMode) => void
  onHeaderNameChange: (headerName: string) => void
}) {
  const summary = effectiveSummary(effectiveAuth, effectiveScheme)
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Authentication</p>

      {/* A server that does not report the field would ignore the choice. */}
      {scheme !== 'unreported' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="device-webhook-scheme">Signature scheme</Label>
          <Select
            // `""` shows the placeholder: an unrecognised stored value is kept,
            // not displayed as one of the three choices.
            value={scheme === 'unrecognised' ? '' : scheme}
            onValueChange={(next) => onSchemeChange(next as WebhookScheme)}
            disabled={!mayWrite}
          >
            <SelectTrigger id="device-webhook-scheme" aria-invalid={schemeError !== null}>
              <SelectValue placeholder={SCHEME_UNRECOGNISED_PLACEHOLDER} />
            </SelectTrigger>
            <SelectContent>
              {SCHEME_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {schemeOptionLabel(option, seededScheme, effectiveScheme)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schemeError && <p className="text-destructive text-xs">{schemeError}</p>}
        </div>
      )}

      {v1 ? (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-md p-3 text-xs">
          <p>
            Every delivery carries three fixed headers. The header name and mode are not used under
            this scheme.
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            <li>the signature header — its name is shown under “Currently sent” once saved</li>
            {AGENT_HMAC_V1_HEADERS.map((header) => (
              <li key={header} className="font-mono">
                {header}
              </li>
            ))}
          </ul>
          <p>
            The signature is <span className="font-mono">sha256=</span> + an HMAC-SHA256 of{' '}
            <span className="font-mono">{AGENT_HMAC_V1_SIGNED_STRING}</span>. The timestamp is
            inside the signature and changes on every attempt, so a captured request cannot be
            replayed.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="device-webhook-mode">Mode</Label>
            <Select
              value={mode}
              onValueChange={(next) => onModeChange(next as WebhookAuthMode)}
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
            {authError && <p className="text-destructive text-xs">{authError}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="device-webhook-header">Header name</Label>
            <Input
              id="device-webhook-header"
              placeholder="empty inherits the server default"
              autoComplete="off"
              spellCheck={false}
              value={headerName}
              onChange={(event) => onHeaderNameChange(event.target.value)}
              readOnly={!mayWrite}
              aria-invalid={headerNameError !== null}
            />
            {headerNameError && <p className="text-destructive text-xs">{headerNameError}</p>}
          </div>
        </>
      )}

      {notices.map((notice) => (
        <p key={notice} className="text-destructive text-xs">
          {notice}
        </p>
      ))}

      {/* What the server says it will send, after inheritance. Never filled in
          from a guessed default. */}
      <p className="text-muted-foreground text-xs">
        {summary.headerName ? (
          <>
            Currently sent: header{' '}
            <span className="text-foreground font-mono">{summary.headerName}</span>, {summary.text}
          </>
        ) : (
          summary.text
        )}
      </p>
    </div>
  )
}

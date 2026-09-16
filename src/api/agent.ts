import { http, results } from '@/lib/http'

/**
 * The omni AI agent's per-number debug switch (reference §12,
 * `POST /agent/debug/toggle`).
 *
 * **This endpoint is a server-side proxy, and that is the whole reason it
 * exists.** The dashboard must call GOWA rather than the omni API directly: a
 * browser-side call would place the shared agent secret inside the JavaScript
 * bundle, where anyone can read it — and that exposure survives the move to
 * HMAC, because the same secret is what signs. GOWA applies the signing header
 * server-side. Nothing in `src/` names that secret, and
 * `src/lib/source-policy.test.ts` fails the build if anything ever does.
 *
 * **State lives upstream.** The omni side owns the TTL, GOWA stores nothing
 * about which numbers have debug on, and there is **no endpoint that reads the
 * current state back**. So this module offers an action and no reader, and the
 * UI above it may never render an authoritative "debug is on" state. Whatever
 * the response reports is a cache at most — `@/lib/agent-debug` owns that rule.
 *
 * **No `ApiRequest`.** The `@/api/request` shape exists so a call can also be
 * rendered as a copy-pasteable cURL command; this one may not be. The number
 * travels in a POST body and reaches no URL, no query string and no rendered
 * command. `getMessageDebug` in `./message` is written the same way for a
 * related reason.
 *
 * `X-Device-Id` and the bearer are attached by the one interceptor in
 * `@/lib/http`; this module sets no header of its own.
 */

/**
 * A duration that has already been through the validator.
 *
 * **There is deliberately no arm for a bare number.** `Number('')` is `0`,
 * `Number('1.5')` is `1.5` and `parseInt('5abc')` is `5` — every one of them a
 * value the server rejects with 400 or, worse, silently accepts as a different
 * duration than the operator typed. Typing the field as this union means a call
 * site that hand-rolls `+raw`, `raw * 1` or `~~raw` does not compile, which is a
 * stronger guarantee than the source rule that also bans those spellings.
 *
 * `parseTtl` in `@/lib/agent-debug` is the only thing that produces one.
 */
export type TtlField = { kind: 'omit' } | { kind: 'minutes'; minutes: number }

export interface AgentDebugToggle {
  /**
   * The target number in E.164 form, **with the leading plus**. A value without
   * it is rejected with 400 before any upstream call is made, so the UI derives
   * it through `phoneFromJid` and never hand-builds one.
   */
  phone: string
  /**
   * `true` sends `#debug on` upstream, `false` sends `#debug off`.
   *
   * **Required, and never defaulted.** The reference makes the field mandatory
   * on purpose: omitting it is an error rather than a default, so a malformed
   * body can never silently switch debug *off* for a number the operator meant
   * to switch it *on* for. Typed non-optional here so the compiler says the same
   * thing.
   */
  enabled: boolean
  ttl: TtlField
}

/**
 * The documented success body, returned **byte for byte** from the omni inside
 * `results`.
 *
 * Typed `unknown` rather than as an interface, and that is not laziness: the
 * reference says any additional field the omni returns is passed through
 * untouched, so a confident interface here would be a guess wearing a type. The
 * shape is decided at the point of use, defensively, by `toggleReport` in
 * `@/lib/agent-debug` — including the case where the body is not an object at
 * all, which must not be "a parse failure".
 */
export function toggleAgentDebug({ phone, enabled, ttl }: AgentDebugToggle) {
  return results<unknown>(
    http.post('/agent/debug/toggle', {
      phone,
      enabled,
      // Present, or the key is ABSENT — never `0`, never `null`, never an
      // `undefined` spelled by hand. The wire name `ttl_minutes` exists in this
      // file and nowhere else in `src/`, which is the containment
      // `include_debug` already has in `./chat`: a rule stated in prose decays,
      // a rule the translation makes true does not.
      ...(ttl.kind === 'minutes' ? { ttl_minutes: ttl.minutes } : {}),
    }),
  )
}

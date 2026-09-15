import type { ApiRequest } from '@/api/request'
import { http, results } from '@/lib/http'

const enc = encodeURIComponent

function messageRequest(
  messageId: string,
  action: string,
  json: Record<string, unknown>,
): ApiRequest {
  return { method: 'POST', path: `/message/${enc(messageId)}/${action}`, json }
}

export function reactRequest(messageId: string, payload: { phone: string; emoji: string }) {
  return messageRequest(messageId, 'reaction', payload)
}

export function revokeRequest(messageId: string, payload: { phone: string }) {
  return messageRequest(messageId, 'revoke', payload)
}

export function deleteRequest(messageId: string, payload: { phone: string }) {
  return messageRequest(messageId, 'delete', payload)
}

export function updateRequest(messageId: string, payload: { phone: string; message: string }) {
  return messageRequest(messageId, 'update', payload)
}

export function readRequest(messageId: string, payload: { phone: string }) {
  return messageRequest(messageId, 'read', payload)
}

export function starRequest(messageId: string, payload: { phone: string }) {
  return messageRequest(messageId, 'star', { ...payload, is_starred: true })
}

export function unstarRequest(messageId: string, payload: { phone: string }) {
  return messageRequest(messageId, 'unstar', { ...payload, is_starred: false })
}

export function forwardRequest(
  messageId: string,
  payload: { phone: string; force_reupload?: boolean },
) {
  return messageRequest(messageId, 'forward', payload)
}

export interface DownloadedMedia {
  message_id: string
  media_type: string
  filename: string
  file_path: string
  file_url?: string
  file_size: number
}

export function downloadMedia(messageId: string, phone: string) {
  return results<DownloadedMedia>(
    http.get(`/message/${enc(messageId)}/download`, { params: { phone } }),
  )
}

/**
 * The AI diagnostics stored against one message (reference §08).
 *
 * **Why this exists at all.** A page of messages embeds `metadata_debug` only
 * under a 1 MiB budget, and a message past that budget still reports
 * `has_debug: true` with no payload attached. This is how that one message is
 * read — on its own, when an operator opens it, never for the whole page.
 *
 * **`unknown`, not a guessed interface.** §12 says in as many words that this
 * endpoint is *not* in `openapi.yaml` and that the reference document is its
 * only specification — and that document gives the route, not the envelope. A
 * confident interface here would be a guess wearing a type, so the shape is
 * decided at the point of use, on the presence of a key, by `debugPayloadOf` in
 * `@/lib/diagnostics`.
 *
 * Unlike `/download` there is no `phone` parameter: §08 addresses this route by
 * message id alone.
 *
 * The route carries `Require(messages.debug.read)` on the server. The UI never
 * calls it without that permission — not because the refusal would be unsafe,
 * but because a control that fires a request which can only be refused is a
 * control that looks broken.
 */
export function getMessageDebug(messageId: string) {
  return results<unknown>(http.get(`/message/${enc(messageId)}/debug`))
}

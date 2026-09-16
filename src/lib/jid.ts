export const JID_TYPES = {
  user: '@s.whatsapp.net',
  group: '@g.us',
  newsletter: '@newsletter',
  lid: '@lid',
  status: 'status@broadcast',
} as const

export type RecipientType = keyof typeof JID_TYPES

export const recipientOptions: { value: RecipientType; label: string }[] = [
  { value: 'user', label: 'Private message' },
  { value: 'group', label: 'Group' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'lid', label: 'LID (Linked ID)' },
  { value: 'status', label: 'Status' },
]

/** Compose the WhatsApp JID the API expects from a phone/id and recipient type. */
export function composeJid(phone: string, type: RecipientType): string {
  if (type === 'status') return JID_TYPES.status
  const trimmed = phone.trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return trimmed
  return `${trimmed}${JID_TYPES[type]}`
}

/**
 * A WhatsApp user part is a full international number written in digits: a
 * country code and a subscriber number, with no punctuation and **no leading
 * zero**.
 *
 * The leading `[1-9]` is the load-bearing character. A `00`-prefixed local part
 * — the trunk prefix some address books still store — would otherwise become
 * `+00963…`, which is not E.164 and which `POST /agent/debug/toggle` answers
 * with a 400 after the UI has already promised the operator it would work. A
 * refusal here is the honest answer: the control is simply absent.
 */
const PHONE_LOCAL = /^[1-9][0-9]{4,19}$/

/**
 * The phone number behind a one-to-one conversation, in E.164 form **with the
 * leading plus** — or `null` when the JID does not describe one.
 *
 * `composeJid`'s inverse, and it lives here for that reason: this module already
 * owns the JID vocabulary, and a second file that also splits on `@` is the
 * duplication that eventually disagrees with the first.
 *
 * **It allow-lists rather than sanitises.** Every arm that is not "a plain
 * international number behind `@s.whatsapp.net`" answers `null`, because the
 * value this returns becomes a request against somebody's phone — a malformed
 * guess is worse than no number at all. Groups (`@g.us`), newsletters,
 * `status@broadcast` and `@lid` need no special case: they all fail the domain
 * comparison. A `@lid` in particular carries a *linked id*, not a number, and
 * inventing one from it is exactly the guess this refuses to make.
 */
export function phoneFromJid(jid: string): string | null {
  const trimmed = jid.trim()
  const at = trimmed.indexOf('@')
  if (at === -1) return null
  // The FIRST `@` decides the split, so `12345@evil@s.whatsapp.net` fails the
  // domain comparison rather than being read as a number in a nested domain.
  if (trimmed.slice(at) !== JID_TYPES.user) return null
  // `:` is the device suffix and `.` the agent one — `<digits>.0:12@…` is the
  // whatsmeow spelling of an agent-suffixed JID, and both are noise in front of
  // the number itself.
  const local = trimmed.slice(0, at).split(/[.:]/)[0]
  return PHONE_LOCAL.test(local) ? `+${local}` : null
}

export function isStatus(type: RecipientType): boolean {
  return type === 'status'
}

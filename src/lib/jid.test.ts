import { describe, expect, it } from 'vitest'
import { composeJid, isStatus, phoneFromJid } from './jid'

describe('composeJid', () => {
  it('appends the user suffix', () => {
    expect(composeJid('628123', 'user')).toBe('628123@s.whatsapp.net')
  })

  it('appends the group suffix', () => {
    expect(composeJid('12345', 'group')).toBe('12345@g.us')
  })

  it('appends newsletter and lid suffixes', () => {
    expect(composeJid('abc', 'newsletter')).toBe('abc@newsletter')
    expect(composeJid('99', 'lid')).toBe('99@lid')
  })

  it('returns the status broadcast jid regardless of phone', () => {
    expect(composeJid('anything', 'status')).toBe('status@broadcast')
    expect(composeJid('', 'status')).toBe('status@broadcast')
  })

  it('passes through a value that already contains a jid', () => {
    expect(composeJid('12345@g.us', 'user')).toBe('12345@g.us')
  })

  it('returns empty for a blank phone (non-status)', () => {
    expect(composeJid('   ', 'user')).toBe('')
  })
})

describe('isStatus', () => {
  it('is true only for status', () => {
    expect(isStatus('status')).toBe(true)
    expect(isStatus('user')).toBe(false)
  })
})

/**
 * `phoneFromJid` — the value that becomes a request against somebody's phone
 * (ticket z8pmx9mw2x).
 *
 * Every case below is an ALLOW-LIST case: the question is never "did we strip
 * enough", it is "is this exactly a plain international number behind
 * `@s.whatsapp.net`". A malformed guess here is worse than no number at all,
 * because "no number" renders as an absent menu item and a guess renders as a
 * toggle on a stranger's diagnostics.
 */
describe('phoneFromJid', () => {
  it('derives E.164 from a plain one-to-one jid', () => {
    expect(phoneFromJid('963938113282@s.whatsapp.net')).toBe('+963938113282')
  })

  it('drops a device suffix', () => {
    expect(phoneFromJid('963938113282:12@s.whatsapp.net')).toBe('+963938113282')
  })

  it('drops an agent suffix, and an agent suffix carrying a device one', () => {
    // `<digits>.<agent>:<device>` is the whatsmeow/Baileys spelling. Splitting
    // on `:` alone dropped the whole jid on the floor.
    expect(phoneFromJid('963938113282.0@s.whatsapp.net')).toBe('+963938113282')
    expect(phoneFromJid('963938113282.0:12@s.whatsapp.net')).toBe('+963938113282')
  })

  it('tolerates surrounding whitespace', () => {
    expect(phoneFromJid('  963938113282@s.whatsapp.net  ')).toBe('+963938113282')
  })

  it('has no number for a group, a newsletter, a status broadcast or a lid', () => {
    // A @lid carries a LINKED ID, not a phone number. Prefixing it with a plus
    // would produce a well-formed-looking number belonging to nobody.
    expect(phoneFromJid('120363001@g.us')).toBeNull()
    expect(phoneFromJid('120363001@newsletter')).toBeNull()
    expect(phoneFromJid('status@broadcast')).toBeNull()
    expect(phoneFromJid('98765432100@lid')).toBeNull()
  })

  it('refuses a nested domain rather than reading a number out of it', () => {
    // The FIRST `@` decides the split, so the remainder is compared whole.
    expect(phoneFromJid('963938113282@evil@s.whatsapp.net')).toBeNull()
    expect(phoneFromJid('963938113282@s.whatsapp.net.evil.test')).toBeNull()
  })

  it('refuses a local part that is not a plain number', () => {
    expect(phoneFromJid('')).toBeNull()
    expect(phoneFromJid('@s.whatsapp.net')).toBeNull()
    expect(phoneFromJid('963938113282')).toBeNull()
    expect(phoneFromJid('+963938113282@s.whatsapp.net')).toBeNull()
    expect(phoneFromJid('96393a113282@s.whatsapp.net')).toBeNull()
    expect(phoneFromJid('963 938 113282@s.whatsapp.net')).toBeNull()
    // Arabic-Indic digits are digits to a human and not to `[0-9]`.
    expect(phoneFromJid('٩٦٣٩٣٨١١٣٢٨٢@s.whatsapp.net')).toBeNull()
    // Too short to be a country code plus a subscriber number, and too long to
    // be E.164 at all.
    expect(phoneFromJid('123@s.whatsapp.net')).toBeNull()
    expect(phoneFromJid(`${'9'.repeat(21)}@s.whatsapp.net`)).toBeNull()
  })

  it('refuses a leading zero rather than inventing +00…', () => {
    // A trunk prefix some address books still store. `+00963…` is not E.164 and
    // the server answers 400 for it — after the UI has promised it would work.
    expect(phoneFromJid('00963938113282@s.whatsapp.net')).toBeNull()
    expect(phoneFromJid('0963938113282@s.whatsapp.net')).toBeNull()
  })

  it('always returns a value that starts with a plus', () => {
    for (const jid of [
      '963938113282@s.whatsapp.net',
      '6281234567@s.whatsapp.net',
      '12025550123:3@s.whatsapp.net',
    ]) {
      expect(phoneFromJid(jid)).toMatch(/^\+[0-9]+$/)
    }
  })
})

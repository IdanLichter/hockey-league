import { supabase } from './supabase'

/**
 * Official contact details (P3 — sheet rows 16, 17). A judge must have a real full name
 * on file before he can apply to work a game, and a medic must also have a phone: the
 * medic is the person you call when someone is hurt, so a game sheet without his number
 * is the failure row 17 exists to catch.
 *
 * Stored in `user_contact`, NOT on `profiles` — that table is readable by anyone,
 * signed in or not, so a phone there would be published to the open internet. Only the
 * owner and admins / league managers can read a contact row.
 */

/** My own contact row, or null if I've never filled it in. */
export async function getMyContact() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_contact')
    .select('full_name,phone')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return null
  return data
}

/** Save my name/phone. The server normalises the phone (strips spaces, dashes, parens). */
export async function saveMyContact(fullName, phone) {
  const { error } = await supabase.rpc('save_my_contact', {
    p_full_name: fullName || null,
    p_phone: phone || null,
  })
  if (error) {
    if (/bad phone/i.test(error.message || '')) throw new Error('מספר טלפון לא תקין')
    throw new Error('שמירת פרטי הקשר נכשלה')
  }
}

/** Admin / league manager: the officials on a game with the details the sheet needs. */
export async function getGameOfficialsContact(gameId) {
  if (!gameId) return []
  const { data, error } = await supabase.rpc('game_officials_contact', { p_game_id: gameId })
  if (error) return []
  return data || []
}

/** Hebrew for the refusals apply_as_official can raise on missing details. */
export function officialApplyError(e) {
  const msg = String(e?.message || '')
  if (/missing full name/i.test(msg)) return 'יש להזין שם מלא לפני הגשת מועמדות'
  if (/missing phone/i.test(msg)) return 'חובש חייב להזין מספר טלפון לטופס המשחק'
  if (/not authorized|not-authorized/i.test(msg)) return 'אין לך הרשאה להגיש מועמדות לתפקיד זה'
  return 'הפעולה נכשלה, נסו שוב'
}

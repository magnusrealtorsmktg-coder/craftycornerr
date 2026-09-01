// Receives the custom-order enquiry form (#customForm in index.html).
//
// Replaces a direct browser->Web3Forms post. Two reasons: Web3Forms' free plan
// shares one 250/month cap with everything else, and an emailed enquiry left no
// record — if the mail failed or got buried, the lead was gone. Now the document
// is written to Sanity first and the email is a notification on top of it.
import {json, clean, normalisePhone, sanityMutate} from './lib/shop.mjs'
import {sendMail, enquiryEmail} from './lib/email.mjs'

const ITEMS = [
  'Wooden Rangoli',
  'Pearl & Stone Rangoli',
  'Bandhanwar Toran',
  'Decorative Flowers',
  'Surprise me ✨',
]

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, {error: 'Method not allowed'})

  let d
  try {
    d = JSON.parse(event.body || '{}')
  } catch {
    return json(400, {error: 'Bad request'})
  }

  // Honeypot: hidden field humans never see. Answer 200 so a bot learns nothing.
  if (clean(d.botcheck, 10)) return json(200, {ok: true})

  const name = clean(d.name, 60)
  const email = clean(d.email, 80)
  const phone = normalisePhone(d.phone)
  const message = clean(d.message, 1200)
  const rawItem = clean(d.item, 60)
  const item = ITEMS.includes(rawItem) ? rawItem : 'Not specified'

  const problems = []
  if (name.length < 2) problems.push('your name')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('a valid email')
  if (!phone) problems.push('a 10-digit mobile number')
  if (message.length < 4) problems.push('a few words about what you want')
  if (problems.length) return json(400, {error: 'Please add ' + problems.join(', ') + '.'})

  const enquiry = {name, email, phone, item, message}

  // Record first — this is the durable copy. If Sanity is down we still try the
  // email, because a lead reaching the inbox beats losing it entirely.
  let saved = true
  try {
    await sanityMutate([
      {
        create: {
          _type: 'enquiry',
          ...enquiry,
          status: 'new',
          submittedAt: new Date().toISOString(),
        },
      },
    ])
  } catch (e) {
    saved = false
    console.error('enquiry not saved:', e.message)
  }

  const mail = await sendMail(enquiryEmail(enquiry))
  if (!mail.sent) console.error('enquiry email not sent:', mail.reason)

  // Only tell the visitor it failed if BOTH paths failed — otherwise their
  // message did reach the studio and asking them to retype it is wrong.
  if (!saved && !mail.sent) {
    return json(502, {error: 'We could not send that just now.'})
  }
  return json(200, {ok: true})
}

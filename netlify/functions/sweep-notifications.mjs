// Hourly backstop for shipping emails.
//
// notify-shipped.mjs is the fast path — a Sanity webhook fires it the moment an
// order is marked shipped. This exists because that webhook is a piece of
// configuration living outside the repo: if it is never set up, gets deleted, or
// silently fails, nothing here would tell us and customers would simply stop
// being told their parcels had shipped.
//
// So the system works with no webhook at all (up to an hour late), and instantly
// once the webhook exists. The `shippedNotifiedAt` stamp is what keeps the two
// paths from ever double-sending.
import {json, sanityQuery, sanityMutate} from './lib/shop.mjs'
import {sendMail, shippedEmail} from './lib/email.mjs'

const MAX_PER_RUN = 25

export async function handler() {
  let pending
  try {
    pending = await sanityQuery(
      '*[_type == "order" && status == "shipped" && !defined(shippedNotifiedAt) && defined(customerEmail)][0...$max]' +
        '{_id, orderNumber, items, address, customerName, customerEmail, courier, trackingNumber}',
      {max: MAX_PER_RUN},
    )
  } catch (e) {
    console.error('sweep query failed:', e.message)
    return json(500, {error: 'query failed'})
  }

  if (!pending || !pending.length) return json(200, {ok: true, sent: 0})

  let sent = 0
  for (const o of pending) {
    const mail = await sendMail(shippedEmail(o))
    if (!mail.sent) {
      // Leave it unstamped; the next run tries again.
      console.error('sweep: email failed for', o.orderNumber, mail.reason)
      continue
    }
    try {
      await sanityMutate([
        {patch: {id: o._id, set: {shippedNotifiedAt: new Date().toISOString()}}},
      ])
      sent++
    } catch (e) {
      console.error('sweep: could not stamp', o.orderNumber, e.message)
    }
  }

  if (sent) console.log(`sweep sent ${sent} shipping email(s)`)
  return json(200, {ok: true, sent})
}

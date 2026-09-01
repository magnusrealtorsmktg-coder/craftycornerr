// Emails the customer their tracking details when an order is marked shipped.
//
// Triggered by a Sanity webhook on the order document. The webhook is treated
// purely as a NUDGE, never as a source of truth: it only tells us which document
// changed, and everything that decides whether to send is re-read from Sanity
// here. So even a forged call can do nothing except send a legitimate email for
// an order that genuinely is shipped and genuinely has not been notified yet.
//
// Idempotency is the `shippedNotifiedAt` stamp rather than anything the webhook
// says. Sanity retries failed webhooks, and editing a shipped order fires it
// again — neither can produce a second email.
import {json, sanityQuery, sanityMutate, clean} from './lib/shop.mjs'
import {sendMail, shippedEmail} from './lib/email.mjs'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, {error: 'Method not allowed'})

  // Optional shared secret. Set WEBHOOK_SECRET in Netlify and add a matching
  // x-webhook-secret header in the Sanity webhook to keep strangers from
  // triggering sends. Absent = open, which is survivable because of the
  // re-read above, but set it.
  const want = process.env.WEBHOOK_SECRET
  if (want) {
    const got = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret']
    if (got !== want) {
      console.error('notify-shipped: bad or missing secret')
      return json(401, {error: 'Unauthorized'})
    }
  }

  let id
  try {
    const body = JSON.parse(event.body || '{}')
    id = clean(body._id || body.documentId || body.id, 80)
  } catch {
    return json(400, {error: 'Bad request'})
  }
  if (!id) return json(400, {error: 'No document id'})

  // Drafts share the published id with a `drafts.` prefix; only act on published.
  if (id.startsWith('drafts.')) return json(200, {ok: true, skipped: 'draft'})

  let o
  try {
    o = await sanityQuery(
      '*[_type == "order" && _id == $id][0]{_id, orderNumber, status, items, address, customerName, customerEmail, courier, trackingNumber, shippedNotifiedAt}',
      {id},
    )
  } catch (e) {
    console.error('notify-shipped lookup failed:', e.message)
    return json(500, {error: 'lookup failed'})
  }

  if (!o) return json(200, {ok: true, skipped: 'not-found'})
  if (o.status !== 'shipped') return json(200, {ok: true, skipped: 'not-shipped'})
  if (o.shippedNotifiedAt) return json(200, {ok: true, skipped: 'already-notified'})
  if (!o.customerEmail) return json(200, {ok: true, skipped: 'no-email'})

  const mail = await sendMail(shippedEmail(o))
  if (!mail.sent) {
    // Leave the stamp off so a retry — or a later sweep — can pick it up again.
    console.error('shipping email not sent:', mail.reason, o.orderNumber)
    return json(502, {error: 'email failed', reason: mail.reason})
  }

  try {
    await sanityMutate([
      {patch: {id: o._id, set: {shippedNotifiedAt: new Date().toISOString()}}},
    ])
  } catch (e) {
    // The customer has the email; the worst case is a duplicate if the webhook
    // fires again, which is far better than never telling them at all.
    console.error('could not stamp shippedNotifiedAt:', e.message)
  }

  console.log('shipping email sent for', o.orderNumber)
  return json(200, {ok: true, orderNumber: o.orderNumber})
}

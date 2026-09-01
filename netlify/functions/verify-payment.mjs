// Step 2 of checkout: prove the payment is real, then record and announce it.
//
// Razorpay's browser callback is not trustworthy on its own — anyone can POST
// this endpoint claiming success. The HMAC signature check in verifySignature()
// is what makes it authoritative: only someone holding the key secret can
// produce a valid signature for an order/payment pair, and the secret exists
// only in Netlify's environment.
import {
  json,
  clean,
  sanityQuery,
  sanityMutate,
  verifySignature,
  razorpayKeys,
} from './lib/shop.mjs'
import {sendMail, studioEmail, customerEmail} from './lib/email.mjs'

// Fallback path only: if the pending draft never made it into Sanity we rebuild
// what we can from Razorpay's own copy of the order, which carries the amount
// and the notes we attached at creation.
async function razorpayGet(path) {
  const {id, secret} = razorpayKeys()
  const auth = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: {Authorization: `Basic ${auth}`},
  })
  if (!res.ok) return null
  return res.json()
}
const fetchRazorpayOrder = (orderId) => razorpayGet(`/orders/${orderId}`)

// The contact Razorpay actually processed the payment with. For UPI and
// netbanking it is tied to the payment instrument, so it is a useful
// cross-check against whatever was typed into our own form.
const fetchRazorpayPayment = (paymentId) => razorpayGet(`/payments/${paymentId}`)

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, {error: 'Method not allowed'})

  let d
  try {
    d = JSON.parse(event.body || '{}')
  } catch {
    return json(400, {error: 'Bad request'})
  }

  const orderId = clean(d.razorpay_order_id, 60)
  const paymentId = clean(d.razorpay_payment_id, 60)
  const signature = clean(d.razorpay_signature, 200)

  if (!verifySignature({orderId, paymentId, signature})) {
    console.error('signature rejected for order', orderId)
    return json(400, {error: 'Payment could not be verified.', code: 'bad-signature'})
  }

  // From here the payment is proven genuine. Everything below is bookkeeping —
  // it must never turn a successful payment into a failure for the customer.
  let order = null
  try {
    order = await sanityQuery(
      '*[_type == "order" && razorpayOrderId == $oid][0]{_id, orderNumber, items, subtotal, shipping, total, customerName, customerEmail, customerPhone, address, status}',
      {oid: orderId},
    )
  } catch (e) {
    console.error('order lookup failed:', e.message)
  }

  const paidAt = new Date().toISOString()

  try {
    if (order && order._id) {
      if (order.status === 'paid') {
        // Duplicate callback (customer double-clicked, or a retry) — the order
        // is already recorded, so acknowledge without emailing a second time.
        return json(200, {ok: true, orderNumber: order.orderNumber, duplicate: true})
      }
      await sanityMutate([
        {
          patch: {
            id: order._id,
            set: {status: 'paid', razorpayPaymentId: paymentId, paidAt},
          },
        },
      ])
    } else {
      // The draft never saved. Rebuild a minimal record so the sale is not lost.
      const rz = await fetchRazorpayOrder(orderId)
      const notes = (rz && rz.notes) || {}
      order = {
        orderNumber: notes.orderNumber || 'TCC-' + orderId.slice(-6).toUpperCase(),
        items: [],
        subtotal: rz ? rz.amount / 100 : 0,
        shipping: 0,
        total: rz ? rz.amount / 100 : 0,
        customerName: notes.customer || 'See Razorpay dashboard',
        customerEmail: '',
        customerPhone: notes.phone || '',
        address: 'NOT CAPTURED — look up this payment in the Razorpay dashboard.',
      }
      await sanityMutate([
        {
          create: {
            ...order,
            _type: 'order',
            status: 'paid',
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            placedAt: paidAt,
            paidAt,
          },
        },
      ])
    }
  } catch (e) {
    console.error('could not record paid order:', e.message)
  }

  // Pull the contact Razorpay processed the payment with — best effort, and
  // only used to enrich the notification, never to gate anything.
  let verifiedPhone = ''
  try {
    const pay = await fetchRazorpayPayment(paymentId)
    verifiedPhone = (pay && pay.contact) || ''
    if (verifiedPhone && order && order._id) {
      await sanityMutate([{patch: {id: order._id, set: {verifiedPhone}}}])
    }
  } catch (e) {
    console.error('could not read payment contact:', e.message)
  }

  const full = {
    ...order,
    verifiedPhone,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
  }

  // Both emails are best-effort and independent: the customer still gets their
  // confirmation if the studio's copy fails, and vice versa.
  const [studio, customer] = await Promise.all([
    sendMail(studioEmail(full)),
    full.customerEmail ? sendMail(customerEmail(full)) : Promise.resolve({sent: false, reason: 'no-email'}),
  ])
  if (!studio.sent) console.error('studio email not sent:', studio.reason)
  if (!customer.sent) console.error('customer email not sent:', customer.reason)

  return json(200, {ok: true, orderNumber: (order && order.orderNumber) || ''})
}

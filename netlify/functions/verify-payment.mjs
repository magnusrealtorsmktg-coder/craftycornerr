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
  SANITY_PROJECT,
} from './lib/shop.mjs'

const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY || '9e419d23-7cc6-4351-9c2a-a32b46872250'

const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')

// Fallback path only: if the pending draft never made it into Sanity we rebuild
// what we can from Razorpay's own copy of the order, which carries the amount
// and the notes we attached at creation.
async function fetchRazorpayOrder(orderId) {
  const {id, secret} = razorpayKeys()
  const auth = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: {Authorization: `Basic ${auth}`},
  })
  if (!res.ok) return null
  return res.json()
}

async function emailStudio(order) {
  if (!WEB3FORMS_KEY || WEB3FORMS_KEY.startsWith('PASTE-')) return
  const lines = (order.items || [])
    .map((i) => `  ${i.qty} × ${i.name} (${i.code}) — ${rupees(i.price * i.qty)}`)
    .join('\n')

  const message = [
    `NEW PAID ORDER — ${order.orderNumber}`,
    '',
    'SHIP TO',
    `  ${order.customerName}`,
    `  ${(order.address || '').split('\n').join('\n  ')}`,
    `  Phone: ${order.customerPhone}`,
    `  Email: ${order.customerEmail}`,
    '',
    'ITEMS',
    lines,
    '',
    `  Subtotal   ${rupees(order.subtotal)}`,
    `  Shipping   ${order.shipping ? rupees(order.shipping) : 'Free'}`,
    `  TOTAL PAID ${rupees(order.total)}`,
    '',
    `Razorpay payment id: ${order.razorpayPaymentId}`,
    `Razorpay order id:   ${order.razorpayOrderId}`,
    '',
    `Mark it as shipped here: https://the-crafty-cornerr.sanity.studio/structure/order`,
  ].join('\n')

  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `🧡 Paid order ${order.orderNumber} — ${rupees(order.total)} — ${order.customerName}`,
        from_name: 'The Crafty Cornerr shop',
        replyto: order.customerEmail,
        message,
      }),
    })
  } catch (e) {
    // Never fail the customer's checkout because an email did not send — the
    // order is already safe in Sanity and in the Razorpay dashboard.
    console.error('studio email failed:', e.message)
  }
}

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

  await emailStudio({
    ...order,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
  })

  return json(200, {ok: true, orderNumber: (order && order.orderNumber) || ''})
}

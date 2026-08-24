// Step 1 of checkout: price the cart server-side and open a Razorpay order.
//
// The browser sends only product codes, quantities and the delivery address.
// Prices, shipping and the grand total are computed here from Sanity — see
// lib/shop.mjs. The response includes RAZORPAY_KEY_ID so the site never has to
// hardcode it; the secret never leaves this function.
import {
  json,
  clean,
  priceCart,
  razorpayKeys,
  createRazorpayOrder,
  orderNumber,
  sanityMutate,
} from './lib/shop.mjs'

function readCustomer(d) {
  const c = (d && d.customer) || {}
  const name = clean(c.name, 60)
  const email = clean(c.email, 80)
  const phone = clean(c.phone, 20).replace(/[^\d+]/g, '')
  const address = clean(c.address, 240)
  const city = clean(c.city, 60)
  const state = clean(c.state, 60)
  const pincode = clean(c.pincode, 10).replace(/\D/g, '')

  const problems = []
  if (name.length < 2) problems.push('a name')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('a valid email')
  if (phone.replace(/\D/g, '').length < 10) problems.push('a 10-digit phone number')
  if (address.length < 8) problems.push('a full street address')
  if (!city) problems.push('a city')
  if (!state) problems.push('a state')
  if (!/^\d{6}$/.test(pincode)) problems.push('a 6-digit PIN code')

  return {c: {name, email, phone, address, city, state, pincode}, problems}
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, {error: 'Method not allowed'})

  const keys = razorpayKeys()
  if (!keys.ok) {
    return json(503, {
      error: 'Online payment is not switched on yet. Please order on WhatsApp and we will help you.',
      code: 'no-keys',
    })
  }

  let d
  try {
    d = JSON.parse(event.body || '{}')
  } catch {
    return json(400, {error: 'Bad request'})
  }

  const {c, problems} = readCustomer(d)
  if (problems.length) {
    return json(400, {error: 'Please add ' + problems.join(', ') + '.'})
  }

  // Price the cart from the database. Any failure here means we must NOT take
  // money, so each case gets a message the customer can act on.
  let cart
  try {
    cart = await priceCart(d.items)
  } catch (e) {
    const m = String(e.message || '')
    if (m.startsWith('unavailable:')) {
      return json(409, {
        error: `"${m.slice(12)}" has just sold out. Please remove it from your bag and try again.`,
        code: 'unavailable',
      })
    }
    if (m.startsWith('unknown-product:')) {
      return json(409, {
        error: 'One of the items in your bag is no longer in our shop. Please remove it and try again.',
        code: 'unknown-product',
      })
    }
    if (m === 'empty-cart') return json(400, {error: 'Your bag is empty.'})
    if (m === 'no-sanity-token') {
      // Without this we cannot verify prices, and guessing is not an option.
      return json(503, {
        error: 'Checkout is not fully configured yet. Please order on WhatsApp.',
        code: 'no-sanity-token',
      })
    }
    return json(502, {error: 'Could not price your bag just now. Please try again.'})
  }

  const number = orderNumber()

  let rzOrder
  try {
    rzOrder = await createRazorpayOrder({
      amountRupees: cart.total,
      receipt: number,
      notes: {
        orderNumber: number,
        customer: c.name,
        phone: c.phone,
        pincode: c.pincode,
        items: cart.items.map((i) => `${i.qty}x ${i.code}`).join(', ').slice(0, 500),
      },
    })
  } catch (e) {
    return json(502, {error: 'Could not start the payment. Please try again in a moment.'})
  }

  // Record the attempt as `pending`. Deliberately fail-soft: if Sanity is down
  // we would rather take the order (Razorpay still has it, and verify-payment
  // will create the doc) than block a paying customer.
  try {
    await sanityMutate([
      {
        create: {
          _type: 'order',
          orderNumber: number,
          status: 'pending',
          items: cart.items.map((i) => ({
            _key: i.code,
            code: i.code,
            name: i.name,
            qty: i.qty,
            price: i.price,
          })),
          subtotal: cart.subtotal,
          shipping: cart.shipping,
          total: cart.total,
          customerName: c.name,
          customerEmail: c.email,
          customerPhone: c.phone,
          address: `${c.address}\n${c.city}, ${c.state} ${c.pincode}`,
          pincode: c.pincode,
          razorpayOrderId: rzOrder.id,
          placedAt: new Date().toISOString(),
        },
      },
    ])
  } catch (e) {
    console.error('order draft not saved:', e.message)
  }

  return json(200, {
    ok: true,
    keyId: keys.id,
    razorpayOrderId: rzOrder.id,
    amount: rzOrder.amount, // paise, as Razorpay's modal expects
    currency: rzOrder.currency,
    orderNumber: number,
    subtotal: cart.subtotal,
    shipping: cart.shipping,
    total: cart.total,
    items: cart.items,
  })
}

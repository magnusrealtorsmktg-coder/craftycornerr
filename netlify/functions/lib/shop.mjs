// Shared server-side shop logic for the Razorpay checkout.
//
// SECURITY: this module is the reason the checkout is safe. The browser is only
// ever trusted to say *which* products and *how many* — never what they cost.
// Every price is re-read from Sanity here, server-side, and the total is
// recomputed from scratch. A tampered cart in devtools changes nothing.
//
// Not a Netlify function itself: it lives in lib/ so Netlify's function
// detector (which wants `<name>/<name>.mjs` or a top-level file) skips it.

import crypto from 'node:crypto'

export const SANITY_PROJECT = 'c8746siu'
export const SANITY_DATASET = 'production'
export const SANITY_API = '2024-01-01'

// ── Shipping rule ─────────────────────────────────────────────────────────
// This is the ONLY authoritative copy. index.html shows the same numbers in the
// cart drawer for the customer's benefit, but the server total is what gets
// charged — if the two ever disagree, this one wins. Change it here first.
export const SHIPPING_FLAT = 79
export const FREE_SHIPPING_OVER = 999

export function shippingFor(subtotal) {
  if (subtotal <= 0) return 0
  return subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT
}

export const json = (statusCode, obj) => ({
  statusCode,
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(obj),
})

export const clean = (s, n) =>
  String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)

// Editor token can read as well as write, so it is preferred; a read-only token
// is enough for the price lookup alone.
export const sanityToken = () =>
  process.env.SANITY_WRITE_TOKEN || process.env.SANITY_READ_TOKEN || ''

export async function sanityQuery(query, params = {}) {
  const token = sanityToken()
  if (!token) throw new Error('no-sanity-token')
  let url = `https://${SANITY_PROJECT}.apicdn.sanity.io/v${SANITY_API}/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}`
  for (const [k, v] of Object.entries(params)) {
    url += `&${encodeURIComponent('$' + k)}=${encodeURIComponent(JSON.stringify(v))}`
  }
  const res = await fetch(url, {headers: {Authorization: `Bearer ${token}`}})
  if (!res.ok) throw new Error('sanity-query-' + res.status)
  const {result} = await res.json()
  return result
}

export async function sanityMutate(mutations) {
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) throw new Error('no-write-token')
  const res = await fetch(
    `https://${SANITY_PROJECT}.api.sanity.io/v${SANITY_API}/data/mutate/${SANITY_DATASET}`,
    {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({mutations}),
    },
  )
  if (!res.ok) throw new Error('sanity-mutate-' + res.status + ' ' + (await res.text()).slice(0, 200))
  return res.json()
}

// ── Cart pricing ──────────────────────────────────────────────────────────
// Takes the browser's [{id, qty}] and returns a priced cart built entirely from
// Sanity data. Throws if anything is unbuyable so the caller can refuse cleanly.
export async function priceCart(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('empty-cart')
  if (rawItems.length > 50) throw new Error('too-many-items')

  // Collapse duplicates and sanitise quantities before touching the database.
  const wanted = new Map()
  for (const it of rawItems) {
    const code = clean(it && it.id, 40)
    const qty = Math.floor(Number(it && it.qty))
    if (!code || !Number.isFinite(qty) || qty < 1) continue
    wanted.set(code, Math.min(99, (wanted.get(code) || 0) + qty))
  }
  if (!wanted.size) throw new Error('empty-cart')

  const codes = [...wanted.keys()]
  const rows = await sanityQuery(
    '*[_type == "product" && code in $codes]{code, name, price, available}',
    {codes},
  )

  const items = []
  for (const code of codes) {
    const row = (rows || []).find((r) => r.code === code)
    if (!row) throw new Error('unknown-product:' + code)
    // `available` is undefined on products created before the field existed —
    // treat only an explicit false as unavailable, matching the site.
    if (row.available === false) throw new Error('unavailable:' + (row.name || code))
    const price = Number(row.price)
    if (!Number.isFinite(price) || price < 0) throw new Error('bad-price:' + code)
    items.push({code, name: row.name || code, qty: wanted.get(code), price})
  }

  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0)
  const shipping = shippingFor(subtotal)
  const total = subtotal + shipping
  if (total <= 0) throw new Error('zero-total')

  return {items, subtotal, shipping, total}
}

// ── Razorpay ──────────────────────────────────────────────────────────────
// The key id is NOT a secret — it is handed to every browser that opens the
// payment modal — so keeping the test-mode id here is safe and means only the
// secret has to be configured while testing.
//
// GOING LIVE: set RAZORPAY_KEY_ID to the rzp_live_… id. If you swap in a live
// secret and forget the id, Razorpay rejects every call with a 401 (a live
// secret cannot authenticate a test id), so the failure is loud, not silent.
const TEST_KEY_ID = 'rzp_test_TTclNncj0KyotV'

export function razorpayKeys() {
  const id = process.env.RAZORPAY_KEY_ID || TEST_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET || ''
  if (!process.env.RAZORPAY_KEY_ID) {
    console.warn('RAZORPAY_KEY_ID not set — using the built-in TEST key id.')
  }
  return {id, secret, ok: Boolean(id && secret), isTest: id.startsWith('rzp_test_')}
}

export async function createRazorpayOrder({amountRupees, receipt, notes}) {
  const {id, secret} = razorpayKeys()
  const auth = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {Authorization: `Basic ${auth}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100), // Razorpay works in paise
      currency: 'INR',
      receipt: receipt.slice(0, 40),
      notes,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body && body.error && body.error.description) || 'razorpay-' + res.status
    throw new Error(msg)
  }
  return body
}

// Razorpay signs `<order_id>|<payment_id>` with the key secret. timingSafeEqual
// keeps the comparison constant-time.
export function verifySignature({orderId, paymentId, signature}) {
  const {secret} = razorpayKeys()
  if (!secret || !orderId || !paymentId || !signature) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(String(signature), 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// Short, human-sayable order number — the client and customer quote this to
// each other on WhatsApp, so it must be easy to read aloud.
export function orderNumber() {
  const d = new Date()
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '')
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `TCC-${ymd}-${rand}`
}

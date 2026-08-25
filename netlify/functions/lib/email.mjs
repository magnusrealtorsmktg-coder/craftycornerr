// Transactional email via Brevo.
//
// Replaces the Web3Forms call that used to live in verify-payment.mjs: Web3Forms
// rejects server-side requests on its free plan ("Use our API in client side"),
// so order notifications silently never sent. Web3Forms still handles the
// enquiry form in index.html, which posts from the browser and works fine.
//
// Everything here is best-effort. The customer has already been charged by the
// time we send anything, so an email failure must never surface as a payment
// failure — callers log and carry on.

const API = 'https://api.brevo.com/v3/smtp/email'

const FROM_EMAIL = process.env.MAIL_FROM || 'orders@thecraftycornerr.com'
const FROM_NAME = 'The Crafty Cornerr'
// Where the studio's own copy goes. Falls back to the shop's Gmail.
export const STUDIO_INBOX = process.env.STUDIO_EMAIL || 'thecraftycornerr26@gmail.com'

export const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')

export const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c],
  )

export async function sendMail({to, toName, subject, html, text, replyTo}) {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    console.warn('BREVO_API_KEY not set — skipping email:', subject)
    return {sent: false, reason: 'no-key'}
  }
  if (!to) return {sent: false, reason: 'no-recipient'}

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {'api-key': key, 'content-type': 'application/json', accept: 'application/json'},
      body: JSON.stringify({
        sender: {email: FROM_EMAIL, name: FROM_NAME},
        to: [{email: to, name: toName || undefined}],
        subject,
        htmlContent: html,
        textContent: text,
        ...(replyTo ? {replyTo: {email: replyTo}} : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('brevo', res.status, body.slice(0, 300))
      return {sent: false, reason: 'brevo-' + res.status}
    }
    return {sent: true}
  } catch (e) {
    console.error('brevo threw:', e.message)
    return {sent: false, reason: 'threw'}
  }
}

// ── shared bits of the two order emails ───────────────────────────────────
const WA = '917030924448'

const itemRows = (items) =>
  (items || [])
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.name)}<br>
         <span style="color:#8a8076;font-size:13px">${esc(i.code)} · qty ${i.qty}</span></td>
         <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
         ${rupees(i.price * i.qty)}</td></tr>`,
    )
    .join('')

const shell = (inner) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;
   padding:24px;color:#222;line-height:1.55">${inner}
   <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#8a8076;font-size:13px">
   The Crafty Cornerr · handmade happiness in every corner<br>
   <a href="https://wa.me/${WA}" style="color:#ff6f61">WhatsApp us</a> ·
   <a href="https://thecraftycornerr.com" style="color:#ff6f61">thecraftycornerr.com</a></p></div>`

const totals = (o) =>
  `<table style="width:100%;margin-top:14px;font-size:14px">
   <tr><td style="color:#8a8076">Subtotal</td><td style="text-align:right">${rupees(o.subtotal)}</td></tr>
   <tr><td style="color:#8a8076">Shipping</td><td style="text-align:right">${o.shipping ? rupees(o.shipping) : 'Free'}</td></tr>
   <tr><td style="font-weight:700;padding-top:6px">Total</td>
   <td style="text-align:right;font-weight:700;padding-top:6px">${rupees(o.total)}</td></tr></table>`

// ── 1. the studio's packing slip ──────────────────────────────────────────
export function studioEmail(o) {
  const addr = esc(o.address || '').split('\n').join('<br>')
  return {
    to: STUDIO_INBOX,
    replyTo: o.customerEmail || undefined,
    subject: `🧡 Paid order ${o.orderNumber} — ${rupees(o.total)} — ${o.customerName}`,
    html: shell(
      `<h2 style="margin:0 0 4px">New paid order</h2>
       <p style="margin:0 0 18px;color:#8a8076">${esc(o.orderNumber)}</p>
       <h3 style="margin:0 0 6px;font-size:15px">Ship to</h3>
       <p style="margin:0 0 4px"><strong>${esc(o.customerName)}</strong><br>${addr}</p>
       <p style="margin:0 0 18px">📞 ${esc(o.customerPhone)}${o.verifiedPhone && o.verifiedPhone !== o.customerPhone ? ` <span style="color:#8a8076">(Razorpay: ${esc(o.verifiedPhone)})</span>` : ''}<br>
       ✉️ ${esc(o.customerEmail)}</p>
       <table style="width:100%;font-size:14px">${itemRows(o.items)}</table>
       ${totals(o)}
       <p style="margin-top:18px;color:#8a8076;font-size:13px">
       Razorpay payment: ${esc(o.razorpayPaymentId)}</p>
       <p style="margin-top:14px"><a href="https://the-crafty-cornerr.sanity.studio/structure/order"
       style="background:#ff6f61;color:#fff;padding:10px 18px;border-radius:10px;
       text-decoration:none;display:inline-block">Mark as shipped</a></p>`,
    ),
    text: [
      `NEW PAID ORDER — ${o.orderNumber}`,
      '',
      'SHIP TO',
      `  ${o.customerName}`,
      `  ${(o.address || '').split('\n').join('\n  ')}`,
      `  Phone: ${o.customerPhone}`,
      `  Email: ${o.customerEmail}`,
      '',
      'ITEMS',
      ...(o.items || []).map((i) => `  ${i.qty} x ${i.name} (${i.code}) — ${rupees(i.price * i.qty)}`),
      '',
      `  Subtotal   ${rupees(o.subtotal)}`,
      `  Shipping   ${o.shipping ? rupees(o.shipping) : 'Free'}`,
      `  TOTAL PAID ${rupees(o.total)}`,
      '',
      `Razorpay payment: ${o.razorpayPaymentId}`,
    ].join('\n'),
  }
}

// ── 2. the customer's confirmation ────────────────────────────────────────
export function customerEmail(o) {
  const addr = esc(o.address || '').split('\n').join('<br>')
  return {
    to: o.customerEmail,
    toName: o.customerName,
    replyTo: STUDIO_INBOX,
    subject: `Thank you! Your order ${o.orderNumber} is confirmed 🧡`,
    html: shell(
      `<h2 style="margin:0 0 4px">Thank you, ${esc((o.customerName || '').split(' ')[0])}!</h2>
       <p style="margin:0 0 18px;color:#8a8076">
       Your order <strong>${esc(o.orderNumber)}</strong> is confirmed and paid.</p>
       <table style="width:100%;font-size:14px">${itemRows(o.items)}</table>
       ${totals(o)}
       <h3 style="margin:22px 0 6px;font-size:15px">Delivering to</h3>
       <p style="margin:0">${esc(o.customerName)}<br>${addr}</p>
       <h3 style="margin:22px 0 6px;font-size:15px">What happens next</h3>
       <p style="margin:0;color:#555">Every piece is made and checked by hand. Ready-to-ship items
       leave us in 2–4 working days, and we'll email you the tracking details the moment your
       parcel is on its way. Questions? Just reply to this email or message us on WhatsApp —
       quote ${esc(o.orderNumber)} and we'll find you instantly.</p>`,
    ),
    text: [
      `Thank you, ${(o.customerName || '').split(' ')[0]}!`,
      '',
      `Your order ${o.orderNumber} is confirmed and paid.`,
      '',
      ...(o.items || []).map((i) => `  ${i.qty} x ${i.name} — ${rupees(i.price * i.qty)}`),
      '',
      `  Subtotal ${rupees(o.subtotal)}`,
      `  Shipping ${o.shipping ? rupees(o.shipping) : 'Free'}`,
      `  Total    ${rupees(o.total)}`,
      '',
      'DELIVERING TO',
      `  ${o.customerName}`,
      `  ${(o.address || '').split('\n').join('\n  ')}`,
      '',
      "Ready-to-ship items leave us in 2-4 working days and we'll email tracking",
      `when your parcel ships. Questions? Reply here or WhatsApp us: quote ${o.orderNumber}.`,
    ].join('\n'),
  }
}

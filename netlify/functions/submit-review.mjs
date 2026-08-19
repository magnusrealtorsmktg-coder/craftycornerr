// Accepts a public review submission from the website and stores it in Sanity
// as PENDING (approved: false). The client approves it in the Studio before it
// appears on the site.
//
// Requires a Netlify environment variable SANITY_WRITE_TOKEN (an "Editor" token
// from sanity.io/manage). This token lives ONLY on the server (Netlify) and is
// never sent to the browser.
const PROJECT = 'c8746siu'
const DATASET = 'production'
const API = '2024-01-01'

const json = (statusCode, obj) => ({
  statusCode,
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(obj),
})

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, {error: 'Method not allowed'})

  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) return json(500, {error: 'Reviews are not configured on the server yet.'})

  let d
  try {
    d = JSON.parse(event.body || '{}')
  } catch {
    return json(400, {error: 'Bad request'})
  }

  const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n)
  const productId = clean(d.productId, 40)
  const name = clean(d.name, 40) || 'Guest'
  const location = clean(d.location, 40)
  const text = clean(d.text, 320)
  const rating = Math.max(1, Math.min(5, Math.round(Number(d.rating) || 5)))
  if (!productId || !text) return json(400, {error: 'Please include a product and a few words.'})

  try {
    // Resolve the product's document id from its code (e.g. "pk1").
    const query = encodeURIComponent('*[_type == "product" && code == $code][0]._id')
    const param = encodeURIComponent(JSON.stringify(productId))
    const qUrl = `https://${PROJECT}.apicdn.sanity.io/v${API}/data/query/${DATASET}?query=${query}&%24code=${param}`
    const qRes = await fetch(qUrl, {headers: {Authorization: `Bearer ${token}`}})
    const {result: prodId} = await qRes.json()
    if (!prodId) return json(400, {error: 'Unknown product.'})

    const body = {
      mutations: [
        {
          create: {
            _type: 'review',
            approved: false,
            product: {_type: 'reference', _ref: prodId},
            name,
            location,
            rating,
            text,
            submittedAt: new Date().toISOString(),
          },
        },
      ],
    }
    const mRes = await fetch(`https://${PROJECT}.api.sanity.io/v${API}/data/mutate/${DATASET}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    })
    if (!mRes.ok) {
      const t = await mRes.text()
      return json(502, {error: 'Could not save the review.', detail: t.slice(0, 200)})
    }
    return json(200, {ok: true})
  } catch (e) {
    return json(500, {error: 'Server error saving review.'})
  }
}

// Serves the storefront catalogue so the browser never holds a Sanity token.
//
// Sanity keeps this project's categories (and most products) private, so a
// token is genuinely required to read them — but a token shipped inside
// index.html is public the moment anyone opens devtools, and it lands in the
// repo besides. This function keeps it server-side: the browser calls a plain
// URL, we attach the token here, and the token can be rotated without a deploy.
//
// The response is cached at Netlify's edge, so this costs one Sanity round-trip
// per cache period rather than one per visitor.
import {json, sanityToken, SANITY_PROJECT, SANITY_DATASET, SANITY_API} from './lib/shop.mjs'

const REVIEWS =
  'reviews[]{"n":name,"loc":location,"r":rating,"t":text} + ' +
  '*[_type=="review" && approved==true && references(^._id)]|order(submittedAt desc)' +
  '{"n":name,"loc":location,"r":rating,"t":text}'

const QUERY =
  '{"categories":*[_type=="category"]|order(order asc)' +
  '{"key":key,title,tagline,"cover":coverImage.asset->url,' +
  '"products":*[_type=="product"&&references(^._id)]|order(order asc)' +
  '{"id":code,name,price,"old":oldPrice,badge,available,rating,"rc":reviewCount,' +
  '"img":image.asset->url,"desc":description,specs,"reviews":' + REVIEWS + '}},' +
  '"settings":*[_id=="siteSettings"][0]{theme,"heroBg":heroBackground.asset->url,' +
  '"hero":heroProducts[]->{"img":image.asset->url,name,price,"id":code}}}'

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, {error: 'Method not allowed'})

  const token = sanityToken()
  if (!token) {
    // The site falls back to its built-in starter copy when this fails, so a
    // missing token degrades the page rather than breaking it.
    return json(503, {error: 'Catalogue is not configured.'})
  }

  try {
    const url =
      `https://${SANITY_PROJECT}.apicdn.sanity.io/v${SANITY_API}/data/query/${SANITY_DATASET}` +
      `?query=${encodeURIComponent(QUERY)}`
    const res = await fetch(url, {headers: {Authorization: `Bearer ${token}`}})
    if (!res.ok) throw new Error('sanity-' + res.status)
    const {result} = await res.json()

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Serve from cache for a minute, and keep serving the stale copy for an
        // hour while revalidating — a Sanity hiccup never blanks the shop.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
      },
      body: JSON.stringify(result || {}),
    }
  } catch (e) {
    console.error('catalog fetch failed:', e.message)
    return json(502, {error: 'Could not load the catalogue.'})
  }
}

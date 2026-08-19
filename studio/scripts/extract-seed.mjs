// Reads the CURRENT index.html (with its built-in base64 products) and writes
// studio/seed/seed-data.json — a one-time snapshot used by import.mjs to load
// the existing catalogue into Sanity. Safe to re-run; it only reads index.html.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const html = readFileSync(join(root, 'index.html'), 'utf8')

function grab(re, what) {
  const m = html.match(re)
  if (!m) throw new Error(`Could not find ${what} in index.html`)
  return m[1]
}

// The base64 image map + the catalogue live as JS literals in index.html.
const pimgLit = grab(/const PIMG=(\{.*?\});\n/s, 'PIMG')
const assignLit = grab(/Object\.assign\(PIMG,(\{.*?\})\);\n/s, 'PIMG assign')
const collLit = grab(/const collections=(\[[\s\S]*?\]);/, 'collections')
const catLit = grab(/const CATALOG=(\{[\s\S]*?\n\});/, 'CATALOG')

// Evaluate them (they only build plain data). collections/CATALOG reference PIMG.
const PIMG = new Function('return (' + pimgLit + ')')()
Object.assign(PIMG, new Function('return (' + assignLit + ')')())
const collections = new Function('PIMG', 'return (' + collLit + ')')(PIMG)
const CATALOG = new Function('PIMG', 'return (' + catLit + ')')(PIMG)

// Reverse-map data-URL -> image key so we can name category covers.
const urlToKey = {}
for (const k of Object.keys(PIMG)) urlToKey[PIMG[k]] = k

const categories = collections.map((c, i) => ({
  key: c.id,
  title: c.t,
  tagline: (CATALOG[c.id] || {}).ek || '',
  order: i,
  cover: urlToKey[c.img] || null,
}))

const products = []
for (const c of collections) {
  const cat = CATALOG[c.id]
  if (!cat) continue
  cat.products.forEach((p, pi) => {
    products.push({
      code: p.id,
      category: c.id,
      name: p.name,
      price: p.price,
      oldPrice: p.old || null,
      badge: p.badge || null,
      rating: p.rating || 0,
      reviewCount: p.rc || 0,
      description: p.desc || '',
      specs: (p.specs || []).map((s) => ({label: s[0], value: s[1]})),
      reviews: (p.reviews || []).map((r) => ({
        name: r.n,
        location: r.loc,
        rating: r.r,
        text: r.t,
      })),
      image: urlToKey[p.img] || p.id, // image key == product code
      order: pi,
    })
  })
}

mkdirSync(join(here, '..', 'seed'), {recursive: true})
writeFileSync(
  join(here, '..', 'seed', 'seed-data.json'),
  JSON.stringify({categories, products, images: PIMG}),
)
console.log(
  `Wrote seed-data.json: ${categories.length} categories, ${products.length} products, ${
    Object.keys(PIMG).length
  } images.`,
)

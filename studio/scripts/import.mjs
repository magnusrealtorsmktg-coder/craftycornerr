// One-time import: uploads every product photo to Sanity and creates the
// category + product documents from studio/seed/seed-data.json.
//
// Run once, after you've created your Sanity project:
//   SANITY_PROJECT_ID=xxxx SANITY_TOKEN=yyyy npm run import
// (See .env.example. The token needs "Editor" permissions.)
import {createClient} from '@sanity/client'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const seed = JSON.parse(readFileSync(join(here, '..', 'seed', 'seed-data.json'), 'utf8'))

const projectId = process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_DATASET || 'production'
const token = process.env.SANITY_TOKEN

if (!projectId || !token) {
  console.error(
    'Missing config. Set SANITY_PROJECT_ID and SANITY_TOKEN (see studio/.env.example).',
  )
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false})

const dataURLtoBuffer = (d) => Buffer.from(d.split(',')[1], 'base64')

async function run() {
  // 1) Upload images, remembering the asset id for each key.
  const assetByKey = {}
  const keys = Object.keys(seed.images)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    process.stdout.write(`Uploading image ${i + 1}/${keys.length} (${key})... `)
    const asset = await client.assets.upload('image', dataURLtoBuffer(seed.images[key]), {
      filename: `${key}.jpg`,
    })
    assetByKey[key] = asset._id
    console.log('done')
  }

  const imageRef = (key) =>
    assetByKey[key]
      ? {_type: 'image', asset: {_type: 'reference', _ref: assetByKey[key]}}
      : undefined

  // 2) Build category + product documents with stable ids so re-imports replace.
  const docs = []
  for (const c of seed.categories) {
    docs.push({
      _id: `category.${c.key}`,
      _type: 'category',
      title: c.title,
      key: c.key,
      tagline: c.tagline,
      order: c.order,
      ...(c.cover && imageRef(c.cover) ? {coverImage: imageRef(c.cover)} : {}),
    })
  }
  for (const p of seed.products) {
    docs.push({
      _id: `product.${p.code}`,
      _type: 'product',
      name: p.name,
      code: p.code,
      category: {_type: 'reference', _ref: `category.${p.category}`},
      price: p.price,
      ...(p.oldPrice ? {oldPrice: p.oldPrice} : {}),
      ...(p.badge ? {badge: p.badge} : {}),
      rating: p.rating,
      reviewCount: p.reviewCount,
      description: p.description,
      specs: p.specs.map((s, i) => ({_key: `s${i}`, ...s})),
      reviews: p.reviews.map((r, i) => ({_key: `r${i}`, ...r})),
      order: p.order,
      ...(imageRef(p.image) ? {image: imageRef(p.image)} : {}),
    })
  }

  // 3) Commit everything in one transaction.
  const tx = client.transaction()
  docs.forEach((d) => tx.createOrReplace(d))
  await tx.commit()

  console.log(
    `\nImported ${seed.categories.length} categories and ${seed.products.length} products.`,
  )
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

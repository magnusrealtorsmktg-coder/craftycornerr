// Removes the built-in base64 product images from index.html (they now live in
// Sanity). Turns PIMG into an empty map the Sanity loader fills at runtime.
// Run AFTER extract-seed.mjs has captured the images into seed-data.json.
import {readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, '..', '..', 'index.html')
let html = readFileSync(file, 'utf8')
const before = html.length

html = html.replace(/const PIMG=\{.*?\};\n/s, 'let PIMG={};\n')
html = html.replace(/Object\.assign\(PIMG,\{.*?\}\);\n/s, '')
html = html.replace(/img:PIMG\.\w+/g, "img:''")

writeFileSync(file, html)
console.log(
  `index.html: ${(before / 1e6).toFixed(2)} MB -> ${(html.length / 1e6).toFixed(2)} MB`,
)

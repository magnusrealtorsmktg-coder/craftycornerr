# The Crafty Cornerr — Content Studio (Sanity)

This folder is the **admin panel** for the shop. It lets the client add products,
change prices, upload photos, edit descriptions/reviews — with no code. The
website (`../index.html`) reads its products from here automatically.

```
Client edits in Studio  ──►  Sanity (cloud database)  ──►  index.html loads it on page open
```

---

## Part A — One-time setup (developer, ~15 min)

You only do this once.

### 1. Create a Sanity project (free)
- Go to https://www.sanity.io/manage and sign in (Google/GitHub is fine).
- Create a new project. Name it "The Crafty Cornerr". Dataset: **production**.
- Copy the **Project ID** (looks like `a1b2c3d4`).

### 2. Put the Project ID in three places
- `sanity.config.ts`  → `projectId: '...'`
- `sanity.cli.ts`     → `projectId: '...'`
- `../index.html`     → find `const SANITY={projectId:'...'` and paste it there

### 3. Install and run the Studio locally
```bash
cd studio
npm install
npm run dev        # opens http://localhost:3333
```
Log in — you'll see an empty Studio.

### 4. Import the existing 22 products (one-time)
This uploads the current photos and creates all products so the client starts
with a full catalogue instead of a blank slate.

- In sanity.io/manage → your project → **API → Tokens → Add API token**,
  name it "import", permission **Editor**, and copy the token.
- Then run:
```bash
cp .env.example .env      # then edit .env and paste your Project ID + token
npm run extract-seed      # rebuilds seed/seed-data.json from index.html (already done once)
npm run import            # uploads images + creates the 22 products
```
Refresh the Studio — all products and categories are now there.

> `seed/seed-data.json` is a one-time snapshot of the old built-in products.
> After a successful import you can delete it and the `scripts/` folder if you like.

### 5. Let the website read from Sanity (read token + CORS)
New Sanity projects keep documents **private** even when the dataset is marked
"public" (only images are served publicly), so the site needs a read-only token.

- sanity.io/manage → project → **API → Tokens → Add API token**:
  name it `web read`, permission **Viewer** (read-only), and copy it.
- Paste it into `../index.html` → the `SANITY` block → `token:'...'`.
  (This token can only READ the same catalogue shown on the page — it cannot edit
  anything — so it's safe to ship in the site.)
- sanity.io/manage → project → **API → CORS origins → Add** (leave "Allow credentials" **off**):
  - `http://localhost:8000` (local preview)
  - your live site URL, e.g. `https://the-crafty-cornerr.netlify.app`

### 6. Deploy the Studio so the client can use it from anywhere
```bash
npm run deploy     # pick a name -> gives https://<name>.sanity.studio
```
Send the client that URL + invite them (sanity.io/manage → **Members → Invite**).

### 7. Publish the website
`../index.html` now has your Project ID baked in. Deploy the folder as usual
(Netlify). The site fetches live products on every load.

---

## Part B — Everyday use (client, no setup)

1. Go to your Studio URL (`https://<name>.sanity.studio`) and log in.
2. **Add a product:** `Product → +`, fill in name, upload a photo, set price &
   category, then **Publish**.
3. **Change a price:** open the product, edit **Price**, **Publish**.
4. **Put something on sale:** set **Old price** to the original — it shows
   struck-through next to the new price.
5. Changes appear on the website the next time it's loaded (within a minute).

Fields explained:
- **Product code** — a short id like `pk1`. Set once; don't change it later.
- **Badge** — optional "Bestseller / New / Loved" tag on the card.
- **Display order** — lower numbers show first.

---

## Part C — Hero photos & review moderation

### Website theme (Site Settings)
In **Site Settings** → **Website theme**, choose **Default** or **Diwali (festive gold & red)**
and Publish. The whole site re-colours for all visitors. Switch back to Default after the season.
(First-pass palette — the festive design will be refined.)

### Hero photos (Site Settings)
In the Studio, open **Site Settings** (top of the list):
- **Hero cards** — pick up to 4 products; each floating card in the top hero shows
  that product's photo, name and price.
- **Mobile hero background** — upload the big background photo for the mobile home screen.

Leave it empty and the site uses its built-in hero.

### Reviews are moderated (pending → approved)
Visitors can submit a review on any product page. Submitted reviews arrive in the
Studio under **Reviews — pending** and are **hidden** from the site. To publish one,
open it and turn **Approved** on (or move it — it then shows under **Reviews — approved**).
Only approved reviews appear on the website. (The original curated reviews live on each
product and always show.)

### One-time server setup for review submissions
Submissions are saved by a small Netlify function using a **secret write token** that
lives only on the server (never in the site code):

1. sanity.io/manage → project `c8746siu` → **API → Tokens → Add API token**:
   name `netlify write`, permission **Editor**, copy it.
2. Netlify → project **the-crafty-cornerr** → **Site configuration → Environment variables → Add**:
   - Key: `SANITY_WRITE_TOKEN`
   - Value: *(paste the Editor token)*
3. Redeploy the site (Netlify → Deploys → **Trigger deploy**, or `netlify deploy --prod`).

Until this token is set, the review form thanks the visitor but nothing is saved.
Keep this Editor token **only** in Netlify's env — never in `index.html`.

## Part D — Taking payments (Razorpay)

### Marking something sold out
Every product has an **Available to buy** switch. Turn it **off** and the piece still
shows on the website, but with "Temporarily unavailable" instead of a buy button —
useful for a one-off that has sold or is being remade. Turn it back on when it's ready.

### Where orders arrive
A paid order does two things at once:
1. It appears in the Studio under **Orders — to pack**, with the full shipping
   address, the items, and the amount paid.
2. It is emailed to the studio as a packing slip.

Open the order, copy the address onto the courier slip, then set **Status** to
**📦 Shipped** and put the tracking number in **Courier / tracking note**.

Orders stuck on **⏳ Awaiting payment** are people who opened the payment window and
closed it — they were never charged, and you can ignore them.

The money/address fields are locked on purpose: they are written straight from the
payment and must match what the customer actually paid.

### One-time setup (developer)
In Netlify → **Site configuration → Environment variables**, add:

| Key | Value | Where it comes from |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` (later `rzp_live_…`) | Razorpay → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | the matching secret | shown **once** when the key is generated |
| `SANITY_WRITE_TOKEN` | an Editor token | sanity.io/manage → API → Tokens |

Redeploy after adding them. Until `RAZORPAY_*` are set the checkout politely refuses
and sends people to WhatsApp; until `SANITY_WRITE_TOKEN` is set it refuses too, because
it cannot verify prices against the catalogue and will not guess.

Test with Razorpay in **Test Mode** first — card `4111 1111 1111 1111`, any future
expiry and CVV, takes no real money. Swap in the live keys only once that works.

### Customer receipts
Turn on Razorpay → **Settings → Configuration → Email notifications** so the customer
gets their own payment receipt. The website also shows the order number on screen
straight after payment.

## How it fails safe
If Sanity is ever unreachable, or before the Project ID is set, the site simply
shows its built-in starter text (prices/names) — it never shows a broken page.
Product **photos** come from Sanity, so they appear once step A is complete.

## Files
| File | What it is |
|------|-----------|
| `sanity.config.ts` | Studio configuration (project id, plugins, schema) |
| `schemaTypes/category.ts` | The six shop categories |
| `schemaTypes/product.ts` | A product (name, price, image, specs, reviews…) |
| `schemaTypes/order.ts` | A customer order, written by the website's payment functions |
| `scripts/extract-seed.mjs` | Snapshots old products out of index.html |
| `scripts/import.mjs` | One-time import of those products into Sanity |
| `scripts/strip-images.mjs` | (already run) removed base64 images from index.html |

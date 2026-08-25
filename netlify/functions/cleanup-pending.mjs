// Scheduled sweep of abandoned checkouts.
//
// create-order writes a `pending` order before the payment modal opens, so every
// closed tab and every failed card leaves a document behind. Those never become
// sales and never get cleaned up, so over time they outnumber real orders — both
// clutter in the Studio and dead weight against the dataset's document limit.
//
// Scheduled from netlify.toml (@daily). Safe by construction: it only ever
// touches documents that are still `pending` AND older than the grace window, so
// a real payment mid-flight can never be deleted out from under a customer.
import {json, sanityQuery, sanityMutate} from './lib/shop.mjs'

// Generous on purpose. A customer who opens the payment modal, goes to fetch
// their card and comes back an hour later must still be able to pay.
const GRACE_HOURS = 48
const MAX_PER_RUN = 200

export async function handler() {
  const cutoff = new Date(Date.now() - GRACE_HOURS * 3600 * 1000).toISOString()

  let stale
  try {
    stale = await sanityQuery(
      '*[_type == "order" && status == "pending" && placedAt < $cutoff][0...$max]{_id, orderNumber}',
      {cutoff, max: MAX_PER_RUN},
    )
  } catch (e) {
    console.error('cleanup query failed:', e.message)
    return json(500, {error: 'query failed'})
  }

  if (!stale || !stale.length) return json(200, {ok: true, deleted: 0})

  try {
    await sanityMutate(stale.map((o) => ({delete: {id: o._id}})))
  } catch (e) {
    console.error('cleanup delete failed:', e.message)
    return json(500, {error: 'delete failed'})
  }

  console.log(`cleaned ${stale.length} abandoned checkout(s) older than ${GRACE_HOURS}h`)
  return json(200, {ok: true, deleted: stale.length})
}

import {defineType, defineField} from 'sanity'

// A customer order. These are created by the website's Netlify functions, never
// by hand — which is why the money/identity fields are read-only in the Studio.
// The one thing the client DOES change here is `status`, as they pack and ship.
//
// Lifecycle: create-order.mjs writes the doc as `pending` before the payment
// modal opens, verify-payment.mjs flips it to `paid` once Razorpay's signature
// checks out. A doc stuck on `pending` means the customer abandoned the payment
// (or it failed) — those are safe to ignore, they were never charged.
export default defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order number',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      initialValue: 'pending',
      options: {
        list: [
          {title: '⏳ Awaiting payment', value: 'pending'},
          {title: '💰 Paid — needs packing', value: 'paid'},
          {title: '📦 Shipped', value: 'shipped'},
          {title: '✅ Delivered', value: 'delivered'},
          {title: '✖ Cancelled / refunded', value: 'cancelled'},
        ],
        layout: 'radio',
      },
    }),
    // Filling these two in and setting status to "Shipped" is what emails the
    // customer their tracking details — see netlify/functions/notify-shipped.mjs.
    defineField({
      name: 'courier',
      title: 'Courier',
      type: 'string',
      options: {
        list: [
          {title: 'Delhivery', value: 'delhivery'},
          {title: 'DTDC', value: 'dtdc'},
          {title: 'Blue Dart', value: 'bluedart'},
          {title: 'India Post', value: 'indiapost'},
          {title: 'Shiprocket', value: 'shiprocket'},
          {title: 'Other', value: 'other'},
        ],
      },
      description: 'Who is carrying the parcel. Used to build the tracking link in the email.',
    }),
    defineField({
      name: 'trackingNumber',
      title: 'Tracking number',
      type: 'string',
      description:
        'The AWB / consignment number. Fill this in BEFORE setting the status to Shipped — the customer’s email includes it.',
    }),
    defineField({
      name: 'trackingNote',
      title: 'Private note',
      type: 'string',
      description: 'Anything for your own reference. The customer never sees this.',
    }),
    defineField({
      name: 'shippedNotifiedAt',
      title: 'Shipping email sent',
      type: 'datetime',
      readOnly: true,
      description:
        'Stamped automatically when the customer is emailed their tracking details. Its presence is what stops a second email being sent if this order is edited again.',
    }),

    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            {name: 'code', title: 'Product code', type: 'string'},
            {name: 'name', title: 'Name', type: 'string'},
            {name: 'qty', title: 'Qty', type: 'number'},
            {name: 'price', title: 'Unit price (₹)', type: 'number'},
          ],
          preview: {
            select: {name: 'name', qty: 'qty', price: 'price'},
            prepare({name, qty, price}) {
              return {title: `${qty} × ${name}`, subtitle: '₹' + (price || 0) * (qty || 0)}
            },
          },
        },
      ],
    }),

    defineField({name: 'subtotal', title: 'Subtotal (₹)', type: 'number', readOnly: true}),
    defineField({name: 'shipping', title: 'Shipping (₹)', type: 'number', readOnly: true}),
    defineField({name: 'total', title: 'Total paid (₹)', type: 'number', readOnly: true}),

    defineField({name: 'customerName', title: 'Customer name', type: 'string', readOnly: true}),
    defineField({name: 'customerEmail', title: 'Email', type: 'string', readOnly: true}),
    defineField({name: 'customerPhone', title: 'Phone', type: 'string', readOnly: true}),
    defineField({
      name: 'verifiedPhone',
      title: 'Phone (from Razorpay)',
      type: 'string',
      readOnly: true,
      description:
        'The contact Razorpay processed the payment with. If this differs from the phone above, try both — this one is tied to the payment instrument.',
    }),

    defineField({
      name: 'address',
      title: 'Shipping address',
      type: 'text',
      rows: 4,
      readOnly: true,
      description: 'Exactly as the customer typed it — copy this onto the courier slip.',
    }),
    defineField({name: 'pincode', title: 'PIN code', type: 'string', readOnly: true}),

    defineField({
      name: 'razorpayOrderId',
      title: 'Razorpay order id',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'razorpayPaymentId',
      title: 'Razorpay payment id',
      type: 'string',
      readOnly: true,
      description: 'Search this in the Razorpay dashboard to find the payment / issue a refund.',
    }),

    defineField({name: 'placedAt', title: 'Placed at', type: 'datetime', readOnly: true}),
    defineField({name: 'paidAt', title: 'Paid at', type: 'datetime', readOnly: true}),
  ],

  orderings: [
    {title: 'Newest first', name: 'newest', by: [{field: 'placedAt', direction: 'desc'}]},
  ],

  preview: {
    select: {
      number: 'orderNumber',
      name: 'customerName',
      total: 'total',
      status: 'status',
      placedAt: 'placedAt',
    },
    prepare({number, name, total, status, placedAt}) {
      const icon =
        {pending: '⏳', paid: '💰', shipped: '📦', delivered: '✅', cancelled: '✖'}[status] || '•'
      const when = placedAt ? new Date(placedAt).toLocaleDateString('en-IN') : ''
      return {
        title: `${icon} ${number || 'Order'} — ${name || 'Guest'}`,
        subtitle: `₹${total || 0}${when ? ' · ' + when : ''}`,
      }
    },
  },
})

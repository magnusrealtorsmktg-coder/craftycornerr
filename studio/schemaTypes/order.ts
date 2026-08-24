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
    defineField({
      name: 'trackingNote',
      title: 'Courier / tracking note',
      type: 'string',
      description: 'Free text for your own reference — courier name and tracking number.',
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

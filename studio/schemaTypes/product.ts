import {defineType, defineField} from 'sanity'

// A single product. This is what the client adds / edits day-to-day:
// add a product, upload a photo, set the price. The website updates
// automatically the next time it loads.
export default defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'code',
      title: 'Product code',
      type: 'string',
      description:
        'Short unique id used in links & the cart, e.g. "pk1". Set it once and leave it — changing it loses saved carts/links.',
      validation: (r) =>
        r
          .required()
          .regex(/^[a-z0-9]+$/, {name: 'lowercase letters & numbers only'}),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{type: 'category'}],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'image',
      title: 'Main image',
      type: 'image',
      options: {hotspot: true},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'price',
      title: 'Price (₹)',
      type: 'number',
      validation: (r) => r.required().min(0),
    }),
    defineField({
      name: 'oldPrice',
      title: 'Old price (₹, optional)',
      type: 'number',
      description: 'Shown struck-through beside the price. Leave empty for no discount.',
      validation: (r) => r.min(0),
    }),
    defineField({
      name: 'available',
      title: 'Available to buy',
      type: 'boolean',
      initialValue: true,
      description:
        'ON = the Buy / Add to cart button works. OFF = the product still shows on the site, but with "Temporarily unavailable" instead of a buy button. Use this when a handmade piece is sold out or being remade.',
    }),
    defineField({
      name: 'badge',
      title: 'Badge',
      type: 'string',
      description: 'Optional tag shown on the card.',
      options: {
        list: ['Bestseller', 'New', 'Loved'],
      },
    }),
    defineField({
      name: 'rating',
      title: 'Rating (0–5)',
      type: 'number',
      initialValue: 5,
      validation: (r) => r.min(0).max(5),
    }),
    defineField({
      name: 'reviewCount',
      title: 'Number of reviews',
      type: 'number',
      initialValue: 0,
      validation: (r) => r.min(0),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'specs',
      title: 'Specifications',
      type: 'array',
      description: 'Label / value rows shown on the product page (Size, Material, Care, …).',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'label', title: 'Label', type: 'string'},
            {name: 'value', title: 'Value', type: 'string'},
          ],
          preview: {select: {title: 'label', subtitle: 'value'}},
        },
      ],
    }),
    defineField({
      name: 'reviews',
      title: 'Customer reviews',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'name', title: 'Name', type: 'string'},
            {name: 'location', title: 'Location', type: 'string'},
            {name: 'rating', title: 'Rating (0–5)', type: 'number', validation: (r) => r.min(0).max(5)},
            {name: 'text', title: 'Review', type: 'text', rows: 2},
          ],
          preview: {select: {title: 'name', subtitle: 'text'}},
        },
      ],
    }),
    defineField({
      name: 'order',
      title: 'Display order',
      type: 'number',
      description: 'Lower numbers appear first within the category.',
      initialValue: 0,
    }),
  ],
  orderings: [
    {title: 'Display order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]},
    {title: 'Price, high → low', name: 'priceDesc', by: [{field: 'price', direction: 'desc'}]},
  ],
  preview: {
    select: {title: 'name', price: 'price', media: 'image', available: 'available'},
    prepare({title, price, media, available}) {
      const rupees = price != null ? '₹' + price : ''
      // `available` is undefined on documents created before this field existed —
      // those are treated as available, same as the runtime site does.
      const sold = available === false ? ' · ⛔ Temporarily unavailable' : ''
      return {title, subtitle: rupees + sold, media}
    },
  },
})

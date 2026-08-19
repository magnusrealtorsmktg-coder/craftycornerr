import {defineType, defineField} from 'sanity'

// A customer review. Reviews submitted from the website arrive here as
// PENDING (approved = false). They only appear on the site once the client
// turns "Approved" on.
export default defineType({
  name: 'review',
  title: 'Review',
  type: 'document',
  fields: [
    defineField({
      name: 'approved',
      title: 'Approved (show on website)',
      type: 'boolean',
      description: 'Off = pending / hidden. Turn on to publish this review on the site.',
      initialValue: false,
    }),
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (r) => r.required(),
    }),
    defineField({name: 'name', title: 'Name', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'location', title: 'Location', type: 'string'}),
    defineField({
      name: 'rating',
      title: 'Rating (1–5)',
      type: 'number',
      initialValue: 5,
      validation: (r) => r.required().min(1).max(5),
    }),
    defineField({name: 'text', title: 'Review', type: 'text', rows: 3, validation: (r) => r.required()}),
    defineField({
      name: 'submittedAt',
      title: 'Submitted',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  orderings: [
    {title: 'Newest first', name: 'newest', by: [{field: 'submittedAt', direction: 'desc'}]},
  ],
  preview: {
    select: {name: 'name', text: 'text', approved: 'approved', rating: 'rating', product: 'product.name'},
    prepare({name, text, approved, rating, product}) {
      return {
        title: `${approved ? '✅' : '🕓'} ${name || '—'} · ${rating || '?'}★`,
        subtitle: `${product ? product + ' — ' : ''}${text || ''}`,
      }
    },
  },
})

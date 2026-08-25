import {defineType, defineField} from 'sanity'

// A custom-order enquiry from the #custom form on the website.
//
// These used to exist only as a Web3Forms email — no record, no status, no way
// to tell whether anyone replied. A lead that scrolled off the first screen of
// Gmail was simply lost. Now the document is written first and the email is a
// notification on top of it, so an email failure costs an alert, not the lead.
//
// Deliberately kept separate from `order`: an order is paid and needs packing,
// an enquiry is unpaid and needs a reply. Mixing them into one queue would make
// "what do I pack today?" a filtering exercise.
export default defineType({
  name: 'enquiry',
  title: 'Custom enquiry',
  type: 'document',
  fields: [
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      initialValue: 'new',
      options: {
        list: [
          {title: '✉️ New — needs a reply', value: 'new'},
          {title: '💬 Quoted — waiting on customer', value: 'quoted'},
          {title: '✅ Closed', value: 'closed'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'note',
      title: 'Your notes',
      type: 'text',
      rows: 3,
      description: 'What you quoted, what they said — anything you want to remember.',
    }),

    defineField({name: 'name', title: 'Name', type: 'string', readOnly: true}),
    defineField({name: 'phone', title: 'Phone', type: 'string', readOnly: true}),
    defineField({name: 'email', title: 'Email', type: 'string', readOnly: true}),
    defineField({name: 'item', title: 'Interested in', type: 'string', readOnly: true}),
    defineField({name: 'message', title: 'Their message', type: 'text', rows: 4, readOnly: true}),
    defineField({name: 'submittedAt', title: 'Received', type: 'datetime', readOnly: true}),
  ],

  orderings: [
    {title: 'Newest first', name: 'newest', by: [{field: 'submittedAt', direction: 'desc'}]},
  ],

  preview: {
    select: {name: 'name', item: 'item', status: 'status', at: 'submittedAt'},
    prepare({name, item, status, at}) {
      const icon = {new: '✉️', quoted: '💬', closed: '✅'}[status] || '•'
      const when = at ? new Date(at).toLocaleDateString('en-IN') : ''
      return {
        title: `${icon} ${name || 'Someone'}`,
        subtitle: [item, when].filter(Boolean).join(' · '),
      }
    },
  },
})

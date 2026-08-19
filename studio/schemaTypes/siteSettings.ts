import {defineType, defineField} from 'sanity'

// A single "Site Settings" document (there's only ever one). Lets the client
// control the homepage hero without touching code.
export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'theme',
      title: 'Website theme',
      type: 'string',
      description: 'Switch the whole site’s look for a festive season, then set back to "Default" after.',
      options: {
        list: [
          {title: 'Default', value: 'default'},
          {title: 'Diwali (festive gold & red)', value: 'diwali'},
          {title: 'Ganpati (vermilion, saffron & durva green)', value: 'ganpati'},
        ],
        layout: 'radio',
      },
      initialValue: 'default',
    }),
    defineField({
      name: 'heroProducts',
      title: 'Hero cards — featured products (up to 4)',
      type: 'array',
      description:
        'The floating cards in the top hero (desktop). Pick up to 4 products; each card shows that product’s photo, name and price.',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      validation: (r) => r.max(4),
    }),
    defineField({
      name: 'heroBackground',
      title: 'Mobile hero background photo',
      type: 'image',
      description: 'The large background photo on the mobile home screen (replaces the built-in doorway photo).',
      options: {hotspot: true},
    }),
  ],
  preview: {
    prepare: () => ({title: 'Site Settings'}),
  },
})

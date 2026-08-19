import {defineType, defineField} from 'sanity'

// A product category, e.g. "Peacock Designs". These map 1:1 to the six
// sections on the website. You normally won't add new categories (the site
// styling is tied to the six keys below) — you add PRODUCTS into a category.
export default defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Shown as the category heading, e.g. "Peacock Designs".',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'key',
      title: 'Key (do not change)',
      type: 'string',
      description:
        'Internal id the website uses for colours/styling. Must be one of the six below. Leave as-is.',
      options: {
        list: [
          {title: 'Peacock', value: 'peacock'},
          {title: 'Floral', value: 'floral'},
          {title: 'Corner', value: 'corner'},
          {title: 'Toran & Borders', value: 'border'},
          {title: 'Diyas & Lights', value: 'diya'},
          {title: 'Decorative Flowers', value: 'flowers'},
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
      description: 'Short line under the title, e.g. "regal & bold ✦".',
    }),
    defineField({
      name: 'coverImage',
      title: 'Cover image (homepage card)',
      type: 'image',
      description: 'Optional. If empty, the first product\'s photo is used.',
      options: {hotspot: true},
    }),
    defineField({
      name: 'order',
      title: 'Display order',
      type: 'number',
      description: 'Lower numbers appear first.',
      initialValue: 0,
    }),
  ],
  orderings: [
    {title: 'Display order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'title', subtitle: 'key', media: 'coverImage'},
  },
})

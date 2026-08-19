import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

// Project id from https://www.sanity.io/manage (also set in ../index.html -> SANITY.projectId).
export default defineConfig({
  name: 'default',
  title: 'The Crafty Cornerr',

  projectId: 'c8746siu',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            // Single "Site Settings" document (hero photos etc.)
            S.listItem()
              .title('Site Settings')
              .id('siteSettings')
              .child(S.document().schemaType('siteSettings').documentId('siteSettings')),
            S.divider(),
            S.documentTypeListItem('category').title('Categories'),
            S.documentTypeListItem('product').title('Products'),
            S.divider(),
            // Reviews split so moderation is obvious
            S.listItem()
              .title('Reviews — pending')
              .child(
                S.documentList()
                  .title('Pending reviews')
                  .filter('_type == "review" && approved != true')
                  .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
              ),
            S.listItem()
              .title('Reviews — approved')
              .child(
                S.documentList()
                  .title('Approved reviews')
                  .filter('_type == "review" && approved == true')
                  .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
              ),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})

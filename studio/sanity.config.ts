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
            // Orders — split so the client's daily job ("what do I pack today?")
            // is the first thing they see. Pending = customer never completed
            // payment, so those are noise and live further down.
            S.listItem()
              .title('Orders — to pack')
              .child(
                S.documentList()
                  .title('Paid — needs packing')
                  .filter('_type == "order" && status == "paid"')
                  .defaultOrdering([{field: 'placedAt', direction: 'desc'}]),
              ),
            S.listItem()
              .title('Orders — shipped')
              .child(
                S.documentList()
                  .title('Shipped & delivered')
                  .filter('_type == "order" && status in ["shipped", "delivered"]')
                  .defaultOrdering([{field: 'placedAt', direction: 'desc'}]),
              ),
            S.listItem()
              .title('Orders — all')
              .child(
                S.documentList()
                  .title('All orders')
                  .filter('_type == "order"')
                  .defaultOrdering([{field: 'placedAt', direction: 'desc'}]),
              ),
            S.divider(),
            // Enquiries are unpaid leads — separate queue from orders on purpose.
            S.listItem()
              .title('Enquiries — new')
              .child(
                S.documentList()
                  .title('New enquiries')
                  .filter('_type == "enquiry" && status == "new"')
                  .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
              ),
            S.listItem()
              .title('Enquiries — quoted')
              .child(
                S.documentList()
                  .title('Quoted — waiting on customer')
                  .filter('_type == "enquiry" && status == "quoted"')
                  .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
              ),
            S.listItem()
              .title('Enquiries — all')
              .child(
                S.documentList()
                  .title('All enquiries')
                  .filter('_type == "enquiry"')
                  .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
              ),
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

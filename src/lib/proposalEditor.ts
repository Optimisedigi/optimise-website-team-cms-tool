import { lexicalEditor, TextStateFeature } from '@payloadcms/richtext-lexical'

export const proposalEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    TextStateFeature({
      state: {
        fontSize: {
          'size-sm': { label: 'Small (14px)', css: { 'font-size': '14px' } },
          'size-base': { label: 'Normal (16px)', css: { 'font-size': '16px' } },
          'size-lg': { label: 'Large (20px)', css: { 'font-size': '20px' } },
          'size-xl': { label: 'XL (24px)', css: { 'font-size': '24px' } },
          'size-2xl': { label: '2XL (32px)', css: { 'font-size': '32px' } },
        },
      },
    }),
  ],
})

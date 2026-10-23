import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '16mb',
    },
  },
  redirects: async () => [
    // Blog Prompter — redirect collection routes to the standalone custom page
    {
      source: '/admin/collections/blog-prompts',
      destination: '/admin/blog/prompter',
      permanent: false,
    },
    {
      source: '/admin/collections/blog-prompts/create',
      destination: '/admin/blog/prompter',
      permanent: false,
    },
    {
      source: '/admin/collections/blog-prompts/:id',
      destination: '/admin/blog/prompter',
      permanent: false,
    },
  ],
  // Content Map page lives at /SEO/Topic-association-linking/<client-slug>.
  // Route files are case-sensitive but rewrite sources are not, so this lets
  // any capitalisation (e.g. all lowercase) reach the same page.
  rewrites: async () => ({
    beforeFiles: [
      { source: '/seo/topic-association-linking', destination: '/SEO/Topic-association-linking' },
      { source: '/seo/topic-association-linking/:clientSlug', destination: '/SEO/Topic-association-linking/:clientSlug' },
    ],
    afterFiles: [],
    fallback: [],
  }),
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    },
  ],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })

import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  redirects: async () => [
    // Blog Prompter uses a custom list-view form — redirect create/edit to the list
    {
      source: '/admin/collections/blog-prompts/create',
      destination: '/admin/collections/blog-prompts',
      permanent: false,
    },
    {
      source: '/admin/collections/blog-prompts/:id',
      destination: '/admin/collections/blog-prompts',
      permanent: false,
    },
  ],
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

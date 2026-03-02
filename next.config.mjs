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

import type { GlobalConfig } from 'payload'
import { globalAccess } from '../lib/access'
import { DEFAULT_GLOBAL_BLOG_RULES, DEFAULT_GLOBAL_MARKDOWN_RULES } from '../lib/blog-prompter'

export const BlogSettings: GlobalConfig = {
  slug: 'blog-settings',
  label: 'Blog Settings',
  admin: {
    group: 'Content',
    description: 'Global blog rules and defaults used by Blog Prompter generation.',
  },
  access: globalAccess('blog-settings'),
  fields: [
    {
      name: 'globalBlogRules',
      type: 'textarea',
      defaultValue: DEFAULT_GLOBAL_BLOG_RULES,
      admin: {
        description: 'Rules applied to every generated blog prompt and generated markdown, regardless of client.',
      },
    },
    {
      name: 'globalMarkdownRules',
      type: 'textarea',
      defaultValue: DEFAULT_GLOBAL_MARKDOWN_RULES,
      admin: {
        description: 'Formatting rules applied to every generated blog.',
      },
    },
  ],
}

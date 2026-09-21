import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// 迁移到中央注册表（src/content/blog.meta.yml）后，正文不再携带 frontmatter，
// 元数据一律以注册表为准；schema 放宽为透传，兼容迁移期间的存量 frontmatter。
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({}).passthrough(),
});

export const collections = { blog };

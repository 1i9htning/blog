import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    createdAt: z.union([z.literal('auto'), z.coerce.date()]).nullable().optional(),
    updatedAt: z.union([z.literal('auto'), z.coerce.date()]).nullable().optional(),
  }),
});

export const collections = { blog };

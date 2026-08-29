import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const shanghaiWallTime = /^(\d{4}-\d{2}-\d{2})(?:[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?)?$/;

const frontmatterDate = z.preprocess((value) => {
  if (typeof value !== 'string') return value;

  const match = value.match(shanghaiWallTime);
  if (!match) return value;

  const [, date, hour = '00', minute = '00', second = '00'] = match;
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) {
    return new Date(Number.NaN);
  }

  return `${date}T${hour}:${minute}:${second}+08:00`;
}, z.coerce.date());

const updatedAtHistory = z.array(frontmatterDate)
  .superRefine((dates, context) => {
    for (let index = 1; index < dates.length; index++) {
      if (dates[index].getTime() <= dates[index - 1].getTime()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'updatedAt 必须按时间从早到晚严格排列，且不能重复',
        });
      }
    }
  });

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    /** 来自站外的文章：首次提交仅代表导入，不是创作或更新。 */
    migrated: z.boolean().default(false),
    createdAt: z.union([z.literal('auto'), frontmatterDate]).nullable().optional(),
    updatedAt: z.union([frontmatterDate, updatedAtHistory]).nullable().optional(),
  }).superRefine((data, context) => {
    if (data.migrated && data.createdAt === 'auto') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['createdAt'],
        message: '迁移文章不能使用 createdAt: auto；请填写原始创建时间，或使用 null 表示未知',
      });
    }
  }),
});

export const collections = { blog };

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import { validateRegistry } from './validate';

/** 注册表文件路径（相对仓库根目录），位于 collection glob 范围之外。 */
export const REGISTRY_FILE = 'src/content/blog.meta.yml';

/** 上海墙钟：YYYY-MM-DD[ T]HH:MM[:SS]，按 +08:00 解析。 */
const shanghaiWallTime = /^(\d{4}-\d{2}-\d{2})(?:[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?)?$/;

/**
 * 解析上海墙钟字符串为 epoch 毫秒；非法日历日期（如 2 月 30 日）返回 null。
 * 供注册表与 Git 历史快照共用。
 */
export function parseShanghaiTime(value: string): number | null {
  const match = value.trim().match(shanghaiWallTime);
  if (!match) return null;

  const [, date, hour = '00', minute = '00', second = '00'] = match;
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) return null;

  const timestamp = new Date(`${date}T${hour}:${minute}:${second}+08:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

const registryDate = z.preprocess((value) => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return value;
  const epoch = parseShanghaiTime(value);
  // 非法日期用 NaN Date 让 z.date() 以类型错误拒绝
  return epoch === null ? new Date(Number.NaN) : new Date(epoch);
}, z.date({
  // astro 7 捆绑 zod v4，错误定制用 error 参数
  error: '日期必须是上海墙钟格式 YYYY-MM-DD[ HH:MM[:SS]]，且为合法日历日期',
}));

const registryPostSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  /** 来自站外的文章：首次提交仅代表导入，不是创作或更新。 */
  migrated: z.boolean().default(false),
  createdAt: z.union([z.literal('auto'), registryDate]).nullable().optional(),
  updatedAt: z.union([registryDate, z.array(registryDate)]).nullable().optional(),
  status: z.enum(['active', 'deleted', 'merged']).default('active'),
  mergedInto: z.string().optional(),
  mergedAt: registryDate.optional(),
  deletedAt: registryDate.optional(),
}).superRefine((data, context) => {
  if (data.migrated && data.createdAt === 'auto') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['createdAt'],
      message: '迁移文章不能使用 createdAt: auto；请填写原始创建时间，或使用 null 表示未知',
    });
  }
});

const registryFileSchema = z.object({
  ignoredCommits: z.array(z.string()).default([]),
  posts: z.record(z.string(), registryPostSchema).default({}),
});

export type RegistryPost = z.infer<typeof registryPostSchema>;

export interface Registry {
  /** key 即文章 id（同时是 content entry 的 id）。 */
  posts: Map<string, RegistryPost>;
  /** 不参与更新时间推导与事件生成的 commit hash 列表。 */
  ignoredCommits: string[];
}

let registryCache: Registry | null = null;

/**
 * 同步加载并校验中央注册表，结果在模块级缓存。
 * 文件缺失、YAML 语法错误、schema 违例或同步校验违例都会抛出聚合错误。
 */
export function getRegistry(): Registry {
  if (registryCache !== null) return registryCache;

  let source: string;
  try {
    source = readFileSync(resolve(process.cwd(), REGISTRY_FILE), 'utf8');
  } catch {
    throw new Error(`博客注册表 ${REGISTRY_FILE} 不存在或无法读取；请人工检查并恢复注册表。`);
  }

  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (error) {
    throw new Error(`博客注册表 ${REGISTRY_FILE} 不是合法的 YAML：${(error as Error).message}`);
  }

  const parsed = registryFileSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join('.') || '(根节点)'}：${issue.message}`)
      .join('\n');
    throw new Error(`博客注册表 ${REGISTRY_FILE} 格式校验失败：\n${issues}`);
  }

  const registry: Registry = {
    posts: new Map(Object.entries(parsed.data.posts)),
    ignoredCommits: parsed.data.ignoredCommits,
  };

  const violations = validateRegistry(registry);
  if (violations.length > 0) {
    throw new Error(`博客注册表 ${REGISTRY_FILE} 校验失败：\n${violations.map((violation) => `- ${violation}`).join('\n')}`);
  }

  registryCache = registry;
  return registry;
}

/** 忽略名单（commit hash 集合），用于更新时间推导与事件生成。 */
export function getIgnoredCommits(): Set<string> {
  return new Set(getRegistry().ignoredCommits);
}

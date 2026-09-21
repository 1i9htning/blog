import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Registry } from './registry';

const execFileAsync = promisify(execFile);

const BLOG_DIR = 'src/content/blog';
const postIdPattern = /^[a-z0-9]{6}$/;

/**
 * 注册表的同步校验，返回全部违例（中文描述），由 registry.ts 聚合并抛出。
 * 不抛异常、不做 IO 之外的重活；需要 Git 的校验见 validateIgnoredCommits。
 */
export function validateRegistry(registry: Registry): string[] {
  const violations: string[] = [];
  const blogDir = resolve(process.cwd(), BLOG_DIR);

  for (const [id, post] of registry.posts) {
    // id 必须是 6 位小写字母数字（slug 安全）
    if (!postIdPattern.test(id)) {
      violations.push(`文章 ${id}：id 不合法，必须匹配 ${postIdPattern.source}（6 位小写字母或数字）`);
    }

    const postDir = resolve(blogDir, id);
    if (post.status === 'active') {
      const hasEntry = existsSync(resolve(postDir, 'index.md')) || existsSync(resolve(postDir, 'index.mdx'));
      if (!hasEntry) {
        violations.push(`文章 ${id}：状态为 active，但缺少正文文件 ${BLOG_DIR}/${id}/index.md（或 index.mdx）`);
      }
    } else if (existsSync(postDir)) {
      violations.push(`文章 ${id}：状态为 ${post.status}，但目录 ${BLOG_DIR}/${id}/ 仍然存在`);
    }
  }

  // blog 目录下每个文件夹都必须登记在注册表中，防止“新建未登记”
  if (existsSync(blogDir)) {
    for (const entry of readdirSync(blogDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!registry.posts.has(entry.name)) {
        violations.push(`目录 ${BLOG_DIR}/${entry.name}/ 存在，但注册表中没有 id 为 ${entry.name} 的条目`);
      }
    }
  }

  // merged：必须有 mergedInto，目标存在且为 active，且合并链无环
  for (const [id, post] of registry.posts) {
    if (post.status !== 'merged') continue;
    if (post.mergedInto === undefined || post.mergedInto === '') {
      violations.push(`文章 ${id}：状态为 merged，但缺少 mergedInto 目标`);
      continue;
    }
    const target = registry.posts.get(post.mergedInto);
    if (target === undefined) {
      violations.push(`文章 ${id}：mergedInto 目标 ${post.mergedInto} 在注册表中不存在`);
      continue;
    }
    if (target.status !== 'active') {
      violations.push(`文章 ${id}：mergedInto 目标 ${post.mergedInto} 的状态为 ${target.status}，必须指向 active 文章`);
    }

    const seen = new Set<string>([id]);
    let cursor: string | undefined = post.mergedInto;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        violations.push(`文章 ${id}：mergedInto 合并链存在环（${[...seen, cursor].join(' → ')}）`);
        break;
      }
      seen.add(cursor);
      const node = registry.posts.get(cursor);
      cursor = node?.status === 'merged' ? node.mergedInto : undefined;
    }
  }

  return violations;
}

/**
 * 异步校验忽略名单：每个 hash 必须是一个真实存在的 commit。
 * 构建时可选调用（需要 Git）；返回违例描述列表。
 */
export async function validateIgnoredCommits(ignored: Set<string>): Promise<string[]> {
  const results = await Promise.all([...ignored].map(async (hash) => {
    try {
      const { stdout } = await execFileAsync('git', ['cat-file', '-t', hash]);
      const objectType = stdout.trim();
      return objectType === 'commit' ? null : `忽略名单中的 ${hash} 指向 ${objectType}，不是 commit`;
    } catch {
      return `忽略名单中的 commit ${hash} 在仓库中不存在`;
    }
  }));
  return results.filter((message): message is string => message !== null);
}

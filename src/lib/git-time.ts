import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const modifiedTimesCache = new Map<string, number[]>();
const createdTimeCache = new Map<string, number | null>();
const deletedPostsCache = new Map<string, DeletedGitPost[]>();

export interface DeletedGitPost {
  /** 已删除 Markdown 的 Git 相对路径。 */
  filePath: string;
  /** 删除前文章的标题。 */
  title: string;
  /** 迁移文章的首次提交仅代表导入。 */
  migrated: boolean;
  /** Git 创建时间；迁移文章不从 Git 推断创建时间。 */
  createdAt: number | null;
  /** Git 内容更新时间，按从早到晚排列。 */
  updatedAt: number[];
}

interface DeletedPostFrontmatter {
  title: string;
  migrated: boolean;
  /** undefined 表示省略或 auto；null 表示显式未知。 */
  createdAt: number | null | undefined;
  updatedAt: number[];
}

const shanghaiWallTime = /^(\d{4}-\d{2}-\d{2})(?:[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?)?$/;

function frontmatterBlock(source: string): string {
  return source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function scalarValue(value: string): string {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/);
  return quoted?.[1] ?? quoted?.[2] ?? trimmed;
}

function parseShanghaiTime(value: string): number | null {
  const match = scalarValue(value).match(shanghaiWallTime);
  if (!match) return null;

  const [, date, hour = '00', minute = '00', second = '00'] = match;
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) return null;

  const timestamp = new Date(`${date}T${hour}:${minute}:${second}+08:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseUpdatedTimes(frontmatter: string): number[] {
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => /^updatedAt:\s*/.test(line));
  if (index === -1) return [];

  const value = lines[index].replace(/^updatedAt:\s*/, '').trim();
  const rawTimes = value.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1).split(',')
    : value
      ? [value]
      : lines.slice(index + 1)
        .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1])
        .filter((time): time is string => typeof time === 'string');
  return rawTimes
    .map((time) => parseShanghaiTime(time))
    .filter((time): time is number => time !== null);
}

function parseDeletedPostFrontmatter(source: string, filePath: string): DeletedPostFrontmatter {
  const frontmatter = frontmatterBlock(source);
  const title = frontmatter.match(/^title:\s*(.+?)\s*$/m)?.[1];
  const createdAt = frontmatter.match(/^createdAt:\s*(.+?)\s*$/m)?.[1];
  const parsedCreatedAt = createdAt === undefined ? undefined : scalarValue(createdAt);
  return {
    title: title ? scalarValue(title) : filePath.split('/').at(-1)?.replace(/\.(?:md|mdx)$/, '') ?? '已删除文章',
    migrated: /^migrated:\s*true\s*$/m.test(frontmatter),
    createdAt: parsedCreatedAt === undefined
      ? undefined
      : /^(?:auto|null)$/i.test(parsedCreatedAt)
        ? parsedCreatedAt.toLowerCase() === 'null' ? null : undefined
        : parseShanghaiTime(parsedCreatedAt),
    updatedAt: parseUpdatedTimes(frontmatter),
  };
}

/**
 * 找出当前工作区已不存在、但当前分支历史中曾被删除的文章。
 * 只接受 D 状态；精确重命名（R100）不会被当作删除。
 */
export async function getDeletedGitPosts(): Promise<DeletedGitPost[]> {
  const cacheKey = process.cwd();
  const cached = deletedPostsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const deletedByPath = new Map<string, string>();
  try {
    const { stdout } = await execFileAsync('git', [
      '-c',
      'core.quotepath=false',
      'log',
      '--find-renames=100%',
      '--diff-filter=D',
      '--format=%H',
      '--name-status',
      '--',
      'src/content/blog',
    ]);
    let commit = '';
    for (const line of stdout.split(/\r?\n/)) {
      if (/^[0-9a-f]{40}$/.test(line)) {
        commit = line;
        continue;
      }
      if (!commit || !line.startsWith('D\t')) continue;

      const filePath = line.slice(2);
      if (!filePath.startsWith('src/content/blog/') || !/\.(?:md|mdx)$/.test(filePath)) continue;
      if (existsSync(resolve(process.cwd(), filePath))) continue;
      if (!deletedByPath.has(filePath)) deletedByPath.set(filePath, commit);
    }
  } catch {
    // 没有 Git 历史时，不显示已删除文章的活动。
  }

  const posts = await Promise.all([...deletedByPath].map(async ([filePath, deletedCommit]) => {
    try {
      const { stdout: source } = await execFileAsync('git', ['show', `${deletedCommit}^:${filePath}`]);
      const frontmatter = parseDeletedPostFrontmatter(source, filePath);
      const gitUpdates = await getGitModifiedTimes(filePath);
      const contentUpdateTimes = frontmatter.migrated ? gitUpdates.slice(0, -1) : gitUpdates;
      return {
        filePath,
        title: frontmatter.title,
        migrated: frontmatter.migrated,
        createdAt: frontmatter.migrated
          ? frontmatter.createdAt ?? null
          : frontmatter.createdAt === undefined ? await getGitCreatedTime(filePath) : frontmatter.createdAt,
        updatedAt: [...new Set([...frontmatter.updatedAt, ...contentUpdateTimes])]
          .sort((left, right) => left - right),
      };
    } catch {
      return null;
    }
  }));

  const resolved = posts.filter((post): post is DeletedGitPost => post !== null);
  deletedPostsCache.set(cacheKey, resolved);
  return resolved;
}

export async function getGitModifiedTimes(filePath: string): Promise<number[]> {
  const cached = modifiedTimesCache.get(filePath);
  if (cached !== undefined) return cached;

  let epochMillis: number[] = [];
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      '--follow',
      '--find-renames=100%',
      '--diff-filter=AM',
      '--format=%ct',
      '--',
      filePath,
    ]);
    epochMillis = stdout
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => value * 1000)
      .sort((left, right) => right - left);
  } catch {
    epochMillis = [];
  }

  modifiedTimesCache.set(filePath, epochMillis);
  return epochMillis;
}

export async function getGitCreatedTime(filePath: string): Promise<number | null> {
  const cached = createdTimeCache.get(filePath);
  if (cached !== undefined) return cached;

  let epochMillis: number | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['log', '--reverse', '--format=%ct', '--', filePath]);
    const committedAt = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
    if (Number.isFinite(committedAt) && committedAt > 0) epochMillis = committedAt * 1000;
  } catch {
    epochMillis = null;
  }

  createdTimeCache.set(filePath, epochMillis);
  return epochMillis;
}

import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getContentCommitTimes, getFirstCommitTime } from './git-time';
import { getIgnoredCommits, getRegistry, type RegistryPost } from './registry';
import {
  compareEpochDesc,
  declareUpdatedAt,
  resolveCreatedAt,
  resolveUpdatedAt,
  type ResolvedTime,
  type ResolvedTimeHistory,
} from './time';

export type PostSort = 'created' | 'updated';

export interface PostView {
  id: string;
  title: string;
  description: string | undefined;
  tags: string[];
  migrated: boolean;
  status: 'active' | 'deleted' | 'merged';
  /** status 为 merged 时的合并目标 id。 */
  mergedInto: string | undefined;
  createdAt: ResolvedTime;
  /** 注册表显式时间与 Git 内容更新历史合并后的全部更新时间，从早到晚排列。 */
  updatedAtHistory: ResolvedTimeHistory;
  /** 最新一次更新时间，用于列表排序与文章详情。 */
  updatedAt: ResolvedTime;
}

/** 已删除/已合并文章没有 collection entry，按约定路径合成；磁盘上存在 mdx 则用 mdx。 */
function registryFilePath(id: string): string {
  const mdxPath = `src/content/blog/${id}/index.mdx`;
  return existsSync(resolve(process.cwd(), mdxPath)) ? mdxPath : `src/content/blog/${id}/index.md`;
}

async function fillUpdatedAtFromGit(
  filePath: string | undefined,
  meta: RegistryPost,
  ignore: Set<string>,
): Promise<ResolvedTimeHistory> {
  // 所有文章的首次正文提交都是创建而非更新；显式更新时间不参与 Git 提交过滤。
  const contentUpdateTimes = filePath === undefined
    ? []
    : await getContentCommitTimes(filePath, ignore);
  const timesByEpoch = new Map<number, ResolvedTime>();

  for (const time of resolveUpdatedAt(meta.updatedAt)) timesByEpoch.set(time.value!.getTime(), time);
  for (const epochMillis of contentUpdateTimes) {
    if (!timesByEpoch.has(epochMillis)) {
      timesByEpoch.set(epochMillis, { value: new Date(epochMillis), source: 'auto' });
    }
  }

  const merged = [...timesByEpoch.values()]
    .sort((left, right) => left.value!.getTime() - right.value!.getTime());
  if (merged.length > 0) return merged;
  // 空历史按声明形态区分：显式 null 表示历史不可考，否则是未声明
  return [{ value: null, source: declareUpdatedAt(meta.updatedAt) === 'null' ? 'forbidden' : 'missing' }];
}

async function fillCreatedAtFromGit(
  filePath: string | undefined,
  meta: RegistryPost,
  ignore: Set<string>,
): Promise<ResolvedTime> {
  const resolved = resolveCreatedAt(meta.createdAt);
  if (meta.migrated && (resolved.source === 'auto' || resolved.source === 'missing')) {
    return { value: null, source: 'missing' };
  }
  if (resolved.source !== 'auto' && resolved.source !== 'missing') return resolved;
  if (filePath === undefined) return resolved;
  const epochMillis = await getFirstCommitTime(filePath, ignore);
  if (epochMillis === null) return resolved;
  return { value: new Date(epochMillis), source: resolved.source };
}

async function buildPostView(
  id: string,
  meta: RegistryPost,
  filePath: string | undefined,
  ignore: Set<string>,
): Promise<PostView> {
  const updatedAtHistory = await fillUpdatedAtFromGit(filePath, meta, ignore);
  const createdAt = await fillCreatedAtFromGit(filePath, meta, ignore);
  const createdEpoch = createdAt.value?.getTime();
  if (createdEpoch !== undefined && updatedAtHistory.some((time) => time.value?.getTime() === createdEpoch)) {
    throw new Error(`文章 ${id}（${meta.title}）的创建时间与更新时间冲突：${new Date(createdEpoch).toISOString()}（epoch ${createdEpoch}）`);
  }
  return {
    id,
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    migrated: meta.migrated,
    status: meta.status,
    mergedInto: meta.mergedInto,
    createdAt,
    updatedAtHistory,
    updatedAt: updatedAtHistory[updatedAtHistory.length - 1],
  };
}

export async function toPostView(entry: CollectionEntry<'blog'>): Promise<PostView> {
  const meta = getRegistry().posts.get(entry.id);
  if (meta === undefined) throw new Error(`文章 ${entry.id} 未登记在博客注册表中`);
  return buildPostView(entry.id, meta, entry.filePath, getIgnoredCommits());
}

export async function getPublishedPosts(): Promise<PostView[]> {
  const registry = getRegistry();
  const ignore = getIgnoredCommits();
  const entries = await getCollection('blog');
  const published = entries.filter((entry) => {
    const meta = registry.posts.get(entry.id);
    return meta !== undefined && meta.status === 'active' && !meta.draft;
  });
  return Promise.all(published.map((entry) =>
    buildPostView(entry.id, registry.posts.get(entry.id)!, entry.filePath, ignore)));
}

/** 注册表中的全部条目（含 deleted/merged；它们没有 collection entry，按约定路径合成）。 */
export async function getAllRegistryPosts(): Promise<PostView[]> {
  const registry = getRegistry();
  const ignore = getIgnoredCommits();
  const entries = await getCollection('blog');
  const filePathById = new Map(entries.map((entry) => [entry.id, entry.filePath]));
  return Promise.all([...registry.posts].map(([id, meta]) =>
    buildPostView(id, meta, filePathById.get(id) ?? registryFilePath(id), ignore)));
}

export function postEpoch(post: PostView, sort: PostSort): number | null {
  const value = sort === 'created' ? post.createdAt.value : post.updatedAt.value;
  return value?.getTime() ?? null;
}

export function sortPosts(posts: PostView[], sort: PostSort): PostView[] {
  return [...posts].sort((left, right) => compareEpochDesc(postEpoch(left, sort), postEpoch(right, sort)));
}

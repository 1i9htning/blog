import { getCollection, type CollectionEntry } from 'astro:content';
import { getGitCreatedTime, getGitModifiedTimes } from './git-time';
import {
  compareEpochDesc,
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
  createdAt: ResolvedTime;
  /** 手动时间与 Git 内容更新历史合并后的全部更新时间，从早到晚排列。 */
  updatedAtHistory: ResolvedTimeHistory;
  /** 最新一次更新时间，用于列表排序与文章详情。 */
  updatedAt: ResolvedTime;
}

async function fillUpdatedAtFromGit(
  entry: CollectionEntry<'blog'>,
  resolved: ResolvedTimeHistory,
  migrated: boolean,
): Promise<ResolvedTimeHistory> {
  const gitTimes = entry.filePath ? await getGitModifiedTimes(entry.filePath) : [];
  // Git 历史按从新到旧排列；迁移文章最早的一条内容提交只是导入，不能算更新。
  const contentUpdateTimes = migrated ? gitTimes.slice(0, -1) : gitTimes;
  const timesByEpoch = new Map<number, ResolvedTime>();

  for (const time of resolved) timesByEpoch.set(time.value!.getTime(), time);
  for (const epochMillis of contentUpdateTimes) {
    if (!timesByEpoch.has(epochMillis)) {
      timesByEpoch.set(epochMillis, { value: new Date(epochMillis), source: 'auto' });
    }
  }

  const merged = [...timesByEpoch.values()]
    .sort((left, right) => left.value!.getTime() - right.value!.getTime());
  return merged.length > 0 ? merged : [{ value: null, source: 'missing' }];
}

async function fillCreatedAtFromGit(
  entry: CollectionEntry<'blog'>,
  resolved: ResolvedTime,
  migrated: boolean,
): Promise<ResolvedTime> {
  if (migrated && (resolved.source === 'auto' || resolved.source === 'missing')) {
    return { value: null, source: 'missing' };
  }
  if (resolved.source !== 'auto' && resolved.source !== 'missing') return resolved;
  if (!entry.filePath) return resolved;
  const epochMillis = await getGitCreatedTime(entry.filePath);
  if (epochMillis === null) return resolved;
  return { value: new Date(epochMillis), source: resolved.source };
}

export async function toPostView(entry: CollectionEntry<'blog'>): Promise<PostView> {
  const updatedAtHistory = await fillUpdatedAtFromGit(
    entry,
    resolveUpdatedAt(entry.data.updatedAt),
    entry.data.migrated,
  );
  return {
    id: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    tags: entry.data.tags,
    migrated: entry.data.migrated,
    createdAt: await fillCreatedAtFromGit(entry, resolveCreatedAt(entry.data.createdAt), entry.data.migrated),
    updatedAtHistory,
    updatedAt: updatedAtHistory[updatedAtHistory.length - 1],
  };
}

export async function getPublishedPosts(): Promise<PostView[]> {
  const entries = await getCollection('blog', (entry) => !entry.data.draft);
  return Promise.all(entries.map(toPostView));
}

export function postEpoch(post: PostView, sort: PostSort): number | null {
  const value = sort === 'created' ? post.createdAt.value : post.updatedAt.value;
  return value?.getTime() ?? null;
}

export function sortPosts(posts: PostView[], sort: PostSort): PostView[] {
  return [...posts].sort((left, right) => compareEpochDesc(postEpoch(left, sort), postEpoch(right, sort)));
}

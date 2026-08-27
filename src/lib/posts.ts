import { getCollection, type CollectionEntry } from 'astro:content';
import { getGitModifiedTime } from './git-time';
import { compareEpochDesc, resolveCreatedAt, resolveUpdatedAt, type ResolvedTime } from './time';

export type PostSort = 'created' | 'updated';

export interface PostView {
  id: string;
  title: string;
  description: string | undefined;
  tags: string[];
  createdAt: ResolvedTime;
  updatedAt: ResolvedTime;
}

async function fillUpdatedAtFromGit(entry: CollectionEntry<'blog'>, resolved: ResolvedTime): Promise<ResolvedTime> {
  if (resolved.source !== 'auto' && resolved.source !== 'missing') return resolved;
  if (!entry.filePath) return resolved;
  const epochMillis = await getGitModifiedTime(entry.filePath);
  if (epochMillis === null) return resolved;
  return { value: new Date(epochMillis), source: resolved.source };
}

export async function toPostView(entry: CollectionEntry<'blog'>): Promise<PostView> {
  return {
    id: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    tags: entry.data.tags,
    createdAt: resolveCreatedAt(entry.data.createdAt),
    updatedAt: await fillUpdatedAtFromGit(entry, resolveUpdatedAt(entry.data.updatedAt)),
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

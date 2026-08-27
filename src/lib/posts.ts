import { getCollection, type CollectionEntry } from 'astro:content';
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

export function toPostView(entry: CollectionEntry<'blog'>): PostView {
  return {
    id: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    tags: entry.data.tags,
    createdAt: resolveCreatedAt(entry.data.createdAt),
    updatedAt: resolveUpdatedAt(entry.data.updatedAt),
  };
}

export async function getPublishedPosts(): Promise<PostView[]> {
  const entries = await getCollection('blog', (entry) => !entry.data.draft);
  return entries.map(toPostView);
}

export function postEpoch(post: PostView, sort: PostSort): number | null {
  const value = sort === 'created' ? post.createdAt.value : post.updatedAt.value;
  return value?.getTime() ?? null;
}

export function sortPosts(posts: PostView[], sort: PostSort): PostView[] {
  return [...posts].sort((left, right) => compareEpochDesc(postEpoch(left, sort), postEpoch(right, sort)));
}

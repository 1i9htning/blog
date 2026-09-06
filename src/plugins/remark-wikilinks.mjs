import { existsSync, readdirSync } from 'node:fs';
import { basename, extname, relative, resolve } from 'node:path';

const BLOG_ROOT = resolve(process.cwd(), 'src/content/blog');
const WIKI_LINK = /\[\[([^\[\]|]+?)(?:\|([^\]]+))?\]\]/g;

function findMarkdownFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
      const filePath = resolve(directory, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(filePath);
      return entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name)) ? [filePath] : [];
    });
}

function buildPostIndex() {
  const postsByName = new Map();
  const duplicates = new Map();

  for (const filePath of findMarkdownFiles(BLOG_ROOT)) {
    const name = basename(filePath, extname(filePath));
    const id = relative(BLOG_ROOT, filePath).replaceAll('\\', '/').replace(/\.(?:md|mdx)$/, '');
    const previous = postsByName.get(name);
    if (previous) {
      duplicates.set(name, [...(duplicates.get(name) ?? [previous.filePath]), filePath]);
      continue;
    }

    const encodedId = id.split('/').map(encodeURIComponent).join('/');
    postsByName.set(name, { filePath, url: `/blog/${encodedId}/` });
  }

  if (duplicates.size > 0) {
    const details = [...duplicates.entries()]
      .map(([name, files]) => `  - ${name}: ${files.join(', ')}`)
      .join('\n');
    throw new Error(`Wiki 链接要求博客 Markdown 文件名全局唯一：\n${details}`);
  }

  return postsByName;
}

function replaceLinks(value, postsByName, sourcePath) {
  const nodes = [];
  let previousIndex = 0;

  for (const match of value.matchAll(WIKI_LINK)) {
    const [matched, rawName, rawLabel] = match;
    const startIndex = match.index ?? 0;
    if (startIndex > previousIndex) nodes.push({ type: 'text', value: value.slice(previousIndex, startIndex) });

    const name = rawName.trim().replace(/\.md$/i, '');
    const post = postsByName.get(name);
    if (!post) {
      throw new Error(`无法解析 Wiki 链接 "${matched}"（文件：${sourcePath ?? '未知'}）。请使用 src/content/blog 中某篇文章的唯一文件名。`);
    }

    nodes.push({
      type: 'link',
      url: post.url,
      children: [{ type: 'text', value: (rawLabel ?? name).trim() }],
    });
    previousIndex = startIndex + matched.length;
  }

  if (nodes.length === 0) return null;
  if (previousIndex < value.length) nodes.push({ type: 'text', value: value.slice(previousIndex) });
  return nodes;
}

function isInsideLink(node, context) {
  let parent = context.parent(node);
  while (parent) {
    if (parent.type === 'link' || parent.type === 'linkReference') return true;
    parent = context.parent(parent);
  }
  return false;
}

/**
 * Converts [[file-name]] and [[file-name|label]] into links to blog posts.
 * Blog post filenames are deliberately treated as globally unique identifiers.
 */
export default function wikiLinksPlugin({ fileURL } = {}) {
  const postsByName = buildPostIndex();
  const sourcePath = fileURL?.pathname;

  return {
    name: 'wiki-links',
    text(node, context) {
      if (!node.value.includes('[[') || isInsideLink(node, context)) return;
      const replacement = replaceLinks(node.value, postsByName, sourcePath);
      if (replacement) context.replaceNode(node, replacement);
    },
  };
}

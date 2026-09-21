import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const REGISTRY_FILE = 'src/content/blog.meta.yml';

let postIndexCache = null;

// 自包含注册表读取：satteri 的 markdown 渲染发生在纯 Node 上下文，
// 无法加载 ../lib/registry.ts（其经 Vite 解析的扩展名省略导入与 astro/zod 在纯 Node 下不可用），
// 因此这里只依赖 node 内置模块与 yaml。注册表的完整校验仍由 src/lib/registry.ts 在构建数据层负责。
function getPostIndex() {
  if (postIndexCache !== null) return postIndexCache;
  const source = readFileSync(resolve(process.cwd(), REGISTRY_FILE), 'utf8');
  const raw = parseYaml(source);
  const posts = raw && typeof raw === 'object' ? raw.posts : null;
  postIndexCache = new Map(
    Object.entries(posts && typeof posts === 'object' ? posts : {}).map(([id, meta]) => {
      const record = meta && typeof meta === 'object' ? meta : {};
      return [id, {
        title: typeof record.title === 'string' ? record.title : id,
        status: typeof record.status === 'string' ? record.status : 'active',
      }];
    }),
  );
  return postIndexCache;
}

const WIKI_LINK = /\[\[([^\[\]|]+?)(?:\|([^\]]+))?\]\]/g;

function replaceLinks(value, posts, sourcePath) {
  const nodes = [];
  let previousIndex = 0;

  for (const match of value.matchAll(WIKI_LINK)) {
    const [matched, rawId, rawLabel] = match;
    const startIndex = match.index ?? 0;
    if (startIndex > previousIndex) nodes.push({ type: 'text', value: value.slice(previousIndex, startIndex) });

    const id = rawId.trim();
    const post = posts.get(id);
    if (!post) {
      throw new Error(`无法解析 Wiki 链接 "${matched}"（文件：${sourcePath ?? '未知'}）：文章 ${id} 未登记在博客注册表中。`);
    }
    if (post.status !== 'active') {
      throw new Error(`Wiki 链接 "${matched}"（文件：${sourcePath ?? '未知'}）指向的文章 ${id} 状态为 ${post.status}，对应页面不存在。`);
    }

    nodes.push({
      type: 'link',
      url: `/blog/${id}/`,
      children: [{ type: 'text', value: (rawLabel ?? post.title).trim() }],
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
 * Converts [[id]] and [[id|label]] into links to blog posts.
 * Targets are post ids registered in src/content/blog.meta.yml; the display
 * text defaults to the post's current registry title.
 */
export default function wikiLinksPlugin({ fileURL } = {}) {
  const posts = getPostIndex();
  const sourcePath = fileURL?.pathname;

  return {
    name: 'wiki-links',
    text(node, context) {
      if (!node.value.includes('[[') || isInsideLink(node, context)) return;
      const replacement = replaceLinks(node.value, posts, sourcePath);
      if (replacement) context.replaceNode(node, replacement);
    },
  };
}

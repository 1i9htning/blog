#!/usr/bin/env node
/**
 * new-post.mjs
 *
 * 新建文章：生成 6 位小写字母数字 id，创建 src/content/blog/<id>/index.md 空文件，
 * 并在注册表 src/content/blog.meta.yml 的 posts 末尾追加条目（createdAt: auto）。
 *
 * 用法：node scripts/new-post.mjs "文章标题"
 */
import { getRandomValues } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_ROOT = resolve(REPO_ROOT, 'src/content/blog');
const REGISTRY_PATH = resolve(REPO_ROOT, 'src/content/blog.meta.yml');
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 6;

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(1);
}

const title = process.argv[2]?.trim();
if (!title) fail('用法：node scripts/new-post.mjs "文章标题"');
if (!existsSync(REGISTRY_PATH)) fail('注册表 src/content/blog.meta.yml 不存在，请人工检查并恢复注册表后再创建文章。');

function generateId(taken) {
  for (;;) {
    // 拒绝采样，避免取模偏差；36*7=252 是 256 以内最大的 36 的倍数。
    const bytes = getRandomValues(new Uint8Array(ID_LENGTH * 2));
    let id = '';
    for (const byte of bytes) {
      if (byte >= 252) continue;
      id += ID_ALPHABET[byte % ID_ALPHABET.length];
      if (id.length === ID_LENGTH) break;
    }
    if (id.length === ID_LENGTH && !taken.has(id)) return id;
  }
}

const doc = YAML.parseDocument(readFileSync(REGISTRY_PATH, 'utf8'));
const posts = doc.get('posts');
if (!posts || !(posts instanceof YAML.YAMLMap)) fail('注册表缺少 posts 键值结构。');

// id 既要避开磁盘上已有的文件夹，也要避开注册表中已有的条目。
const taken = new Set(posts.items.map((pair) => String(pair.key?.value ?? pair.key)));
if (existsSync(BLOG_ROOT)) {
  for (const entry of readdirSync(BLOG_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory()) taken.add(entry.name);
  }
}
const id = generateId(taken);

// 直接新建目录与空正文（新文章无需 git mv）。
const postDir = resolve(BLOG_ROOT, id);
mkdirSync(postDir, { recursive: true });
writeFileSync(resolve(postDir, 'index.md'), '');

// 在 posts 末尾追加条目，字段顺序与既有条目保持一致。
const entry = new YAML.YAMLMap();
entry.set('title', title);
const tags = new YAML.YAMLSeq();
tags.flow = true;
entry.set('tags', tags);
entry.set('draft', false);
entry.set('migrated', false);
entry.set('createdAt', 'auto');
entry.set('status', 'active');
posts.set(id, entry);

writeFileSync(REGISTRY_PATH, String(doc));

console.log(`已创建文章：${title}`);
console.log(`  id：${id}`);
console.log(`  正文：src/content/blog/${id}/index.md`);
console.log('  注册表已追加条目（createdAt: auto，将取 Git 首次提交时间）。');

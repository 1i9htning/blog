// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import wikiLinksPlugin from './src/plugins/remark-wikilinks.mjs';

function parseCodeBlockTitle(meta) {
  const match = meta?.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  return match?.[1] ?? match?.[2];
}

function codeBlockTitleTransformer() {
  return {
    name: 'code-block-title',
    pre(node) {
      const title = parseCodeBlockTitle(this.options.meta?.__raw);
      if (title === undefined) return node;
      node.properties = { ...node.properties, 'data-title': title };
      return node;
    },
    code(node) {
      const title = parseCodeBlockTitle(this.options.meta?.__raw);
      if (title === undefined) return node;
      node.properties = { ...node.properties, 'data-title': title };
      return node;
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://blog.li9htning.xyz',
  integrations: [mdx()],
  markdown: {
    processor: satteri({ mdastPlugins: [wikiLinksPlugin] }),
    shikiConfig: {
      themes: {
        light: 'github-light-high-contrast',
        dark: 'github-dark-high-contrast',
      },
      defaultColor: false,
      transformers: [codeBlockTitleTransformer()],
    },
  },
});

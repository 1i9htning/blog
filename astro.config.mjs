// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import wikiLinksPlugin from './src/plugins/remark-wikilinks.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://blog.li9htning.xyz',
  markdown: {
    processor: satteri({ mdastPlugins: [wikiLinksPlugin] }),
    shikiConfig: {
      themes: {
        light: 'github-light-high-contrast',
        dark: 'github-dark-high-contrast',
      },
      defaultColor: false,
    },
  },
});

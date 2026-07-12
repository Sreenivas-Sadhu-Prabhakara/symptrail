// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://sreenivas-sadhu-prabhakara.github.io',
  base: '/symptrail',
  build: {
    // Keep the client island as an external file so it satisfies script-src 'self'.
    inlineStylesheets: 'never',
  },
});

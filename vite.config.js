import { defineConfig } from 'vite';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'knotes';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? `/${repoName}/` : './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
});

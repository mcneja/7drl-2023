import { resolve } from 'path';

export default {
  root: 'src', // Tells Vite to treat `src/` as the app root
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
};
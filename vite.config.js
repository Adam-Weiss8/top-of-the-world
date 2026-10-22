import { defineConfig } from 'vite';
import { queueApi } from './scripts/queue-api.js';

// admin.html is served by the dev server only; the production build contains just the game.
export default defineConfig({
  // Relative asset paths, so the site works from a sub-path like username.github.io/top-of-the-world/.
  base: './',
  plugins: [queueApi()],
});

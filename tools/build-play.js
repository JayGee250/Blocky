// Builds web/play.html: the app as one file with the CSS, engine and app code
// inlined, for previewing where only a single page can be shared. The real app
// is index.html and needs no build.
//   node tools/build-play.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const strip = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

const modules = [
  ...['rng', 'pieces', 'board', 'solver', 'scoring', 'difficulty', 'generator', 'game'].map((n) => `engine/${n}.js`),
  'app/profiles.js', 'app/feedback.js', 'app/main.js',
];
const code = modules.map((path) => `// --- ${path} ---\n${strip(read(path))}`).join('\n');

const html = read('index.html')
  .replace(/^<link rel="(manifest|icon|apple-touch-icon)".*\n/gm, '')
  .replace('<link rel="stylesheet" href="app/app.css">', () => `<style>\n${read('app/app.css')}</style>`)
  .replace('<script type="module" src="app/main.js"></script>', () => `<script>\n(() => {\n${code}\n})();\n</script>`);

mkdirSync(new URL('web/', root), { recursive: true });
writeFileSync(new URL('web/play.html', root), html);
console.log('wrote web/play.html');

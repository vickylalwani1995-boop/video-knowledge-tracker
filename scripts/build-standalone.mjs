// Bundles the app into one self-contained HTML file that opens by double-click (file://),
// no server or install needed. Output: dist/reel2real.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const core = read('core.js').replace(/^export /gm, '');
const app = read('app.js').replace(/^import \{[\s\S]*?\} from '\.\/core\.js';\n/m, '');
if (app.includes("from './core.js'")) throw new Error('could not strip core.js import from app.js');
const icon = `data:image/svg+xml;base64,${Buffer.from(read('icon.svg')).toString('base64')}`;

const html = read('index.html')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace('href="icon.svg"', `href="${icon}"`)
  .replace('src="icon.svg"', `src="${icon}"`)
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">\n${core}\n${app}\n</script>`);

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/reel2real.html', import.meta.url), html);
console.log(`dist/reel2real.html  ${(html.length / 1024).toFixed(1)} KB`);

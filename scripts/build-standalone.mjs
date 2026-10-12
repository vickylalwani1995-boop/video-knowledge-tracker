// Bundles the app into self-contained single HTML files (no server or install needed):
//   dist/reel2real.html      full document — download and double-click (file://)
//   dist/reel2real-web.html  page content only — published as the hosted claude.ai web app
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const core = read('core.js').replace(/^export /gm, '');
const app = read('app.js').replace(/^import \{[\s\S]*?\} from '\.\/core\.js';\n/m, '');
if (app.includes("from './core.js'")) throw new Error('could not strip core.js import from app.js');
const icon = `data:image/svg+xml;base64,${Buffer.from(read('icon.svg')).toString('base64')}`;
const css = read('styles.css');
const script = `<script type="module">\n${core}\n${app}\n</script>`;

const html = read('index.html')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace('href="icon.svg"', `href="${icon}"`)
  .replace('src="icon.svg"', `src="${icon}"`)
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', () => script);

// The hosted viewer supplies doctype/head/body and pads the page for phone safe areas itself.
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const web = `<title>Reel2Real</title>
<style>
${css}
.top { top: env(safe-area-inset-top, 0px); padding-top: 10px; }
</style>
${body.trim()}
`;

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/reel2real.html', import.meta.url), html);
writeFileSync(new URL('../dist/reel2real-web.html', import.meta.url), web);
console.log(`dist/reel2real.html ${(html.length / 1024).toFixed(1)} KB, dist/reel2real-web.html ${(web.length / 1024).toFixed(1)} KB`);

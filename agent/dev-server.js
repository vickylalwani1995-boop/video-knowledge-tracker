// Run the webhook locally: `npm run dev` → http://localhost:3000/api/status
// (Use a tunnel such as `npx localtunnel --port 3000` if you want Meta to reach it before deploying.)
import { createServer } from 'node:http';
import * as whatsapp from './api/whatsapp.js';
import * as cron from './api/cron.js';
import * as status from './api/status.js';
import * as ideas from './api/ideas.js';
import * as reel from './api/reel.js';
import * as app from './api/app.js';

const routes = { '/api/whatsapp': whatsapp, '/api/webhook/whatsapp': whatsapp, '/api/cron': cron, '/api/status': status, '/api/ideas': ideas, '/api/reel': reel, '/api/app': app, '/app': app, '/': app };
const port = Number(process.env.PORT || 3000);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const mod = routes[url.pathname];
  const handler = mod?.[req.method];
  if (!handler) { res.writeHead(404).end('Not found'); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Idea Agent dev server on http://localhost:${port}`));

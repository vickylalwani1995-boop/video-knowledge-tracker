// Private endpoints accept the STATUS_TOKEN as ?token=… or "Authorization: Bearer …".
export function authorized(request, cfg) {
  if (!cfg.statusToken) return false;
  const q = new URL(request.url).searchParams.get('token');
  const h = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return q === cfg.statusToken || h === cfg.statusToken;
}
export const unauthorized = () => Response.json({ error: 'Unauthorized: add ?token=STATUS_TOKEN' }, { status: 401 });

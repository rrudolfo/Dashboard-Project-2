import { importLegacyState, loadDashboardState } from '../../lib/dashboard-state.js';

export async function POST({ request }: { request: Request }) {
  const current = await loadDashboardState();
  if (!current._meta?.allowLegacyImport) {
    return new Response(JSON.stringify({ imported: false, reason: 'already-configured' }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const payload = await request.json().catch(() => null);
  if (!payload?.state) {
    return new Response(JSON.stringify({ imported: false, reason: 'missing-state' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const result = await importLegacyState(payload.state, payload.themeMode || null);
  if (!result.imported) {
    return new Response(JSON.stringify(result), {
      status: 422,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  return new Response(JSON.stringify({ imported: true }), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

import { renderModal } from '../../lib/dashboard-render.js';
import { loadDashboardState } from '../../lib/dashboard-state.js';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8'
};

export async function GET({ request }: { request: Request }) {
  const state = await loadDashboardState();
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');

  let item = null;
  if (type === 'reading' && id) item = state.readingLibrary.find((source) => source.id === id) || null;
  if (type === 'weekly' && id) item = state.weeklyPlan.find((week) => week.id === id) || null;
  if (type === 'prompt' && id) item = state.promptLog.find((entry) => entry.id === id) || null;
  if (type === 'experiment' && id) item = state.experimentLog.find((entry) => entry.id === id) || null;
  if (type === 'link' && id) item = state.links.find((link) => link.id === id) || null;

  return new Response(renderModal(type || '', state, item), {
    headers: HTML_HEADERS
  });
}

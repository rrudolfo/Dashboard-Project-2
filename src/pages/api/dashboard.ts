import {
  MODEL_OPTIONS,
  SOURCE_STATUSES,
  WEEK_RANGE,
  linesToItems,
  mutateDashboardState,
  nowISO,
  parseTags,
  sourceTitleFallback,
  toISO,
  uid
} from '../../lib/dashboard-state.js';
import {
  renderActiveWeekControl,
  renderExperimentSection,
  renderLinksSection,
  renderOverviewSection,
  renderPromptSection,
  renderReadingSection,
  renderStorageStatus,
  renderWeeklySection
} from '../../lib/dashboard-render.js';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8'
};

function withOob(html) {
  const trimmed = html.trim();
  return trimmed.replace(/^<([a-z0-9-]+)/i, '<$1 hx-swap-oob="outerHTML"');
}

function renderSection(section, state) {
  if (section === 'overview') return renderOverviewSection(state);
  if (section === 'reading') return renderReadingSection(state);
  if (section === 'weekly') return renderWeeklySection(state);
  if (section === 'prompts') return renderPromptSection(state);
  if (section === 'experiments') return renderExperimentSection(state);
  return renderLinksSection(state);
}

function parseMilestones(text, previous = []) {
  return linesToItems(text).map((line, index) => {
    const match = line.match(/^\[(x|X| )\]\s*(.+)$/);
    return {
      id: previous[index]?.id || uid(),
      text: (match?.[2] || line).trim(),
      done: !!match && match[1].toLowerCase() === 'x'
    };
  });
}

function buildResponse(state, targetSection, options = {}) {
  const { includeOverview = false, includeWeekly = false, includeLinks = false, clearModal = false } = options;
  const parts = [renderSection(targetSection, state)];

  if (includeOverview && targetSection !== 'overview') parts.push(withOob(renderOverviewSection(state)));
  if (includeWeekly && targetSection !== 'weekly') parts.push(withOob(renderWeeklySection(state)));
  if (includeLinks && targetSection !== 'links') parts.push(withOob(renderLinksSection(state)));

  parts.push(withOob(renderActiveWeekControl(state)));
  parts.push(withOob(renderStorageStatus(state)));
  if (clearModal) parts.push('<div id="modalHost" hx-swap-oob="outerHTML"></div>');

  return new Response(parts.join(''), { headers: HTML_HEADERS });
}

function getIntent(requestUrl, formData) {
  return formData?.get('intent')?.toString() || new URL(requestUrl).searchParams.get('intent') || '';
}

function getId(requestUrl, formData) {
  return formData?.get('id')?.toString() || new URL(requestUrl).searchParams.get('id') || '';
}

export async function POST({ request }: { request: Request }) {
  const formData = await request.formData().catch(() => null);
  const intent = getIntent(request.url, formData);
  const id = getId(request.url, formData);

  if (!intent) {
    return new Response('Missing intent', { status: 400, headers: HTML_HEADERS });
  }

  if (intent === 'overview-save') {
    const state = await mutateDashboardState((draft) => {
      draft.projectOverview.focus = formData?.get('focus')?.toString() || '';
      draft.projectOverview.question = formData?.get('question')?.toString() || '';
      draft.projectOverview.goals = linesToItems(formData?.get('goals')?.toString() || '');
    });
    return buildResponse(state, 'overview');
  }

  if (intent === 'active-week-set') {
    const weekNumber = Number(formData?.get('weekNumber') || WEEK_RANGE[0]);
    const state = await mutateDashboardState((draft) => {
      draft.uiState.activeWeek = weekNumber;
      draft.weeklyPlan.forEach((week) => {
        week.status = week.weekNumber === weekNumber ? 'Active' : week.status === 'Active' ? 'Planned' : week.status;
        week.updatedAt = nowISO();
      });
    });
    return buildResponse(state, 'weekly', { includeOverview: true });
  }

  if (intent === 'reading-filters') {
    const state = await mutateDashboardState((draft) => {
      draft.uiState.filters.reading.query = formData?.get('query')?.toString() || '';
      draft.uiState.filters.reading.status = formData?.get('status')?.toString() || 'All';
      draft.uiState.filters.reading.week = formData?.get('week')?.toString() || 'All';
      draft.uiState.filters.reading.keyOnly = formData?.get('keyOnly') === 'true';
      draft.uiState.filters.reading.sort = formData?.get('sort')?.toString() || 'updatedAt';
    });
    return buildResponse(state, 'reading');
  }

  if (intent === 'reading-save') {
    const state = await mutateDashboardState((draft) => {
      const existingIndex = draft.readingLibrary.findIndex((source) => source.id === id);
      const createdAt = existingIndex >= 0 ? draft.readingLibrary[existingIndex].createdAt : nowISO();
      const next = existingIndex >= 0 ? draft.readingLibrary[existingIndex] : { id: uid(), createdAt, tags: [] };

      next.title = formData?.get('title')?.toString().trim() || sourceTitleFallback(formData?.get('url')?.toString() || '');
      next.author = formData?.get('author')?.toString() || '';
      next.url = formData?.get('url')?.toString().trim() || '';
      next.status = formData?.get('status')?.toString() || SOURCE_STATUSES[0];
      next.isKey = formData?.get('isKey') === 'true';
      next.notes = formData?.get('notes')?.toString() || '';
      next.relatedWeek = Number(formData?.get('relatedWeek') || draft.uiState.activeWeek);
      next.accessedDate = toISO(formData?.get('accessedDate')?.toString() || '', nowISO());
      next.updatedAt = nowISO();

      if (existingIndex >= 0) draft.readingLibrary[existingIndex] = next;
      else draft.readingLibrary.unshift(next);
    });
    return buildResponse(state, 'reading', { includeOverview: true, clearModal: true });
  }

  if (intent === 'reading-delete') {
    const state = await mutateDashboardState((draft) => {
      draft.readingLibrary = draft.readingLibrary.filter((source) => source.id !== id);
    });
    return buildResponse(state, 'reading', { includeOverview: true });
  }

  if (intent === 'weekly-save') {
    const state = await mutateDashboardState((draft) => {
      const week = draft.weeklyPlan.find((entry) => entry.id === id);
      if (!week) return;
      week.owner = formData?.get('owner')?.toString() || '';
      week.status = formData?.get('status')?.toString() || 'Planned';
      week.milestones = parseMilestones(formData?.get('milestones')?.toString() || '', week.milestones);
      week.deliverables = formData?.get('deliverables')?.toString() || '';
      week.risks = formData?.get('risks')?.toString() || '';
      week.updatedAt = nowISO();

      if (week.status === 'Active') {
        draft.uiState.activeWeek = week.weekNumber;
        draft.weeklyPlan.forEach((entry) => {
          if (entry.id !== week.id && entry.status === 'Active') entry.status = 'Planned';
        });
      }
    });
    return buildResponse(state, 'weekly', { includeOverview: true, clearModal: true });
  }

  if (intent === 'weekly-set-active') {
    const state = await mutateDashboardState((draft) => {
      const target = draft.weeklyPlan.find((entry) => entry.id === id);
      if (!target) return;
      draft.uiState.activeWeek = target.weekNumber;
      draft.weeklyPlan.forEach((entry) => {
        entry.status = entry.id === target.id ? 'Active' : entry.status === 'Active' ? 'Planned' : entry.status;
        entry.updatedAt = nowISO();
      });
    });
    return buildResponse(state, 'weekly', { includeOverview: true });
  }

  if (intent === 'weekly-mark-done') {
    const state = await mutateDashboardState((draft) => {
      const target = draft.weeklyPlan.find((entry) => entry.id === id);
      if (!target) return;
      target.status = 'Done';
      target.updatedAt = nowISO();

      const active = draft.weeklyPlan.find((entry) => entry.status === 'Active');
      if (!active) {
        const fallback = draft.weeklyPlan.find((entry) => entry.status !== 'Done') || draft.weeklyPlan[0];
        if (fallback) {
          fallback.status = 'Active';
          fallback.updatedAt = nowISO();
          draft.uiState.activeWeek = fallback.weekNumber;
        }
      }
    });
    return buildResponse(state, 'weekly', { includeOverview: true });
  }

  if (intent === 'prompt-filters') {
    const state = await mutateDashboardState((draft) => {
      draft.uiState.filters.prompts.query = formData?.get('query')?.toString() || '';
      draft.uiState.filters.prompts.model = formData?.get('model')?.toString() || 'All';
      draft.uiState.filters.prompts.week = formData?.get('week')?.toString() || 'All';
      draft.uiState.filters.prompts.tag = formData?.get('tag')?.toString() || 'All';
    });
    return buildResponse(state, 'prompts');
  }

  if (intent === 'prompt-save') {
    const state = await mutateDashboardState((draft) => {
      const existingIndex = draft.promptLog.findIndex((entry) => entry.id === id);
      const createdAt = existingIndex >= 0 ? draft.promptLog[existingIndex].createdAt : nowISO();
      const next = existingIndex >= 0 ? draft.promptLog[existingIndex] : { id: uid(), createdAt };

      next.date = toISO(formData?.get('date')?.toString() || '', nowISO());
      next.model = formData?.get('model')?.toString().trim() || MODEL_OPTIONS[1];
      next.prompt = formData?.get('prompt')?.toString() || '';
      next.outputSummary = formData?.get('outputSummary')?.toString() || '';
      next.changedNext = formData?.get('changedNext')?.toString() || '';
      next.tags = parseTags(formData?.get('tags')?.toString() || '');
      next.relatedWeek = Number(formData?.get('relatedWeek') || draft.uiState.activeWeek);
      next.relatedSourceIds = formData?.getAll('relatedSourceIds').map((value) => value.toString());
      next.updatedAt = nowISO();

      if (existingIndex >= 0) draft.promptLog[existingIndex] = next;
      else draft.promptLog.unshift(next);
    });
    return buildResponse(state, 'prompts', { includeOverview: true, clearModal: true });
  }

  if (intent === 'prompt-delete') {
    const state = await mutateDashboardState((draft) => {
      draft.promptLog = draft.promptLog.filter((entry) => entry.id !== id);
    });
    return buildResponse(state, 'prompts', { includeOverview: true });
  }

  if (intent === 'experiment-filters') {
    const state = await mutateDashboardState((draft) => {
      draft.uiState.filters.experiments.query = formData?.get('query')?.toString() || '';
      draft.uiState.filters.experiments.week = formData?.get('week')?.toString() || 'All';
      draft.uiState.filters.experiments.tag = formData?.get('tag')?.toString() || 'All';
    });
    return buildResponse(state, 'experiments');
  }

  if (intent === 'experiment-save') {
    const state = await mutateDashboardState((draft) => {
      const existingIndex = draft.experimentLog.findIndex((entry) => entry.id === id);
      const createdAt = existingIndex >= 0 ? draft.experimentLog[existingIndex].createdAt : nowISO();
      const next = existingIndex >= 0 ? draft.experimentLog[existingIndex] : { id: uid(), createdAt };

      next.date = toISO(formData?.get('date')?.toString() || '', nowISO());
      next.title = formData?.get('title')?.toString() || '';
      next.whatITried = formData?.get('whatITried')?.toString() || '';
      next.outcome = formData?.get('outcome')?.toString() || '';
      next.nextStep = formData?.get('nextStep')?.toString() || '';
      next.imageUrls = linesToItems(formData?.get('imageUrls')?.toString() || '');
      next.notes = formData?.get('notes')?.toString() || '';
      next.tags = parseTags(formData?.get('tags')?.toString() || '');
      next.relatedWeek = Number(formData?.get('relatedWeek') || draft.uiState.activeWeek);
      next.updatedAt = nowISO();

      if (existingIndex >= 0) draft.experimentLog[existingIndex] = next;
      else draft.experimentLog.unshift(next);
    });
    return buildResponse(state, 'experiments', { includeOverview: true, clearModal: true });
  }

  if (intent === 'experiment-delete') {
    const state = await mutateDashboardState((draft) => {
      draft.experimentLog = draft.experimentLog.filter((entry) => entry.id !== id);
    });
    return buildResponse(state, 'experiments', { includeOverview: true });
  }

  if (intent === 'link-save') {
    const state = await mutateDashboardState((draft) => {
      const existingIndex = draft.links.findIndex((entry) => entry.id === id);
      const createdAt = existingIndex >= 0 ? draft.links[existingIndex].createdAt : nowISO();
      const next = existingIndex >= 0 ? draft.links[existingIndex] : { id: uid(), createdAt };

      next.name = formData?.get('name')?.toString() || '';
      next.url = formData?.get('url')?.toString() || '';
      next.category = formData?.get('category')?.toString() || 'General';
      next.updatedAt = nowISO();

      if (existingIndex >= 0) draft.links[existingIndex] = next;
      else draft.links.unshift(next);
    });
    return buildResponse(state, 'links', { clearModal: true });
  }

  if (intent === 'link-delete') {
    const state = await mutateDashboardState((draft) => {
      draft.links = draft.links.filter((entry) => entry.id !== id);
    });
    return buildResponse(state, 'links');
  }

  return new Response(`Unknown intent: ${intent}`, { status: 400, headers: HTML_HEADERS });
}

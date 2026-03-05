import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const STORAGE_KEY = 'retroCoachResearchDashboard.v1';
export const THEME_STORAGE_KEY = 'coachForgeThemeMode.v1';

export const SOURCE_STATUSES = ['Not started', 'Unread', 'In Progress', 'Synthesized', 'Archived'];
export const WEEK_STATUSES = ['Planned', 'Active', 'Done'];
export const WEEK_RANGE = [5, 6, 7, 8, 9, 10, 11];
export const MODEL_OPTIONS = ['GPT-4.1', 'GPT-5', 'Claude Sonnet', 'Gemini', 'Other'];
export const READING_SORT_OPTIONS = ['manual', 'relatedWeek', 'title', 'author', 'status', 'updatedAt'];

const STORE_FILE = path.join(process.cwd(), 'data', 'dashboard-state.json');

export function nowISO() {
  return new Date().toISOString();
}

export function uid() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export function parseTags(str) {
  if (!str) return [];
  return [...new Set(String(str).split(',').map((tag) => tag.trim()).filter(Boolean))];
}

export function linesToItems(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function sourceTitleFallback(url) {
  if (!url) return 'Untitled source';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch (_error) {
    return url.slice(0, 80) || 'Untitled source';
  }
}

export function toISO(value, fallback = nowISO()) {
  const date = value ? new Date(value) : new Date(fallback);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

export function clampWeek(week, fallback = 5) {
  const parsed = Number(week);
  return WEEK_RANGE.includes(parsed) ? parsed : fallback;
}

function normalizeWeekFilter(week) {
  if (String(week || 'All') === 'All') return 'All';
  return WEEK_RANGE.includes(Number(week)) ? String(Number(week)) : 'All';
}

function normalizeReadingSort(sort) {
  return READING_SORT_OPTIONS.includes(sort) ? sort : 'updatedAt';
}

export function defaultFilters() {
  return {
    reading: {
      query: '',
      status: 'All',
      week: 'All',
      keyOnly: false,
      sort: 'updatedAt'
    },
    prompts: {
      query: '',
      model: 'All',
      week: 'All',
      tag: 'All'
    },
    experiments: {
      query: '',
      week: 'All',
      tag: 'All'
    }
  };
}

function normalizeFilters(filters) {
  const defaults = defaultFilters();
  if (!filters || typeof filters !== 'object') return defaults;

  if (filters.reading || filters.prompts || filters.experiments) {
    const reading = filters.reading || {};
    return {
      reading: {
        ...defaults.reading,
        ...reading,
        week: normalizeWeekFilter(reading.week ?? reading.tag ?? defaults.reading.week),
        sort: normalizeReadingSort(reading.sort ?? defaults.reading.sort)
      },
      prompts: {
        ...defaults.prompts,
        ...(filters.prompts || {})
      },
      experiments: {
        ...defaults.experiments,
        ...(filters.experiments || {})
      }
    };
  }

  return {
    reading: {
      query: filters.readingSearch || '',
      status: filters.readingStatus || 'All',
      week: normalizeWeekFilter(filters.readingWeek ?? filters.readingTag ?? 'All'),
      keyOnly: !!filters.readingKeyOnly,
      sort: normalizeReadingSort(filters.readingSort || 'updatedAt')
    },
    prompts: {
      query: filters.promptSearch || '',
      model: filters.promptModel || 'All',
      week: filters.promptWeek || 'All',
      tag: filters.promptTag || 'All'
    },
    experiments: {
      query: filters.experimentSearch || '',
      week: filters.experimentWeek || 'All',
      tag: filters.experimentTag || 'All'
    }
  };
}

function normalizeSource(source, fallbackWeek = 5) {
  const createdAt = source.createdAt || nowISO();
  const status = SOURCE_STATUSES.includes(source.status) ? source.status : 'Not started';
  return {
    id: source.id || uid(),
    createdAt,
    updatedAt: source.updatedAt || createdAt,
    title: source.title || '',
    author: source.author || '',
    url: source.url || '',
    tags: Array.isArray(source.tags) ? source.tags : parseTags(source.tags || ''),
    status,
    notes: source.notes || '',
    isKey: !!source.isKey,
    relatedWeek: clampWeek(source.relatedWeek, fallbackWeek),
    accessedDate: source.accessedDate || createdAt
  };
}

function normalizeWeek(week) {
  const createdAt = week.createdAt || nowISO();
  return {
    id: week.id || uid(),
    createdAt,
    updatedAt: week.updatedAt || createdAt,
    weekNumber: clampWeek(week.weekNumber, 5),
    status: WEEK_STATUSES.includes(week.status) ? week.status : 'Planned',
    owner: week.owner || '',
    milestones: Array.isArray(week.milestones)
      ? week.milestones.map((milestone) => ({
          id: milestone.id || uid(),
          text: milestone.text || '',
          done: !!milestone.done
        }))
      : [],
    deliverables: week.deliverables || '',
    risks: week.risks || ''
  };
}

function normalizePrompt(entry) {
  const createdAt = entry.createdAt || nowISO();
  return {
    id: entry.id || uid(),
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    date: toISO(entry.date, nowISO()),
    prompt: entry.prompt || '',
    model: entry.model || 'GPT-5',
    outputSummary: entry.outputSummary || '',
    changedNext: entry.changedNext || '',
    tags: Array.isArray(entry.tags) ? entry.tags : parseTags(entry.tags || ''),
    relatedWeek: clampWeek(entry.relatedWeek, 5),
    relatedSourceIds: Array.isArray(entry.relatedSourceIds) ? entry.relatedSourceIds : []
  };
}

function normalizeExperiment(entry) {
  const createdAt = entry.createdAt || nowISO();
  return {
    id: entry.id || uid(),
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    date: toISO(entry.date, nowISO()),
    title: entry.title || '',
    whatITried: entry.whatITried || '',
    outcome: entry.outcome || '',
    nextStep: entry.nextStep || '',
    imageUrls: Array.isArray(entry.imageUrls)
      ? entry.imageUrls.filter(Boolean)
      : linesToItems(entry.imageUrls || ''),
    notes: entry.notes || '',
    tags: Array.isArray(entry.tags) ? entry.tags : parseTags(entry.tags || ''),
    relatedWeek: clampWeek(entry.relatedWeek, 5)
  };
}

function normalizeLink(link) {
  const createdAt = link.createdAt || nowISO();
  return {
    id: link.id || uid(),
    createdAt,
    updatedAt: link.updatedAt || createdAt,
    name: link.name || '',
    url: link.url || '',
    category: link.category || 'General'
  };
}

export function validateState(candidate) {
  const hasOverview = candidate?.projectOverview && typeof candidate.projectOverview === 'object';
  const hasArrays =
    Array.isArray(candidate?.readingLibrary) &&
    Array.isArray(candidate?.weeklyPlan) &&
    Array.isArray(candidate?.promptLog) &&
    Array.isArray(candidate?.experimentLog) &&
    Array.isArray(candidate?.links);
  const hasUi = candidate?.uiState && typeof candidate.uiState === 'object';
  const weeks = new Set((candidate?.weeklyPlan || []).map((week) => Number(week.weekNumber)));
  const hasWeekRange = WEEK_RANGE.every((week) => weeks.has(week));
  return !!(hasOverview && hasArrays && hasUi && hasWeekRange);
}

export function hydrateState(candidate) {
  const filters = normalizeFilters(candidate.uiState?.filters);
  const activeWeek = clampWeek(candidate.uiState?.activeWeek, 5);
  const normalizedWeeks = [...candidate.weeklyPlan]
    .map((week) => normalizeWeek(week))
    .sort((a, b) => a.weekNumber - b.weekNumber);

  let foundActive = false;
  normalizedWeeks.forEach((week) => {
    if (week.status === 'Active' && !foundActive) {
      foundActive = true;
      return;
    }
    if (week.status === 'Active' && foundActive) week.status = 'Planned';
  });
  if (!foundActive) {
    const match = normalizedWeeks.find((week) => week.weekNumber === activeWeek) || normalizedWeeks[0];
    if (match) match.status = 'Active';
  }

  return {
    projectOverview: {
      focus: candidate.projectOverview?.focus || '',
      question: candidate.projectOverview?.question || '',
      goals: Array.isArray(candidate.projectOverview?.goals) ? candidate.projectOverview.goals : []
    },
    readingLibrary: (candidate.readingLibrary || []).map((source) => normalizeSource(source, activeWeek)),
    weeklyPlan: normalizedWeeks,
    promptLog: (candidate.promptLog || []).map(normalizePrompt),
    experimentLog: (candidate.experimentLog || []).map(normalizeExperiment),
    links: (candidate.links || []).map(normalizeLink),
    uiState: {
      activeWeek,
      sidebarCollapsed: !!candidate.uiState?.sidebarCollapsed,
      filters,
      expandedRows: {
        reading: { ...(candidate.uiState?.expandedRows?.reading || {}) },
        prompts: { ...(candidate.uiState?.expandedRows?.prompts || {}) },
        experiments: { ...(candidate.uiState?.expandedRows?.experiments || {}) }
      },
      lastSavedAt: candidate.uiState?.lastSavedAt || null
    }
  };
}

function withMeta(state, meta = {}) {
  return {
    ...state,
    _meta: {
      allowLegacyImport: meta.allowLegacyImport ?? state._meta?.allowLegacyImport ?? false,
      importedAt: meta.importedAt ?? state._meta?.importedAt ?? null,
      dataIssueDetected: !!(meta.dataIssueDetected ?? state._meta?.dataIssueDetected),
      lastMutationAt: meta.lastMutationAt ?? state._meta?.lastMutationAt ?? null
    }
  };
}

export function seedState() {
  const createdAt = nowISO();
  const readingLibrary = [
    {
      id: uid(),
      createdAt,
      updatedAt: createdAt,
      title: 'Winning Culture in Elite Teams',
      author: 'D. Collins',
      url: 'https://example.com/winning-culture',
      tags: ['culture', 'leadership'],
      status: 'Synthesized',
      notes: 'Strong section on accountability rituals and role clarity.',
      isKey: true,
      relatedWeek: 5,
      accessedDate: createdAt
    },
    {
      id: uid(),
      createdAt,
      updatedAt: createdAt,
      title: 'NFL Film Room: Pattern Recognition',
      author: 'A. Ruiz',
      url: 'https://example.com/patterns',
      tags: ['patterns', 'signals'],
      status: 'In Progress',
      notes: 'Translate clip review cadence into weekly business reviews.',
      isKey: true,
      relatedWeek: 5,
      accessedDate: createdAt
    },
    {
      id: uid(),
      createdAt,
      updatedAt: createdAt,
      title: 'Habit Loops for High Performance',
      author: 'S. Malik',
      url: 'https://example.com/habit-loops',
      tags: ['habits', 'nudges'],
      status: 'Unread',
      notes: '',
      isKey: false,
      relatedWeek: 6,
      accessedDate: createdAt
    },
    {
      id: uid(),
      createdAt,
      updatedAt: createdAt,
      title: 'Coaching Through Metrics',
      author: 'L. Chen',
      url: 'https://example.com/metrics',
      tags: ['kpis', 'dashboard'],
      status: 'Synthesized',
      notes: 'Helped define scoreboard tiles.',
      isKey: false,
      relatedWeek: 7,
      accessedDate: createdAt
    },
    {
      id: uid(),
      createdAt,
      updatedAt: createdAt,
      title: 'Behavior Change in Teams',
      author: 'M. Brooks',
      url: 'https://example.com/behavior',
      tags: ['behavior', 'review'],
      status: 'In Progress',
      notes: 'Map nudge frequency to practical check-ins.',
      isKey: false,
      relatedWeek: 8,
      accessedDate: createdAt
    },
    {
      id: uid(),
      createdAt,
      updatedAt: createdAt,
      title: 'From Playbook to Operating Rhythm',
      author: 'R. Ortega',
      url: 'https://example.com/playbook-rhythm',
      tags: ['operations', 'weekly-loop'],
      status: 'Archived',
      notes: 'Archived but useful historical framing.',
      isKey: false,
      relatedWeek: 9,
      accessedDate: createdAt
    }
  ];

  const weeklyPlan = WEEK_RANGE.map((week, index) => ({
    id: uid(),
    createdAt,
    updatedAt: createdAt,
    weekNumber: week,
    status: week === 5 ? 'Active' : 'Planned',
    owner: ['Riley', 'Ops Coach', 'AI Analyst'][index % 3],
    milestones: [
      { id: uid(), text: `Define signal set for week ${week}`, done: index === 0 },
      { id: uid(), text: `Run coaching loop retro for week ${week}`, done: false },
      { id: uid(), text: `Publish adjustments for week ${week + 1}`, done: false }
    ],
    deliverables: `Weekly coaching brief, KPI highlights, and recommended nudges for Week ${week}.`,
    risks: `Risk: low source alignment and delayed stakeholder feedback in Week ${week}.`
  }));

  return withMeta(
    {
      projectOverview: {
        focus: 'Translate elite sports coaching habits into a repeatable business execution cadence.',
        question: 'How can human + AI coaches convert standards into measurable weekly behavior change?',
        goals: [
          'Define standards-to-signals map for each role',
          'Create prompt loops that improve weekly decisions',
          'Reduce lag between review and adjustment',
          'Track adoption and outcomes by week'
        ]
      },
      readingLibrary,
      weeklyPlan,
      promptLog: [
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: createdAt,
          prompt: 'Extract leadership standards from this coaching transcript and rank by repeatability.',
          model: 'GPT-5',
          outputSummary: 'Generated ranked standards with confidence levels.',
          changedNext: 'Added stricter evidence requirement to reduce generic advice.',
          tags: ['standards', 'evidence'],
          relatedWeek: 5,
          relatedSourceIds: readingLibrary.slice(0, 2).map((source) => source.id)
        },
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: new Date(Date.now() - 86400000 * 4).toISOString(),
          prompt: 'Convert weekly KPIs into coach-style signal alerts with thresholds.',
          model: 'Claude Sonnet',
          outputSummary: 'Produced alert matrix and threshold bands.',
          changedNext: 'Moved from static thresholds to moving averages.',
          tags: ['signals', 'kpi'],
          relatedWeek: 6,
          relatedSourceIds: [readingLibrary[3].id]
        },
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: new Date(Date.now() - 86400000 * 9).toISOString(),
          prompt: "Draft two nudges per role using this week's weak metrics.",
          model: 'Gemini',
          outputSummary: 'Role-specific nudges with timing recommendations.',
          changedNext: 'Added ownership labels and expected metric lift.',
          tags: ['nudges', 'roles'],
          relatedWeek: 7,
          relatedSourceIds: [readingLibrary[4].id]
        },
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: new Date(Date.now() - 86400000 * 13).toISOString(),
          prompt: 'Summarize retro notes into 3 actionable adjustments for next sprint.',
          model: 'GPT-4.1',
          outputSummary: 'Created concise action set with owners.',
          changedNext: 'Improved prompt by requiring risk level on each adjustment.',
          tags: ['review', 'adjust'],
          relatedWeek: 8,
          relatedSourceIds: [readingLibrary[2].id, readingLibrary[5].id]
        }
      ],
      experimentLog: [
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: createdAt,
          title: 'Signal-to-Nudge Match Test',
          whatITried: 'Mapped 5 weak signals to role-specific nudges in Monday standup.',
          outcome: '3 of 5 nudges adopted immediately; engagement improved in retro.',
          nextStep: 'A/B test timing of nudges across teams.',
          imageUrls: ['https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=300&h=200&fit=crop'],
          notes: 'Best response when nudge included one concrete behavior and one metric.',
          tags: ['nudges', 'adoption'],
          relatedWeek: 5
        },
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: new Date(Date.now() - 86400000 * 3).toISOString(),
          title: 'Weekly Review Compression',
          whatITried: 'Reduced review from 60 to 30 minutes with pre-read summaries.',
          outcome: 'Meeting stayed focused; fewer off-topic discussions.',
          nextStep: 'Template the pre-read format for all owners.',
          imageUrls: [],
          notes: '',
          tags: ['review', 'efficiency'],
          relatedWeek: 6
        },
        {
          id: uid(),
          createdAt,
          updatedAt: createdAt,
          date: new Date(Date.now() - 86400000 * 7).toISOString(),
          title: 'Pattern Detection Scoring',
          whatITried: 'Introduced simple confidence score for detected patterns.',
          outcome: 'Helped team decide where to act vs. monitor.',
          nextStep: 'Link score to escalation policy.',
          imageUrls: ['https://invalid.example.com/nonexistent.png'],
          notes: 'Failure fallback tested for broken image URL.',
          tags: ['patterns', 'triage'],
          relatedWeek: 7
        }
      ],
      links: [
        { id: uid(), createdAt, updatedAt: createdAt, name: 'Weekly Coaching Template', url: 'https://example.com/template', category: 'Template' },
        { id: uid(), createdAt, updatedAt: createdAt, name: 'Signal Definitions', url: 'https://example.com/signals', category: 'Reference' },
        { id: uid(), createdAt, updatedAt: createdAt, name: 'Prompt Patterns', url: 'https://example.com/prompts', category: 'Prompting' },
        { id: uid(), createdAt, updatedAt: createdAt, name: 'Team KPI Board', url: 'https://example.com/kpis', category: 'Dashboard' },
        { id: uid(), createdAt, updatedAt: createdAt, name: 'Culture Notes', url: 'https://example.com/culture-notes', category: 'Notes' },
        { id: uid(), createdAt, updatedAt: createdAt, name: 'Retro Archive', url: 'https://example.com/retro-archive', category: 'Archive' }
      ],
      uiState: {
        activeWeek: 5,
        sidebarCollapsed: false,
        filters: defaultFilters(),
        expandedRows: {
          reading: {},
          prompts: {},
          experiments: {}
        },
        lastSavedAt: null
      }
    },
    {
      allowLegacyImport: true,
      importedAt: null,
      dataIssueDetected: false,
      lastMutationAt: null
    }
  );
}

async function ensureStoreDir() {
  await mkdir(path.dirname(STORE_FILE), { recursive: true });
}

export async function loadDashboardState() {
  try {
    const raw = await readFile(STORE_FILE, 'utf8');
    const parsed = safeParse(raw);
    if (!parsed || !validateState(parsed)) {
      return withMeta(hydrateState(seedState()), {
        allowLegacyImport: true,
        dataIssueDetected: true
      });
    }
    return withMeta(hydrateState(parsed), parsed._meta || {});
  } catch (_error) {
    return seedState();
  }
}

export async function persistDashboardState(nextState, meta = {}) {
  const hydrated = withMeta(hydrateState(nextState), {
    ...meta,
    allowLegacyImport: meta.allowLegacyImport ?? false,
    lastMutationAt: meta.lastMutationAt ?? nowISO()
  });
  await ensureStoreDir();
  await writeFile(STORE_FILE, `${JSON.stringify(hydrated, null, 2)}\n`, 'utf8');
  return hydrated;
}

export async function mutateDashboardState(mutator, meta = {}) {
  const current = await loadDashboardState();
  const next = structuredClone(current);
  mutator(next);
  next.uiState.lastSavedAt = nowISO();
  return persistDashboardState(next, meta);
}

export async function importLegacyState(rawState, themeMode = null) {
  const candidate = typeof rawState === 'string' ? safeParse(rawState) : rawState;
  if (!candidate || !validateState(candidate)) {
    return { imported: false, reason: 'invalid' };
  }

  const hydrated = hydrateState(candidate);
  hydrated.uiState.lastSavedAt = nowISO();
  const saved = await persistDashboardState(hydrated, {
    allowLegacyImport: false,
    importedAt: nowISO(),
    legacyThemeMode:
      themeMode === 'light' || themeMode === 'dark' || themeMode === 'system' ? themeMode : null
  });
  return { imported: true, state: saved };
}

export function getActiveWeek(state) {
  return state.weeklyPlan.find((week) => week.weekNumber === Number(state.uiState.activeWeek)) || state.weeklyPlan[0];
}

export function activeWeekCompletion(state) {
  const week = getActiveWeek(state);
  if (!week || !week.milestones.length) return 0;
  const done = week.milestones.filter((milestone) => milestone.done).length;
  return Math.round((done / week.milestones.length) * 100);
}

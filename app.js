const STORAGE_KEY = 'retroCoachResearchDashboard.v1';
const THEME_STORAGE_KEY = 'coachForgeThemeMode.v1';

const appEl = document.getElementById('app');
const topbarEl = document.getElementById('topbar');
const sidebarEl = document.getElementById('sidebar');
const activeWeekSelectEl = document.getElementById('activeWeekSelect');
const themeSelectEl = document.getElementById('themeSelect');
const storageStatusEl = document.getElementById('storageStatus');
const toastHostEl = document.getElementById('toastHost');
const modalHostEl = document.getElementById('modalHost');

const overviewEl = document.getElementById('overview');
const readingEl = document.getElementById('reading');
const weeklyEl = document.getElementById('weekly');
const promptsEl = document.getElementById('prompts');
const experimentsEl = document.getElementById('experiments');
const linksEl = document.getElementById('links');

const MODEL_OPTIONS = ['GPT-4.1', 'GPT-5', 'Claude Sonnet', 'Gemini', 'Other'];
const SOURCE_STATUSES = ['Not started', 'Unread', 'In Progress', 'Synthesized', 'Archived'];
const WEEK_STATUSES = ['Planned', 'Active', 'Done'];
const WEEK_RANGE = [5, 6, 7, 8, 9, 10, 11];
const SEARCH_FILTER_TO_SECTION = {
  readingSearch: 'reading',
  promptSearch: 'prompts',
  experimentSearch: 'experiments'
};

let state = null;
let dataIssueDetected = false;
let modalState = null;
let inlineEditState = null;
let dragState = null;
const debouncedRenderers = {};
const prefersDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function getStoredThemeMode() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch (_err) {
    // ignore localStorage errors for theme mode
  }
  return 'system';
}

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return prefersDarkQuery && prefersDarkQuery.matches ? 'dark' : 'light';
}

function applyThemeMode(mode, options = {}) {
  const { persist = true } = options;
  const safeMode = mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system';
  const resolved = resolveTheme(safeMode);
  document.documentElement.setAttribute('data-theme-mode', safeMode);
  document.documentElement.setAttribute('data-theme', resolved);

  if (themeSelectEl && themeSelectEl.value !== safeMode) themeSelectEl.value = safeMode;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, safeMode);
    } catch (_err) {
      toast('Theme setting could not be saved', 'error');
    }
  }
}

function initTheme() {
  const initialMode = document.documentElement.getAttribute('data-theme-mode') || getStoredThemeMode();
  applyThemeMode(initialMode, { persist: false });

  if (themeSelectEl) {
    themeSelectEl.value = initialMode;
    themeSelectEl.addEventListener('change', (event) => {
      applyThemeMode(event.target.value, { persist: true });
    });
  }

  if (prefersDarkQuery) {
    const onSystemThemeChange = () => {
      const currentMode = document.documentElement.getAttribute('data-theme-mode') || 'system';
      if (currentMode === 'system') applyThemeMode('system', { persist: false });
    };
    if (prefersDarkQuery.addEventListener) {
      prefersDarkQuery.addEventListener('change', onSystemThemeChange);
    } else if (prefersDarkQuery.addListener) {
      prefersDarkQuery.addListener(onSystemThemeChange);
    }
  }
}

function uid() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function parseTags(str) {
  if (!str) return [];
  return [...new Set(str.split(',').map((t) => t.trim()).filter(Boolean))];
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function toISO(value, fallback = nowISO()) {
  const d = value ? new Date(value) : new Date(fallback);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString();
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function ensureUpdated(item) {
  item.updatedAt = nowISO();
}

function defaultFilters() {
  return {
    reading: {
      query: '',
      status: 'All',
      tag: 'All',
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

function clampWeek(week, fallback = 5) {
  const n = Number(week);
  return WEEK_RANGE.includes(n) ? n : fallback;
}

function normalizeFilters(filters) {
  const defaults = defaultFilters();
  if (!filters || typeof filters !== 'object') return defaults;

  if (filters.reading || filters.prompts || filters.experiments) {
    return {
      reading: {
        ...defaults.reading,
        ...(filters.reading || {})
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

  // Backward-compatible migration from flat filter keys.
  return {
    reading: {
      query: filters.readingSearch || '',
      status: filters.readingStatus || 'All',
      tag: filters.readingTag || 'All',
      keyOnly: !!filters.readingKeyOnly,
      sort: filters.readingSort || 'updatedAt'
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
    tags: Array.isArray(source.tags) ? source.tags : parseTags(String(source.tags || '')),
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
      ? week.milestones.map((m) => ({ id: m.id || uid(), text: m.text || '', done: !!m.done }))
      : [],
    deliverables: week.deliverables || '',
    risks: week.risks || ''
  };
}

function normalizePrompt(entry) {
  const createdAt = entry.createdAt || nowISO();
  const isoDate = toISO(entry.date, nowISO());
  return {
    id: entry.id || uid(),
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    date: isoDate,
    prompt: entry.prompt || '',
    model: entry.model || 'GPT-5',
    outputSummary: entry.outputSummary || '',
    changedNext: entry.changedNext || '',
    tags: Array.isArray(entry.tags) ? entry.tags : parseTags(String(entry.tags || '')),
    relatedWeek: clampWeek(entry.relatedWeek, 5),
    relatedSourceIds: Array.isArray(entry.relatedSourceIds) ? entry.relatedSourceIds : []
  };
}

function normalizeExperiment(entry) {
  const createdAt = entry.createdAt || nowISO();
  const isoDate = toISO(entry.date, nowISO());
  return {
    id: entry.id || uid(),
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    date: isoDate,
    title: entry.title || '',
    whatITried: entry.whatITried || '',
    outcome: entry.outcome || '',
    nextStep: entry.nextStep || '',
    imageUrls: Array.isArray(entry.imageUrls) ? entry.imageUrls : [],
    notes: entry.notes || '',
    tags: Array.isArray(entry.tags) ? entry.tags : parseTags(String(entry.tags || '')),
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

function validateState(candidate) {
  const hasOverview = candidate?.projectOverview && typeof candidate.projectOverview === 'object';
  const hasArrays =
    Array.isArray(candidate?.readingLibrary) &&
    Array.isArray(candidate?.weeklyPlan) &&
    Array.isArray(candidate?.promptLog) &&
    Array.isArray(candidate?.experimentLog) &&
    Array.isArray(candidate?.links);
  const hasUi = candidate?.uiState && typeof candidate.uiState === 'object';
  const weeks = new Set((candidate?.weeklyPlan || []).map((w) => Number(w.weekNumber)));
  const hasWeekRange = WEEK_RANGE.every((w) => weeks.has(w));
  return !!(hasOverview && hasArrays && hasUi && hasWeekRange);
}

function hydrateState(candidate) {
  const filters = normalizeFilters(candidate.uiState?.filters);
  const activeWeek = clampWeek(candidate.uiState?.activeWeek, 5);
  const normalizedWeeks = [...candidate.weeklyPlan]
    .map((week) => normalizeWeek(week))
    .sort((a, b) => a.weekNumber - b.weekNumber);

  // Keep exactly one active week.
  let hasActive = false;
  normalizedWeeks.forEach((week) => {
    if (week.status === 'Active' && !hasActive) {
      hasActive = true;
      return;
    }
    if (week.status === 'Active' && hasActive) week.status = 'Planned';
  });
  if (!hasActive) {
    const match = normalizedWeeks.find((w) => w.weekNumber === activeWeek) || normalizedWeeks[0];
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
      activeWeek: clampWeek(candidate.uiState?.activeWeek, 5),
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

function debounce(fn, wait = 200) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}

function seedState() {
  const createdAt = nowISO();
  const source1 = {
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
  };
  const source2 = {
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
  };
  const source3 = {
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
  };
  const source4 = {
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
  };
  const source5 = {
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
  };
  const source6 = {
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
  };

  const weeklyPlan = [5, 6, 7, 8, 9, 10, 11].map((week, idx) => {
    const cAt = nowISO();
    return {
      id: uid(),
      createdAt: cAt,
      updatedAt: cAt,
      weekNumber: week,
      status: week === 5 ? 'Active' : 'Planned',
      owner: ['Riley', 'Ops Coach', 'AI Analyst'][idx % 3],
      milestones: [
        { id: uid(), text: `Define signal set for week ${week}`, done: idx === 0 },
        { id: uid(), text: `Run coaching loop retro for week ${week}`, done: false },
        { id: uid(), text: `Publish adjustments for week ${week + 1}`, done: false }
      ],
      deliverables: `Weekly coaching brief, KPI highlights, and recommended nudges for Week ${week}.`,
      risks: `Risk: low source alignment and delayed stakeholder feedback in Week ${week}.`
    };
  });

  const prompt1 = {
    id: uid(),
    createdAt,
    updatedAt: createdAt,
    date: new Date().toISOString(),
    prompt: 'Extract leadership standards from this coaching transcript and rank by repeatability.',
    model: 'GPT-5',
    outputSummary: 'Generated ranked standards with confidence levels.',
    changedNext: 'Added stricter evidence requirement to reduce generic advice.',
    tags: ['standards', 'evidence'],
    relatedWeek: 5,
    relatedSourceIds: [source1.id, source2.id]
  };
  const prompt2 = {
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
    relatedSourceIds: [source4.id]
  };
  const prompt3 = {
    id: uid(),
    createdAt,
    updatedAt: createdAt,
    date: new Date(Date.now() - 86400000 * 9).toISOString(),
    prompt: 'Draft two nudges per role using this week\'s weak metrics.',
    model: 'Gemini',
    outputSummary: 'Role-specific nudges with timing recommendations.',
    changedNext: 'Added ownership labels and expected metric lift.',
    tags: ['nudges', 'roles'],
    relatedWeek: 7,
    relatedSourceIds: [source5.id]
  };
  const prompt4 = {
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
    relatedSourceIds: [source3.id, source6.id]
  };

  const exp1 = {
    id: uid(),
    createdAt,
    updatedAt: createdAt,
    date: new Date().toISOString(),
    title: 'Signal-to-Nudge Match Test',
    whatITried: 'Mapped 5 weak signals to role-specific nudges in Monday standup.',
    outcome: '3 of 5 nudges adopted immediately; engagement improved in retro.',
    nextStep: 'A/B test timing of nudges across teams.',
    imageUrls: ['https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=300&h=200&fit=crop'],
    notes: 'Best response when nudge included one concrete behavior and one metric.',
    tags: ['nudges', 'adoption'],
    relatedWeek: 5
  };
  const exp2 = {
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
  };
  const exp3 = {
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
  };

  const linkNow = nowISO();
  const links = [
    { id: uid(), createdAt: linkNow, updatedAt: linkNow, name: 'Weekly Coaching Template', url: 'https://example.com/template', category: 'Template' },
    { id: uid(), createdAt: linkNow, updatedAt: linkNow, name: 'Signal Definitions', url: 'https://example.com/signals', category: 'Reference' },
    { id: uid(), createdAt: linkNow, updatedAt: linkNow, name: 'Prompt Patterns', url: 'https://example.com/prompts', category: 'Prompting' },
    { id: uid(), createdAt: linkNow, updatedAt: linkNow, name: 'Team KPI Board', url: 'https://example.com/kpis', category: 'Dashboard' },
    { id: uid(), createdAt: linkNow, updatedAt: linkNow, name: 'Culture Notes', url: 'https://example.com/culture-notes', category: 'Notes' },
    { id: uid(), createdAt: linkNow, updatedAt: linkNow, name: 'Retro Archive', url: 'https://example.com/retro-archive', category: 'Archive' }
  ];

  return {
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
    readingLibrary: [source1, source2, source3, source4, source5, source6],
    weeklyPlan,
    promptLog: [prompt1, prompt2, prompt3, prompt4],
    experimentLog: [exp1, exp2, exp3],
    links,
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
  };
}

function saveState(nextState, options = {}) {
  const { silent = false } = options;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    const sanity = localStorage.getItem(STORAGE_KEY);
    if (!sanity) {
      console.warn(`[Storage] Sanity check failed for key "${STORAGE_KEY}"`);
      storageStatusEl.textContent = 'LOCAL: ERROR';
      if (!silent) toast('Storage check failed', 'error');
      return false;
    }
    console.debug(`[Storage] Saved ${STORAGE_KEY} (${sanity.length} bytes)`);
    storageStatusEl.textContent = 'LOCAL: OK';
    return true;
  } catch (err) {
    console.error('[Storage] Failed to save local data', err);
    storageStatusEl.textContent = 'LOCAL: ERROR';
    if (!silent) toast('Storage write failed', 'error');
    return false;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedState();
    saveState(seeded, { silent: true });
    return seeded;
  }

  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== 'object' || !validateState(parsed)) {
    dataIssueDetected = true;
    const seeded = seedState();
    saveState(seeded, { silent: true });
    return seeded;
  }

  const hydrated = hydrateState(parsed);
  saveState(hydrated, { silent: true });
  return hydrated;
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`.trim();
  el.textContent = msg;
  toastHostEl.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function closeModal() {
  modalState = null;
  modalHostEl.innerHTML = '';
}

function openModal(config) {
  modalState = config;
  const content = typeof config.content === 'function' ? config.content() : config.content;
  modalHostEl.innerHTML = `
    <div class="modal-overlay" data-overlay-close="true">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${config.title || 'Dialog'}">
        <h3>${config.title || ''}</h3>
        ${content}
      </div>
    </div>
  `;
  const firstFocusable = modalHostEl.querySelector('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) firstFocusable.focus();
}

function commit(mutator, options = {}) {
  let message = 'Saved';
  let render = 'all';
  if (typeof options === 'string' || options === null) {
    message = options;
  } else {
    ({ message = 'Saved', render = 'all' } = options || {});
  }
  mutator();
  if (!state.uiState) state.uiState = {};
  state.uiState.lastSavedAt = nowISO();
  const ok = saveState(state, { silent: true });
  if (render === 'all') renderAll();
  else renderSection(render);
  if (!ok) {
    toast('Storage write failed', 'error');
    return;
  }
  if (message) toast(message);
}

function persistWithoutRender() {
  if (!state.uiState) state.uiState = {};
  state.uiState.lastSavedAt = nowISO();
  saveState(state, { silent: true });
}

function getFilterValue(filterKey) {
  const f = state.uiState.filters;
  const map = {
    readingSearch: f.reading.query,
    readingStatus: f.reading.status,
    readingTag: f.reading.tag,
    readingKeyOnly: f.reading.keyOnly,
    readingSort: f.reading.sort,
    promptSearch: f.prompts.query,
    promptModel: f.prompts.model,
    promptWeek: f.prompts.week,
    promptTag: f.prompts.tag,
    experimentSearch: f.experiments.query,
    experimentWeek: f.experiments.week,
    experimentTag: f.experiments.tag
  };
  return map[filterKey];
}

function setFilterValue(filterKey, value) {
  const f = state.uiState.filters;
  if (filterKey === 'readingSearch') f.reading.query = String(value || '');
  if (filterKey === 'readingStatus') f.reading.status = String(value || 'All');
  if (filterKey === 'readingTag') f.reading.tag = String(value || 'All');
  if (filterKey === 'readingKeyOnly') f.reading.keyOnly = !!value;
  if (filterKey === 'readingSort') f.reading.sort = String(value || 'updatedAt');
  if (filterKey === 'promptSearch') f.prompts.query = String(value || '');
  if (filterKey === 'promptModel') f.prompts.model = String(value || 'All');
  if (filterKey === 'promptWeek') f.prompts.week = String(value || 'All');
  if (filterKey === 'promptTag') f.prompts.tag = String(value || 'All');
  if (filterKey === 'experimentSearch') f.experiments.query = String(value || '');
  if (filterKey === 'experimentWeek') f.experiments.week = String(value || 'All');
  if (filterKey === 'experimentTag') f.experiments.tag = String(value || 'All');
}

function queueSectionRender(section) {
  if (!debouncedRenderers[section]) {
    debouncedRenderers[section] = debounce(() => renderSection(section), 200);
  }
  debouncedRenderers[section]();
}

function sourceTagOptions() {
  return ['All', ...new Set(state.readingLibrary.flatMap((s) => s.tags))].filter(Boolean);
}

function promptTagOptions() {
  return ['All', ...new Set(state.promptLog.flatMap((p) => p.tags))].filter(Boolean);
}

function experimentTagOptions() {
  return ['All', ...new Set(state.experimentLog.flatMap((e) => e.tags))].filter(Boolean);
}

function activeWeekObj() {
  return state.weeklyPlan.find((w) => w.weekNumber === Number(state.uiState.activeWeek)) || state.weeklyPlan[0];
}

function activeWeekCompletion() {
  const week = activeWeekObj();
  if (!week || !week.milestones.length) return 0;
  const done = week.milestones.filter((m) => m.done).length;
  return Math.round((done / week.milestones.length) * 100);
}

function renderTopbarWarning() {
  const existing = topbarEl.querySelector('.warning-banner');
  if (existing) existing.remove();
  if (dataIssueDetected) {
    const banner = document.createElement('div');
    banner.className = 'warning-banner';
    banner.textContent = 'Data issue detected — restoring demo data';
    topbarEl.appendChild(banner);
  }
}

function renderOverview() {
  const statusCounts = SOURCE_STATUSES.reduce((acc, status) => {
    acc[status] = state.readingLibrary.filter((s) => s.status === status).length;
    return acc;
  }, {});
  const statusSummary = SOURCE_STATUSES.map((status) => `${status.slice(0, 2).toUpperCase()}:${statusCounts[status]}`).join(' ');

  overviewEl.innerHTML = `
    <h2 class="section-title">Overview</h2>
    <div class="ref-flag">Ref Flag: Review standards-to-signals alignment before weekly adjustment lock.</div>
    <div class="inline-row" style="margin-top:8px;">
      <label style="flex:1;">
        Focus
        <textarea class="overview-edit" data-action="overview-edit" data-field="focus">${escapeHtml(state.projectOverview.focus)}</textarea>
      </label>
      <label style="flex:1;">
        Research Question
        <textarea class="overview-edit" data-action="overview-edit" data-field="question">${escapeHtml(state.projectOverview.question)}</textarea>
      </label>
    </div>
    <h3 style="margin-top:10px;">Goals</h3>
    <div>
      ${state.projectOverview.goals
        .map(
          (goal, index) => `
          <div class="goal-item goal-item--draggable" data-drop-type="goals" data-drop-id="${index}">
            <button class="drag-grip" type="button" draggable="true" data-drag-type="goals" data-drag-id="${index}" aria-label="Reorder goal">::</button>
            <input type="text" value="${escapeAttr(goal)}" data-action="goal-edit" data-index="${index}" />
            <button data-action="goal-up" data-index="${index}" type="button">Up</button>
            <button data-action="goal-down" data-index="${index}" type="button">Down</button>
            <button data-action="goal-remove" data-index="${index}" type="button">Remove</button>
          </div>
        `
        )
        .join('')}
      <div class="goal-item">
        <input id="newGoalInput" type="text" placeholder="Add goal" />
        <button data-action="goal-add" type="button">Add Goal</button>
      </div>
    </div>
    <h3 style="margin-top:10px;">AI Loop</h3>
    <div class="loop-stepper">
      <span class="pill">Capture</span>
      <span class="pill">Detect Patterns</span>
      <span class="pill">Nudge</span>
      <span class="pill">Review</span>
      <span class="pill">Adjust</span>
    </div>
    <h3 style="margin-top:10px;">Flow</h3>
    <div class="flow-chips">
      <span class="pill">Standards</span>
      <span class="pill">Signals</span>
      <span class="pill">Dashboard</span>
      <span class="pill">Weekly Review</span>
    </div>
    <h3 style="margin-top:10px;">Scoreboard KPIs</h3>
    <div class="kpis">
      <div class="kpi"><div class="label">Total Sources</div><div class="value">${state.readingLibrary.length}</div></div>
      <div class="kpi"><div class="label">Source Status</div><div class="value">${statusSummary}</div></div>
      <div class="kpi"><div class="label">Prompt Logs</div><div class="value">${state.promptLog.length}</div></div>
      <div class="kpi"><div class="label">Experiments</div><div class="value">${state.experimentLog.length}</div></div>
      <div class="kpi"><div class="label">Active Week Completion</div><div class="value">${activeWeekCompletion()}%</div></div>
    </div>
  `;
}

function filteredReading() {
  const f = state.uiState.filters.reading;
  const filtered = state.readingLibrary.filter((s) => {
    const hay = `${s.title} ${s.author} ${s.notes}`.toLowerCase();
    if (f.query && !hay.includes(f.query.toLowerCase())) return false;
    if (f.status !== 'All' && s.status !== f.status) return false;
    if (f.tag !== 'All' && !s.tags.includes(f.tag)) return false;
    if (f.keyOnly && !s.isKey) return false;
    return true;
  });
  if (f.sort === 'manual') return filtered;
  return filtered.sort((a, b) => {
    const key = f.sort;
    const av = (a[key] || '').toString().toLowerCase();
    const bv = (b[key] || '').toString().toLowerCase();
    return av.localeCompare(bv);
  });
}

function renderReading() {
  const f = state.uiState.filters.reading;
  const rows = filteredReading();
  const tags = sourceTagOptions();

  readingEl.innerHTML = `
    <h2 class="section-title">Reading Library</h2>
    <div class="table-toolbar">
      <button type="button" data-action="reading-add">Add Source</button>
      <input type="text" placeholder="Search title/author/notes" value="${escapeAttr(f.query)}" data-filter="readingSearch" />
      <select data-filter="readingStatus">${['All', ...SOURCE_STATUSES].map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select data-filter="readingTag">${tags.map((t) => `<option ${f.tag === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="pill"><input type="checkbox" data-filter="readingKeyOnly" ${f.keyOnly ? 'checked' : ''}/> Key Only</label>
      <select data-filter="readingSort">
        ${['manual', 'title', 'author', 'status', 'updatedAt'].map((k) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>Sort: ${k}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Move</th><th>Title</th><th>Author</th><th>Link</th><th>Tags</th><th>Status</th><th>Key</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((s) => {
              const expanded = !!state.uiState.expandedRows.reading[s.id];
              const tagPills = s.tags
                .map((t) => `<span class="patch">${escapeHtml(t)} <button type="button" data-action="reading-remove-tag" data-id="${s.id}" data-tag="${escapeAttr(t)}">x</button></span>`)
                .join('');
              return `
                <tr data-drop-type="reading" data-drop-id="${s.id}">
                  <td><button class="drag-grip" type="button" draggable="true" data-drag-type="reading" data-drag-id="${s.id}" aria-label="Reorder source">::</button></td>
                  ${inlineCell('reading', s.id, 'title', s.title, 'text')}
                  ${inlineCell('reading', s.id, 'author', s.author, 'text')}
                  ${inlineCell('reading', s.id, 'url', s.url, 'url')}
                  ${inlineCell('reading', s.id, 'tags', s.tags.join(', '), 'tags')}
                  ${inlineCell('reading', s.id, 'status', s.status, 'select', SOURCE_STATUSES)}
                  ${inlineCell('reading', s.id, 'isKey', s.isKey ? 'Yes' : 'No', 'toggle')}
                  <td>
                    <div class="action-row">
                      <button type="button" data-action="reading-expand" data-id="${s.id}">${expanded ? 'Hide' : 'Notes'}</button>
                      <button type="button" data-action="reading-edit" data-id="${s.id}">Edit</button>
                      <button type="button" data-action="reading-delete" data-id="${s.id}">Delete</button>
                    </div>
                    <div>${tagPills}</div>
                  </td>
                </tr>
                ${expanded ? `<tr class="expanded-notes" data-drop-type="reading" data-drop-id="${s.id}"><td colspan="8"><strong>Notes:</strong> ${escapeHtml(s.notes || 'No notes')}</td></tr>` : ''}
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderWeekly() {
  weeklyEl.innerHTML = `
    <h2 class="section-title">Weekly Plan</h2>
    <div class="week-grid">
      ${state.weeklyPlan
        .sort((a, b) => a.weekNumber - b.weekNumber)
        .map((w) => {
          const total = w.milestones.length || 1;
          const done = w.milestones.filter((m) => m.done).length;
          const pct = Math.round((done / total) * 100);
          return `
            <article class="week-card">
              <div class="inline-row" style="justify-content:space-between;align-items:center;">
                <span class="badge">Week ${w.weekNumber}</span>
                <span class="pill">${w.status}</span>
              </div>
              <p><strong>Owner:</strong> ${escapeHtml(w.owner || '-')}</p>
              <div class="progress"><span style="width:${pct}%"></span></div>
              <p class="card-preview"><strong>Deliverables:</strong> ${escapeHtml((w.deliverables || '').slice(0, 120))}</p>
              <p class="card-preview"><strong>Risks:</strong> ${escapeHtml((w.risks || '').slice(0, 120))}</p>
              <div class="week-actions">
                <button data-action="week-edit" data-id="${w.id}" type="button">View/Edit</button>
                <button data-action="week-set-active" data-id="${w.id}" type="button">Set Active</button>
                <button data-action="week-mark-done" data-id="${w.id}" type="button">Mark Done</button>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function filteredPrompts() {
  const f = state.uiState.filters.prompts;
  return state.promptLog.filter((p) => {
    const hay = `${p.prompt} ${p.outputSummary} ${p.changedNext}`.toLowerCase();
    if (f.query && !hay.includes(f.query.toLowerCase())) return false;
    if (f.model !== 'All' && p.model !== f.model) return false;
    if (f.week !== 'All' && Number(f.week) !== p.relatedWeek) return false;
    if (f.tag !== 'All' && !p.tags.includes(f.tag)) return false;
    return true;
  });
}

function renderPrompts() {
  const f = state.uiState.filters.prompts;
  const tags = promptTagOptions();
  const modelOpts = ['All', ...new Set([...MODEL_OPTIONS.filter((m) => m !== 'Other'), ...state.promptLog.map((p) => p.model)])];
  const rows = filteredPrompts();

  promptsEl.innerHTML = `
    <h2 class="section-title">Prompt Log</h2>
    <div class="table-toolbar">
      <button type="button" data-action="prompt-add">Add Prompt</button>
      <input type="text" placeholder="Search prompt/summary/changes" value="${escapeAttr(f.query)}" data-filter="promptSearch" />
      <select data-filter="promptModel">${modelOpts.map((m) => `<option ${f.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select data-filter="promptWeek">${['All', ...WEEK_RANGE].map((w) => `<option ${String(f.week) === String(w) ? 'selected' : ''}>${w}</option>`).join('')}</select>
      <select data-filter="promptTag">${tags.map((t) => `<option ${f.tag === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Move</th><th>Date</th><th>Model</th><th>Summary</th><th>Week</th><th>Tags</th><th>Actions</th></tr></thead>
        <tbody>
          ${rows
            .map((p) => {
              const expanded = !!state.uiState.expandedRows.prompts[p.id];
              const sourceNames = p.relatedSourceIds
                .map((id) => state.readingLibrary.find((s) => s.id === id)?.title)
                .filter(Boolean)
                .join(', ');
              return `
                <tr data-drop-type="prompt" data-drop-id="${p.id}">
                  <td><button class="drag-grip" type="button" draggable="true" data-drag-type="prompt" data-drag-id="${p.id}" aria-label="Reorder prompt">::</button></td>
                  ${inlineCell('prompt', p.id, 'date', p.date.slice(0, 10), 'date')}
                  ${inlineCell('prompt', p.id, 'model', p.model, 'select', [...new Set([...MODEL_OPTIONS.filter((m) => m !== 'Other'), p.model])] )}
                  ${inlineCell('prompt', p.id, 'outputSummary', p.outputSummary, 'textarea')}
                  ${inlineCell('prompt', p.id, 'relatedWeek', String(p.relatedWeek), 'select', ['5', '6', '7', '8', '9', '10', '11'])}
                  ${inlineCell('prompt', p.id, 'tags', p.tags.join(', '), 'tags')}
                  <td>
                    <div class="action-row">
                      <button type="button" data-action="prompt-expand" data-id="${p.id}">${expanded ? 'Hide' : 'Details'}</button>
                      <button type="button" data-action="prompt-copy" data-id="${p.id}">Copy Prompt</button>
                      <button type="button" data-action="prompt-edit" data-id="${p.id}">Edit</button>
                      <button type="button" data-action="prompt-delete" data-id="${p.id}">Delete</button>
                    </div>
                  </td>
                </tr>
                ${expanded ? `<tr class="expanded-notes" data-drop-type="prompt" data-drop-id="${p.id}"><td colspan="7"><strong>Prompt:</strong> ${escapeHtml(p.prompt)}<br/><strong>What I changed next:</strong> ${escapeHtml(p.changedNext)}<br/><strong>Related Sources:</strong> ${escapeHtml(sourceNames || 'None')}</td></tr>` : ''}
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filteredExperiments() {
  const f = state.uiState.filters.experiments;
  return state.experimentLog.filter((e) => {
    const hay = `${e.title} ${e.whatITried} ${e.outcome}`.toLowerCase();
    if (f.query && !hay.includes(f.query.toLowerCase())) return false;
    if (f.week !== 'All' && Number(f.week) !== e.relatedWeek) return false;
    if (f.tag !== 'All' && !e.tags.includes(f.tag)) return false;
    return true;
  });
}

function renderExperiments() {
  const f = state.uiState.filters.experiments;
  const tags = experimentTagOptions();
  experimentsEl.innerHTML = `
    <h2 class="section-title">Experiment Log</h2>
    <div class="controls">
      <button data-action="experiment-add" type="button">Add Experiment</button>
      <input type="text" placeholder="Search title/tried/outcome" value="${escapeAttr(f.query)}" data-filter="experimentSearch" />
      <select data-filter="experimentWeek">${['All', ...WEEK_RANGE].map((w) => `<option ${String(f.week) === String(w) ? 'selected' : ''}>${w}</option>`).join('')}</select>
      <select data-filter="experimentTag">${tags.map((t) => `<option ${f.tag === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="cards">
      ${filteredExperiments()
        .map((e) => {
          const expanded = !!state.uiState.expandedRows.experiments[e.id];
          return `
            <article class="exp-card" data-drop-type="experiment" data-drop-id="${e.id}">
              <div class="inline-row" style="justify-content:space-between;">
                <strong>${escapeHtml(e.title)}</strong>
                <span>${formatDate(e.date)}</span>
              </div>
              <div class="inline-row">
                <span class="pill">Week ${e.relatedWeek}</span>
                ${e.tags.map((t) => `<span class="patch">${escapeHtml(t)}</span>`).join('')}
              </div>
              <p class="card-preview"><strong>Outcome:</strong> ${escapeHtml((e.outcome || '').slice(0, 110))}</p>
              <p class="card-preview"><strong>Next:</strong> ${escapeHtml((e.nextStep || '').slice(0, 110))}</p>
              <div class="action-row">
                <button class="drag-grip" type="button" draggable="true" data-drag-type="experiment" data-drag-id="${e.id}" aria-label="Reorder experiment">::</button>
                <button data-action="experiment-expand" data-id="${e.id}" type="button">${expanded ? 'Hide' : 'Expand'}</button>
                <button data-action="experiment-edit" data-id="${e.id}" type="button">Edit</button>
                <button data-action="experiment-delete" data-id="${e.id}" type="button">Delete</button>
              </div>
              ${expanded ? `
                <div class="card-details">
                  <p><strong>What I tried:</strong> ${escapeHtml(e.whatITried)}</p>
                  <p><strong>Notes:</strong> ${escapeHtml(e.notes || 'No notes')}</p>
                  <p><strong>Outcome:</strong> ${escapeHtml(e.outcome)}</p>
                  <p><strong>Next step:</strong> ${escapeHtml(e.nextStep)}</p>
                  <div class="inline-row">
                    ${e.imageUrls
                      .map((url) => `<img class="thumb" src="${escapeAttr(url)}" alt="attachment" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'patch',textContent:'Image unavailable'}))"/>`)
                      .join('') || '<span class="patch">No images</span>'}
                  </div>
                </div>
              ` : ''}
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderLinks() {
  linksEl.innerHTML = `
    <h2 class="section-title">Links</h2>
    <div class="controls"><button data-action="link-add" type="button">Add Link</button></div>
    <div class="links-grid">
      ${state.links
        .map(
          (l) => `
          <article class="link-card">
            <strong>${escapeHtml(l.name)}</strong>
            <div><span class="pill">${escapeHtml(l.category || 'General')}</span></div>
            <a href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.url)}</a>
            <div class="action-row" style="margin-top:8px;">
              <button data-action="link-edit" data-id="${l.id}" type="button">Edit</button>
              <button data-action="link-delete" data-id="${l.id}" type="button">Delete</button>
            </div>
          </article>
        `
        )
        .join('')}
    </div>
  `;
}

function renderWeekSelector() {
  activeWeekSelectEl.innerHTML = WEEK_RANGE
    .map((w) => `<option value="${w}" ${Number(state.uiState.activeWeek) === w ? 'selected' : ''}>Week ${w}</option>`)
    .join('');
}

function renderSidebarState() {
  document.body.classList.toggle('sidebar-collapsed', !!state.uiState.sidebarCollapsed);
  sidebarEl.querySelector('#sidebarToggle').textContent = state.uiState.sidebarCollapsed ? 'Expand' : 'Collapse';
}

function syncActiveNav() {
  const links = sidebarEl.querySelectorAll('nav a[href^="#"]');
  const hash = window.location.hash || '#overview';
  links.forEach((link) => {
    const isActive = link.getAttribute('href') === hash;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function syncTopbarOffset() {
  const height = Math.ceil(topbarEl.getBoundingClientRect().height || topbarEl.offsetHeight || 78);
  document.documentElement.style.setProperty('--topbar-height', `${height}px`);
}

function renderAll() {
  renderTopbarWarning();
  renderWeekSelector();
  syncTopbarOffset();
  renderSidebarState();
  syncActiveNav();
  renderOverview();
  renderReading();
  renderWeekly();
  renderPrompts();
  renderExperiments();
  renderLinks();
}

function renderSection(section) {
  if (section === 'reading') {
    renderReading();
    return;
  }
  if (section === 'prompts') {
    renderPrompts();
    return;
  }
  if (section === 'experiments') {
    renderExperiments();
    return;
  }
  if (section === 'links') {
    renderLinks();
    return;
  }
  if (section === 'weekly') {
    renderWeekSelector();
    renderWeekly();
    renderOverview();
    return;
  }
  if (section === 'overview') {
    renderOverview();
    return;
  }
  renderAll();
}

function inlineCell(type, id, field, value, inputType, options = []) {
  const editing = inlineEditState && inlineEditState.type === type && inlineEditState.id === id && inlineEditState.field === field;
  if (editing) {
    if (inputType === 'select') {
      return `<td><select class="inline-select" data-inline-input="true">${options.map((op) => `<option ${String(op) === String(inlineEditState.value) ? 'selected' : ''}>${op}</option>`).join('')}</select></td>`;
    }
    if (inputType === 'toggle') {
      return `<td><select class="inline-select" data-inline-input="true"><option ${inlineEditState.value === 'Yes' ? 'selected' : ''}>Yes</option><option ${inlineEditState.value === 'No' ? 'selected' : ''}>No</option></select></td>`;
    }
    if (inputType === 'textarea') {
      return `<td><textarea class="inline-textarea" data-inline-input="true">${escapeHtml(inlineEditState.value || '')}</textarea></td>`;
    }
    return `<td><input class="inline-input" data-inline-input="true" type="${inputType === 'date' ? 'date' : 'text'}" value="${escapeAttr(inlineEditState.value || '')}"/></td>`;
  }
  return `<td data-inline-cell="true" data-inline-type="${type}" data-inline-id="${id}" data-inline-field="${field}" data-input-type="${inputType}">${escapeHtml(value || '')}</td>`;
}

function findByTypeAndId(type, id) {
  if (type === 'reading') return state.readingLibrary.find((i) => i.id === id);
  if (type === 'prompt') return state.promptLog.find((i) => i.id === id);
  return null;
}

function applyInlineValue() {
  if (!inlineEditState) return;
  const { type, id, field } = inlineEditState;
  const input = appEl.querySelector('[data-inline-input="true"]');
  if (!input) {
    inlineEditState = null;
    renderAll();
    return;
  }
  const raw = input.value;
  const target = findByTypeAndId(type, id);
  if (!target) return;

  if (type === 'reading' && field === 'title' && !raw.trim()) {
    toast('Title is required', 'error');
    input.focus();
    return;
  }

  commit(() => {
    if (field === 'tags') {
      target.tags = parseTags(raw);
    } else if (field === 'isKey') {
      target.isKey = raw === 'Yes';
    } else if (field === 'relatedWeek') {
      target.relatedWeek = Number(raw);
    } else if (field === 'date') {
      target.date = toISO(raw, nowISO());
    } else {
      target[field] = raw;
    }
    ensureUpdated(target);
    inlineEditState = null;
  });
}

function cancelInline() {
  inlineEditState = null;
  renderAll();
}

function moveItem(arr, from, to) {
  if (to < 0 || to >= arr.length) return;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}

function reorderByIndex(list, fromIndex, targetIndex, placement = 'before') {
  if (!Array.isArray(list)) return null;
  if (fromIndex < 0 || fromIndex >= list.length) return null;
  if (targetIndex < 0 || targetIndex >= list.length) return null;

  const [moved] = list.splice(fromIndex, 1);
  let insertIndex = targetIndex;
  if (fromIndex < targetIndex) insertIndex -= 1;
  if (placement === 'after') insertIndex += 1;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > list.length) insertIndex = list.length;
  list.splice(insertIndex, 0, moved);
  return moved;
}

function reorderById(list, draggedId, targetId, placement = 'before') {
  if (!Array.isArray(list)) return null;
  const from = list.findIndex((item) => item.id === draggedId);
  const targetIndex = list.findIndex((item) => item.id === targetId);
  if (from === -1 || targetIndex === -1) return null;
  return reorderByIndex(list, from, targetIndex, placement);
}

function getDropPlacement(event, element) {
  const rect = element.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  return event.clientY > midpoint ? 'after' : 'before';
}

function getDropContainer(type) {
  if (type === 'goals') return overviewEl?.querySelector('.goals-list');
  if (type === 'reading') return readingEl?.querySelector('tbody');
  if (type === 'prompt') return promptsEl?.querySelector('tbody');
  if (type === 'experiment') return experimentsEl?.querySelector('.cards');
  return null;
}

function resolveDropTarget(event, type) {
  const direct = event.target.closest(`[data-drop-type="${type}"][data-drop-id]`);
  if (direct) return direct;

  const container = getDropContainer(type);
  if (!container) return null;
  const candidates = [...container.querySelectorAll(`[data-drop-type="${type}"][data-drop-id]`)];
  if (!candidates.length) return null;

  const y = event.clientY;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (y <= rect.top + rect.height / 2) return candidate;
  }
  return candidates[candidates.length - 1];
}

function clearDragVisuals() {
  document.querySelectorAll('.drag-over, .drag-over-after, .drag-origin').forEach((el) => {
    el.classList.remove('drag-over');
    el.classList.remove('drag-over-after');
    el.classList.remove('drag-origin');
  });
}

function getModalFocusable() {
  if (!modalState) return [];
  return [...modalHostEl.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
}

function openConfirm(message, onConfirm) {
  openModal({
    title: 'Confirm Action',
    content: `
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button type="button" data-action="modal-cancel">Cancel</button>
        <button type="button" data-action="modal-confirm">Confirm</button>
      </div>
    `,
    onConfirm
  });
}

function sourceTitleFallback(urlString) {
  try {
    const parsed = new URL(urlString);
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return `${parsed.hostname} — ${path || '/'}`;
  } catch (_err) {
    return 'Untitled source';
  }
}

function pickMeta(doc, selectors) {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const value = el?.getAttribute('content') || el?.textContent || '';
    if (value && value.trim()) return value.trim();
  }
  return '';
}

async function fetchSourceMetadata(url) {
  const accessedDate = nowISO();
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title =
      pickMeta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      (doc.querySelector('title')?.textContent || '').trim() ||
      sourceTitleFallback(url);
    const author = pickMeta(doc, ['meta[name="author"]', 'meta[property="article:author"]']);
    return {
      title,
      author,
      accessedDate,
      mode: 'fetched'
    };
  } catch (_err) {
    return {
      title: sourceTitleFallback(url),
      author: '',
      accessedDate,
      mode: 'fallback'
    };
  }
}

async function autoFillReadingForm(triggerEl) {
  const form = triggerEl.closest('form[data-form="reading"]');
  if (!form) return;
  const urlInput = form.querySelector('[name="url"]');
  const titleInput = form.querySelector('[name="title"]');
  const authorInput = form.querySelector('[name="author"]');
  const accessedDateInput = form.querySelector('[name="accessedDate"]');
  const url = (urlInput?.value || '').trim();
  if (!url) {
    toast('Enter a URL first', 'error');
    return;
  }

  triggerEl.disabled = true;
  const metadata = await fetchSourceMetadata(url);
  if (titleInput) titleInput.value = metadata.title || titleInput.value;
  if (authorInput) authorInput.value = metadata.author || authorInput.value;
  if (accessedDateInput) accessedDateInput.value = metadata.accessedDate.slice(0, 10);
  triggerEl.disabled = false;
  toast(metadata.mode === 'fetched' ? 'Metadata auto-filled' : 'Auto-fill fallback used');
}

function openReadingModal(item = null) {
  const source = {
      id: uid(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      title: '',
      author: '',
      url: '',
      tags: [],
      status: SOURCE_STATUSES[0],
      notes: '',
      isKey: false,
      relatedWeek: clampWeek(state.uiState.activeWeek, 5),
      accessedDate: nowISO(),
      ...(item || {})
    };
  const isNew = !item;

  openModal({
    title: isNew ? 'Add Source' : 'Edit Source',
    content: () => `
      <form class="modal-grid" data-form="reading">
        <div class="modal-grid two">
          <label>URL* <input name="url" value="${escapeAttr(source.url)}" ${isNew ? 'required' : ''} /></label>
          <label>Related Week* <select name="relatedWeek">${WEEK_RANGE.map((w) => `<option value="${w}" ${w === clampWeek(source.relatedWeek, state.uiState.activeWeek) ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
        </div>
        <div class="action-row">
          <button type="button" data-action="source-autofill">Auto-fill</button>
        </div>
        <label>Title <input name="title" value="${escapeAttr(source.title)}" /></label>
        <label>Author <input name="author" value="${escapeAttr(source.author)}" /></label>
        <label>Tags (comma separated) <input name="tags" value="${escapeAttr(source.tags.join(', '))}" /></label>
        <label>Status <select name="status">${SOURCE_STATUSES.map((s) => `<option ${s === source.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Key <select name="isKey"><option value="false" ${!source.isKey ? 'selected' : ''}>No</option><option value="true" ${source.isKey ? 'selected' : ''}>Yes</option></select></label>
        <label>Accessed Date <input type="date" name="accessedDate" value="${escapeAttr((source.accessedDate || source.createdAt || nowISO()).slice(0, 10))}" /></label>
        <label>Notes <textarea name="notes">${escapeHtml(source.notes)}</textarea></label>
        <div class="modal-actions">
          <button type="button" data-action="modal-cancel">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    `,
    submit: (form) => {
      const fd = new FormData(form);
      const url = (fd.get('url') || '').toString().trim();
      const relatedWeek = clampWeek(fd.get('relatedWeek'), state.uiState.activeWeek || 5);
      const title = (fd.get('title') || '').toString().trim() || sourceTitleFallback(url);
      if (!url) {
        toast('URL is required', 'error');
        return;
      }
      commit(() => {
        source.title = title;
        source.author = (fd.get('author') || '').toString();
        source.url = url;
        source.tags = parseTags((fd.get('tags') || '').toString());
        source.status = (fd.get('status') || SOURCE_STATUSES[0]).toString();
        source.isKey = fd.get('isKey') === 'true';
        source.notes = (fd.get('notes') || '').toString();
        source.relatedWeek = relatedWeek;
        source.accessedDate = toISO((fd.get('accessedDate') || '').toString(), nowISO());
        ensureUpdated(source);
        if (isNew) {
          state.readingLibrary.unshift(source);
        } else {
          const idx = state.readingLibrary.findIndex((r) => r.id === source.id);
          if (idx !== -1) state.readingLibrary[idx] = { ...state.readingLibrary[idx], ...source };
        }
      });
      closeModal();
    }
  });
}

function makeWeekDraft(week) {
  return {
    owner: week.owner || '',
    status: week.status || 'Planned',
    deliverables: week.deliverables || '',
    risks: week.risks || '',
    milestones: week.milestones.map((m) => ({ id: m.id, text: m.text, done: !!m.done }))
  };
}

function openWeekModal(week, incomingDraft = null) {
  const draft = incomingDraft || makeWeekDraft(week);
  openModal({
    title: `Edit Week ${week.weekNumber}`,
    type: 'week',
    weekId: week.id,
    draft,
    content: () => `
      <form class="modal-grid" data-form="week">
        <label>Owner <input name="owner" value="${escapeAttr(draft.owner || '')}" /></label>
        <label>Status <select name="status">${WEEK_STATUSES.map((s) => `<option ${s === draft.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Deliverables <textarea name="deliverables">${escapeHtml(draft.deliverables || '')}</textarea></label>
        <label>Risks <textarea name="risks">${escapeHtml(draft.risks || '')}</textarea></label>
        <div>
          <strong>Milestones</strong>
          ${draft.milestones
            .map(
              (m, idx) => `
            <div class="goal-item">
              <input type="checkbox" data-action="milestone-toggle" data-week-id="${week.id}" data-mid="${m.id}" ${m.done ? 'checked' : ''}/>
              <input type="text" value="${escapeAttr(m.text)}" data-action="milestone-edit" data-week-id="${week.id}" data-mid="${m.id}" />
              <button type="button" data-action="milestone-up" data-week-id="${week.id}" data-idx="${idx}">Up</button>
              <button type="button" data-action="milestone-down" data-week-id="${week.id}" data-idx="${idx}">Down</button>
              <button type="button" data-action="milestone-delete" data-week-id="${week.id}" data-mid="${m.id}">Delete</button>
            </div>
          `
            )
            .join('')}
          <div class="goal-item">
            <input type="text" id="newMilestoneInput" placeholder="New milestone" />
            <button type="button" data-action="milestone-add" data-week-id="${week.id}">Add Milestone</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" data-action="modal-cancel">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    `,
    submit: (form) => {
      const fd = new FormData(form);
      const nextStatus = (fd.get('status') || 'Planned').toString();
      const nextDraft = modalState?.draft || draft;
      commit(() => {
        week.owner = (fd.get('owner') || '').toString();
        week.status = nextStatus;
        week.deliverables = (fd.get('deliverables') || '').toString();
        week.risks = (fd.get('risks') || '').toString();
        week.milestones = nextDraft.milestones.map((m) => ({ id: m.id, text: m.text, done: !!m.done }));

        if (nextStatus === 'Active') {
          state.weeklyPlan.forEach((w) => {
            if (w.id !== week.id && w.status === 'Active') {
              w.status = 'Planned';
              ensureUpdated(w);
            }
          });
          state.uiState.activeWeek = week.weekNumber;
        } else {
          const alreadyActive = state.weeklyPlan.find((w) => w.id !== week.id && w.status === 'Active');
          if (alreadyActive) {
            state.uiState.activeWeek = alreadyActive.weekNumber;
          } else {
            const fallback = state.weeklyPlan.find((w) => w.id !== week.id && w.status !== 'Done');
            if (fallback) {
              fallback.status = 'Active';
              state.uiState.activeWeek = fallback.weekNumber;
              ensureUpdated(fallback);
            } else {
              week.status = 'Active';
              state.uiState.activeWeek = week.weekNumber;
            }
          }
        }
        ensureUpdated(week);
      });
      closeModal();
    }
  });
}

function openPromptModal(item = null) {
  const p =
    item || {
      id: uid(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      date: nowISO(),
      prompt: '',
      model: 'GPT-5',
      outputSummary: '',
      changedNext: '',
      tags: [],
      relatedWeek: Number(state.uiState.activeWeek),
      relatedSourceIds: []
    };
  const isNew = !item;
  const customModel = MODEL_OPTIONS.includes(p.model) ? '' : p.model;

  openModal({
    title: isNew ? 'Add Prompt' : 'Edit Prompt',
    content: () => `
      <form class="modal-grid" data-form="prompt">
        <div class="modal-grid two">
          <label>Date <input type="date" name="date" value="${escapeAttr(p.date.slice(0, 10))}" /></label>
          <label>Week <select name="relatedWeek">${[5, 6, 7, 8, 9, 10, 11].map((w) => `<option value="${w}" ${w === p.relatedWeek ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
        </div>
        <label>Model <select name="model" data-action="model-select">${MODEL_OPTIONS.map((m) => `<option ${m === (customModel ? 'Other' : p.model) ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="${customModel ? '' : 'hidden'}" data-other-model-wrap>Custom model <input name="customModel" value="${escapeAttr(customModel)}"/></label>
        <label>Prompt <textarea name="prompt">${escapeHtml(p.prompt)}</textarea></label>
        <label>Output Summary <textarea name="outputSummary">${escapeHtml(p.outputSummary)}</textarea></label>
        <label>What I changed next <textarea name="changedNext">${escapeHtml(p.changedNext)}</textarea></label>
        <label>Tags <input name="tags" value="${escapeAttr(p.tags.join(', '))}" /></label>
        <label>Related Sources
          <select name="relatedSourceIds" multiple size="6">
            ${state.readingLibrary
              .map((s) => `<option value="${s.id}" ${p.relatedSourceIds.includes(s.id) ? 'selected' : ''}>${escapeHtml(s.title)}</option>`)
              .join('')}
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" data-action="modal-cancel">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    `,
    submit: (form) => {
      const fd = new FormData(form);
      commit(() => {
        p.date = toISO((fd.get('date') || '').toString(), nowISO());
        const selectedModel = (fd.get('model') || 'GPT-5').toString();
        const custom = (fd.get('customModel') || '').toString().trim();
        p.model = selectedModel === 'Other' && custom ? custom : selectedModel;
        p.prompt = (fd.get('prompt') || '').toString();
        p.outputSummary = (fd.get('outputSummary') || '').toString();
        p.changedNext = (fd.get('changedNext') || '').toString();
        p.tags = parseTags((fd.get('tags') || '').toString());
        p.relatedWeek = Number(fd.get('relatedWeek') || 5);
        p.relatedSourceIds = [...form.querySelector('[name="relatedSourceIds"]').selectedOptions].map((o) => o.value);
        ensureUpdated(p);
        if (isNew) state.promptLog.unshift(p);
      });
      closeModal();
    }
  });
}

function openExperimentModal(item = null) {
  const e =
    item || {
      id: uid(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      date: nowISO(),
      title: '',
      whatITried: '',
      outcome: '',
      nextStep: '',
      imageUrls: [],
      notes: '',
      tags: [],
      relatedWeek: Number(state.uiState.activeWeek)
    };
  const isNew = !item;

  openModal({
    title: isNew ? 'Add Experiment' : 'Edit Experiment',
    content: () => `
      <form class="modal-grid" data-form="experiment">
        <div class="modal-grid two">
          <label>Title <input name="title" value="${escapeAttr(e.title)}" required /></label>
          <label>Date <input type="date" name="date" value="${escapeAttr(e.date.slice(0, 10))}" /></label>
        </div>
        <label>Week <select name="relatedWeek">${[5, 6, 7, 8, 9, 10, 11].map((w) => `<option value="${w}" ${w === e.relatedWeek ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
        <label>Tags <input name="tags" value="${escapeAttr(e.tags.join(', '))}"/></label>
        <label>What I tried <textarea name="whatITried">${escapeHtml(e.whatITried)}</textarea></label>
        <label>Outcome <textarea name="outcome">${escapeHtml(e.outcome)}</textarea></label>
        <label>Next step <textarea name="nextStep">${escapeHtml(e.nextStep)}</textarea></label>
        <label>Image URLs (comma or newline separated) <textarea name="imageUrls">${escapeHtml(e.imageUrls.join('\n'))}</textarea></label>
        <label>Notes <textarea name="notes">${escapeHtml(e.notes || '')}</textarea></label>
        <div class="modal-actions">
          <button type="button" data-action="modal-cancel">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    `,
    submit: (form) => {
      const fd = new FormData(form);
      const title = (fd.get('title') || '').toString().trim();
      if (!title) {
        toast('Title is required', 'error');
        return;
      }
      commit(() => {
        e.title = title;
        e.date = toISO((fd.get('date') || '').toString(), nowISO());
        e.relatedWeek = Number(fd.get('relatedWeek') || 5);
        e.tags = parseTags((fd.get('tags') || '').toString());
        e.whatITried = (fd.get('whatITried') || '').toString();
        e.outcome = (fd.get('outcome') || '').toString();
        e.nextStep = (fd.get('nextStep') || '').toString();
        e.imageUrls = (fd.get('imageUrls') || '')
          .toString()
          .split(/[\n,]/)
          .map((u) => u.trim())
          .filter(Boolean);
        e.notes = (fd.get('notes') || '').toString();
        ensureUpdated(e);
        if (isNew) state.experimentLog.unshift(e);
      });
      closeModal();
    }
  });
}

function openLinkModal(item = null) {
  const l =
    item || {
      id: uid(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      name: '',
      url: '',
      category: 'General'
    };
  const isNew = !item;

  openModal({
    title: isNew ? 'Add Link' : 'Edit Link',
    content: () => `
      <form class="modal-grid" data-form="link">
        <label>Name <input name="name" value="${escapeAttr(l.name)}" required /></label>
        <label>URL <input name="url" value="${escapeAttr(l.url)}" required /></label>
        <label>Category <input name="category" value="${escapeAttr(l.category || '')}" /></label>
        <div class="modal-actions">
          <button type="button" data-action="modal-cancel">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    `,
    submit: (form) => {
      const fd = new FormData(form);
      const name = (fd.get('name') || '').toString().trim();
      const url = (fd.get('url') || '').toString().trim();
      if (!name || !url) {
        toast('Name and URL are required', 'error');
        return;
      }
      commit(() => {
        l.name = name;
        l.url = url;
        l.category = (fd.get('category') || '').toString();
        ensureUpdated(l);
        if (isNew) state.links.unshift(l);
      });
      closeModal();
    }
  });
}

function handleActionClick(action, target, event) {
  if (!action) return;

  if (action === 'modal-cancel') {
    if (event) event.preventDefault();
    closeModal();
    return;
  }

  if (action === 'modal-confirm' && modalState?.onConfirm) {
    modalState.onConfirm();
    closeModal();
    return;
  }

  if (action === 'source-autofill') {
    if (event) event.preventDefault();
    autoFillReadingForm(target);
    return;
  }

  if (action === 'goal-add') {
    const input = document.getElementById('newGoalInput');
    if (!input || !input.value.trim()) return;
    commit(() => {
      state.projectOverview.goals.push(input.value.trim());
    });
    return;
  }

  if (action === 'goal-edit') return;

  if (action === 'goal-remove') {
    const idx = Number(target.dataset.index);
    commit(() => {
      state.projectOverview.goals.splice(idx, 1);
    });
    return;
  }

  if (action === 'goal-up' || action === 'goal-down') {
    const idx = Number(target.dataset.index);
    commit(() => {
      moveItem(state.projectOverview.goals, idx, action === 'goal-up' ? idx - 1 : idx + 1);
    });
    return;
  }

  if (action === 'reading-add') {
    openReadingModal();
    return;
  }

  if (action === 'reading-edit') {
    const item = state.readingLibrary.find((r) => r.id === target.dataset.id);
    if (item) openReadingModal(item);
    return;
  }

  if (action === 'reading-delete') {
    const id = target.dataset.id;
    openConfirm('Delete this source?', () => {
      commit(() => {
        state.readingLibrary = state.readingLibrary.filter((r) => r.id !== id);
      }, 'Deleted');
    });
    return;
  }

  if (action === 'reading-expand') {
    const id = target.dataset.id;
    commit(
      () => {
        state.uiState.expandedRows.reading[id] = !state.uiState.expandedRows.reading[id];
      },
      null
    );
    return;
  }

  if (action === 'reading-remove-tag') {
    const source = state.readingLibrary.find((r) => r.id === target.dataset.id);
    if (!source) return;
    commit(() => {
      source.tags = source.tags.filter((t) => t !== target.dataset.tag);
      ensureUpdated(source);
    }, 'Tag removed');
    return;
  }

  if (action === 'week-edit') {
    const w = state.weeklyPlan.find((x) => x.id === target.dataset.id);
    if (w) openWeekModal(w);
    return;
  }

  if (action === 'week-set-active') {
    const w = state.weeklyPlan.find((x) => x.id === target.dataset.id);
    if (!w) return;
    commit(() => {
      state.weeklyPlan.forEach((x) => {
        x.status = x.id === w.id ? 'Active' : x.status === 'Active' ? 'Planned' : x.status;
        ensureUpdated(x);
      });
      state.uiState.activeWeek = w.weekNumber;
    });
    return;
  }

  if (action === 'week-mark-done') {
    const w = state.weeklyPlan.find((x) => x.id === target.dataset.id);
    if (!w) return;
    commit(() => {
      w.status = 'Done';
      ensureUpdated(w);
      if (!state.weeklyPlan.some((x) => x.status === 'Active')) {
        const fallback = state.weeklyPlan.find((x) => x.status !== 'Done') || state.weeklyPlan[0];
        fallback.status = 'Active';
        state.uiState.activeWeek = fallback.weekNumber;
        ensureUpdated(fallback);
      }
    });
    return;
  }

  if (action === 'milestone-add') {
    if (modalState?.type !== 'week') return;
    const input = document.getElementById('newMilestoneInput');
    if (!input || !input.value.trim()) return;
    modalState.draft.milestones.push({ id: uid(), text: input.value.trim(), done: false });
    const refreshed = state.weeklyPlan.find((x) => x.id === target.dataset.weekId);
    if (refreshed) openWeekModal(refreshed, modalState.draft);
    return;
  }

  if (action === 'milestone-delete') {
    if (modalState?.type !== 'week') return;
    modalState.draft.milestones = modalState.draft.milestones.filter((m) => m.id !== target.dataset.mid);
    const refreshed = state.weeklyPlan.find((x) => x.id === target.dataset.weekId);
    if (refreshed) openWeekModal(refreshed, modalState.draft);
    return;
  }

  if (action === 'milestone-up' || action === 'milestone-down') {
    if (modalState?.type !== 'week') return;
    const idx = Number(target.dataset.idx);
    moveItem(modalState.draft.milestones, idx, action === 'milestone-up' ? idx - 1 : idx + 1);
    const refreshed = state.weeklyPlan.find((x) => x.id === target.dataset.weekId);
    if (refreshed) openWeekModal(refreshed, modalState.draft);
    return;
  }

  if (action === 'prompt-add') {
    openPromptModal();
    return;
  }

  if (action === 'prompt-edit') {
    const p = state.promptLog.find((x) => x.id === target.dataset.id);
    if (p) openPromptModal(p);
    return;
  }

  if (action === 'prompt-delete') {
    const id = target.dataset.id;
    openConfirm('Delete this prompt entry?', () => {
      commit(() => {
        state.promptLog = state.promptLog.filter((p) => p.id !== id);
      }, 'Deleted');
    });
    return;
  }

  if (action === 'prompt-expand') {
    const id = target.dataset.id;
    commit(
      () => {
        state.uiState.expandedRows.prompts[id] = !state.uiState.expandedRows.prompts[id];
      },
      null
    );
    return;
  }

  if (action === 'prompt-copy') {
    const p = state.promptLog.find((x) => x.id === target.dataset.id);
    if (!p) return;
    navigator.clipboard
      .writeText(p.prompt)
      .then(() => toast('Prompt copied'))
      .catch(() => toast('Clipboard unavailable', 'error'));
    return;
  }

  if (action === 'experiment-add') {
    openExperimentModal();
    return;
  }

  if (action === 'experiment-edit') {
    const e = state.experimentLog.find((x) => x.id === target.dataset.id);
    if (e) openExperimentModal(e);
    return;
  }

  if (action === 'experiment-delete') {
    const id = target.dataset.id;
    openConfirm('Delete this experiment?', () => {
      commit(() => {
        state.experimentLog = state.experimentLog.filter((e) => e.id !== id);
      }, 'Deleted');
    });
    return;
  }

  if (action === 'experiment-expand') {
    const id = target.dataset.id;
    commit(
      () => {
        state.uiState.expandedRows.experiments[id] = !state.uiState.expandedRows.experiments[id];
      },
      null
    );
    return;
  }

  if (action === 'link-add') {
    openLinkModal();
    return;
  }

  if (action === 'link-edit') {
    const l = state.links.find((x) => x.id === target.dataset.id);
    if (l) openLinkModal(l);
    return;
  }

  if (action === 'link-delete') {
    const id = target.dataset.id;
    openConfirm('Delete this link?', () => {
      commit(() => {
        state.links = state.links.filter((l) => l.id !== id);
      }, 'Deleted');
    });
    return;
  }

  if (action === 'sidebar-toggle') {
    commit(() => {
      state.uiState.sidebarCollapsed = !state.uiState.sidebarCollapsed;
    }, null);
    return;
  }
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(v) {
  return escapeHtml(v).replaceAll('`', '&#96;');
}

function onAppClick(event) {
  const overlay = event.target.closest('[data-overlay-close="true"]');
  const modalBody = event.target.closest('.modal');
  if (overlay && !modalBody) {
    closeModal();
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    if (actionEl.id === 'sidebarToggle') actionEl.dataset.action = 'sidebar-toggle';
    handleActionClick(actionEl.dataset.action, actionEl, event);
    return;
  }

  const cell = event.target.closest('[data-inline-cell="true"]');
  if (cell) {
    inlineEditState = {
      type: cell.dataset.inlineType,
      id: cell.dataset.inlineId,
      field: cell.dataset.inlineField,
      inputType: cell.dataset.inputType,
      value: cell.textContent.trim()
    };
    renderAll();
    const input = appEl.querySelector('[data-inline-input="true"]');
    if (input) input.focus();
  }
}

function onAppChange(event) {
  const filterKey = event.target.dataset.filter;
  if (filterKey) {
    const nextValue = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFilterValue(filterKey, nextValue);
    persistWithoutRender();
    const section = SEARCH_FILTER_TO_SECTION[filterKey] || (filterKey.startsWith('reading') ? 'reading' : filterKey.startsWith('prompt') ? 'prompts' : 'experiments');
    renderSection(section);
    return;
  }

  if (event.target.id === 'activeWeekSelect') {
    const weekNum = Number(event.target.value);
    commit(() => {
      state.uiState.activeWeek = weekNum;
      state.weeklyPlan.forEach((w) => {
        if (w.weekNumber === weekNum) w.status = 'Active';
        else if (w.status === 'Active') w.status = 'Planned';
        ensureUpdated(w);
      });
    }, null);
    return;
  }

  if (event.target.matches('[data-action="milestone-toggle"]')) {
    if (modalState?.type !== 'week') return;
    const mile = modalState.draft?.milestones?.find((m) => m.id === event.target.dataset.mid);
    if (!mile) return;
    mile.done = event.target.checked;
    return;
  }

  if (event.target.matches('[data-action="model-select"]')) {
    const wrap = modalHostEl.querySelector('[data-other-model-wrap]');
    if (!wrap) return;
    wrap.classList.toggle('hidden', event.target.value !== 'Other');
    return;
  }

  if (inlineEditState && event.target.matches('[data-inline-input="true"]')) {
    // no-op
  }
}

function onAppInput(event) {
  const filterKey = event.target.dataset.filter;
  if (filterKey && event.target.tagName === 'INPUT') {
    setFilterValue(filterKey, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    persistWithoutRender();
    const section = SEARCH_FILTER_TO_SECTION[filterKey];
    if (section) queueSectionRender(section);
    return;
  }
}

function onAppBlur(event) {
  if (event.target.matches('[data-action="overview-edit"]')) {
    const field = event.target.dataset.field;
    if (!field) return;
    commit(() => {
      state.projectOverview[field] = event.target.value;
    });
    return;
  }

  if (inlineEditState && event.target.matches('[data-inline-input="true"]')) {
    applyInlineValue();
  }

  if (event.target.matches('[data-action="goal-edit"]')) {
    const idx = Number(event.target.dataset.index);
    commit(
      () => {
        state.projectOverview.goals[idx] = event.target.value;
      },
      null
    );
    return;
  }

  if (event.target.matches('[data-action="milestone-edit"]')) {
    if (modalState?.type !== 'week') return;
    const mile = modalState.draft?.milestones?.find((m) => m.id === event.target.dataset.mid);
    if (!mile) return;
    mile.text = event.target.value;
  }
}

function onAppKeydown(event) {
  if (modalState) {
    if (event.key === 'Escape') {
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = getModalFocusable();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (inlineEditState && event.target.matches('[data-inline-input="true"]')) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      applyInlineValue();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInline();
    }
  }
}

function onAppSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form || !modalState) return;
  event.preventDefault();
  if (modalState.submit) modalState.submit(form);
}

function onAppDragStart(event) {
  const dragEl = event.target.closest('[draggable="true"][data-drag-type][data-drag-id]');
  if (!dragEl) return;
  dragState = {
    type: dragEl.dataset.dragType,
    id: dragEl.dataset.dragId,
    placement: 'before'
  };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${dragState.type}:${dragState.id}`);
  }
  const origin = dragEl.closest('[data-drop-type]');
  if (origin) origin.classList.add('drag-origin');
}

function onAppDragOver(event) {
  if (!dragState) return;
  const dropTarget = resolveDropTarget(event, dragState.type);
  if (!dropTarget) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const placement = getDropPlacement(event, dropTarget);
  dragState.placement = placement;
  clearDragVisuals();
  dropTarget.classList.add('drag-over');
  dropTarget.classList.toggle('drag-over-after', placement === 'after');
}

function onAppDrop(event) {
  if (!dragState) return;
  const dropTarget = resolveDropTarget(event, dragState.type);
  if (!dropTarget) return;
  event.preventDefault();

  const targetId = dropTarget.dataset.dropId;
  const placement = dragState.placement || 'before';
  if (targetId === dragState.id) {
    clearDragVisuals();
    dragState = null;
    return;
  }

  if (dragState.type === 'goals') {
    const from = Number(dragState.id);
    const to = Number(targetId);
    if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
      commit(
        () => {
          reorderByIndex(state.projectOverview.goals, from, to, placement);
        },
        { message: 'Order saved', render: 'overview' }
      );
    }
  }

  if (dragState.type === 'reading') {
    commit(
      () => {
        const moved = reorderById(state.readingLibrary, dragState.id, targetId, placement);
        if (!moved) return;
        state.uiState.filters.reading.sort = 'manual';
        ensureUpdated(moved);
      },
      { message: 'Order saved', render: 'reading' }
    );
  }

  if (dragState.type === 'prompt') {
    commit(
      () => {
        const moved = reorderById(state.promptLog, dragState.id, targetId, placement);
        if (moved) ensureUpdated(moved);
      },
      { message: 'Order saved', render: 'prompts' }
    );
  }

  if (dragState.type === 'experiment') {
    commit(
      () => {
        const moved = reorderById(state.experimentLog, dragState.id, targetId, placement);
        if (moved) ensureUpdated(moved);
      },
      { message: 'Order saved', render: 'experiments' }
    );
  }

  clearDragVisuals();
  dragState = null;
}

function onAppDragEnd() {
  clearDragVisuals();
  dragState = null;
}

function init() {
  state = loadState();
  initTheme();
  renderAll();
  const syncTopbarOffsetDebounced = debounce(syncTopbarOffset, 120);

  document.addEventListener('click', onAppClick);
  document.addEventListener('change', onAppChange);
  document.addEventListener('input', onAppInput);
  document.addEventListener('focusout', onAppBlur);
  document.addEventListener('keydown', onAppKeydown);
  document.addEventListener('submit', onAppSubmit);
  document.addEventListener('dragstart', onAppDragStart);
  document.addEventListener('dragover', onAppDragOver);
  document.addEventListener('drop', onAppDrop);
  document.addEventListener('dragend', onAppDragEnd);
  window.addEventListener('resize', syncTopbarOffsetDebounced);
  window.addEventListener('hashchange', syncActiveNav);
}

init();

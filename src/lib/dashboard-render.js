import {
  MODEL_OPTIONS,
  READING_SORT_OPTIONS,
  SOURCE_STATUSES,
  WEEK_RANGE,
  activeWeekCompletion
} from './dashboard-state.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '';
  return date.toLocaleDateString();
}

function activeWeek(state) {
  return state.weeklyPlan.find((week) => week.weekNumber === Number(state.uiState.activeWeek)) || state.weeklyPlan[0];
}

function statusSummary(state) {
  return SOURCE_STATUSES.map((status) => {
    const count = state.readingLibrary.filter((source) => source.status === status).length;
    return `${status.slice(0, 2).toUpperCase()}:${count}`;
  }).join(' ');
}

function filteredReading(state) {
  const filters = state.uiState.filters.reading;
  const rows = state.readingLibrary.filter((source) => {
    const haystack = `${source.title} ${source.author} ${source.notes}`.toLowerCase();
    if (filters.query && !haystack.includes(filters.query.toLowerCase())) return false;
    if (filters.status !== 'All' && source.status !== filters.status) return false;
    if (filters.week !== 'All' && String(source.relatedWeek) !== String(filters.week)) return false;
    if (filters.keyOnly && !source.isKey) return false;
    return true;
  });

  if (filters.sort === 'manual') return rows;
  if (filters.sort === 'relatedWeek') {
    return rows.sort((a, b) => a.relatedWeek - b.relatedWeek || a.title.localeCompare(b.title));
  }

  const key = filters.sort;
  return rows.sort((a, b) => {
    const av = (a[key] || '').toString().toLowerCase();
    const bv = (b[key] || '').toString().toLowerCase();
    return av.localeCompare(bv);
  });
}

function filteredPrompts(state) {
  const filters = state.uiState.filters.prompts;
  return state.promptLog.filter((entry) => {
    const haystack = `${entry.prompt} ${entry.outputSummary} ${entry.changedNext}`.toLowerCase();
    if (filters.query && !haystack.includes(filters.query.toLowerCase())) return false;
    if (filters.model !== 'All' && entry.model !== filters.model) return false;
    if (filters.week !== 'All' && Number(filters.week) !== entry.relatedWeek) return false;
    if (filters.tag !== 'All' && !entry.tags.includes(filters.tag)) return false;
    return true;
  });
}

function filteredExperiments(state) {
  const filters = state.uiState.filters.experiments;
  return state.experimentLog.filter((entry) => {
    const haystack = `${entry.title} ${entry.whatITried} ${entry.outcome} ${entry.nextStep} ${entry.notes}`.toLowerCase();
    if (filters.query && !haystack.includes(filters.query.toLowerCase())) return false;
    if (filters.week !== 'All' && Number(filters.week) !== entry.relatedWeek) return false;
    if (filters.tag !== 'All' && !entry.tags.includes(filters.tag)) return false;
    return true;
  });
}

function promptModels(state) {
  return ['All', ...new Set([...MODEL_OPTIONS.filter((model) => model !== 'Other'), ...state.promptLog.map((entry) => entry.model)])];
}

function promptTags(state) {
  return ['All', ...new Set(state.promptLog.flatMap((entry) => entry.tags))].filter(Boolean);
}

function experimentTags(state) {
  return ['All', ...new Set(state.experimentLog.flatMap((entry) => entry.tags))].filter(Boolean);
}

export function renderStorageStatus(state) {
  const savedAt = state.uiState.lastSavedAt ? `Saved ${formatDate(state.uiState.lastSavedAt)}` : 'Ready';
  return `<div id="storageStatus">SERVER: ${escapeHtml(savedAt)}</div>`;
}

export function renderActiveWeekControl(state) {
  return `
    <form
      id="activeWeekForm"
      hx-post="/api/dashboard"
      hx-target="#weekly"
      hx-swap="outerHTML"
    >
      <input type="hidden" name="intent" value="active-week-set" />
      <label class="week-select-label" for="activeWeekSelect">Active Week</label>
      <select id="activeWeekSelect" name="weekNumber" aria-label="Active Week Selector" hx-trigger="change">
        ${WEEK_RANGE.map((week) => `<option value="${week}" ${Number(state.uiState.activeWeek) === week ? 'selected' : ''}>Week ${week}</option>`).join('')}
      </select>
    </form>
  `;
}

export function renderOverviewSection(state) {
  return `
    <section id="overview">
      <h2 class="section-title">Overview</h2>
      ${state._meta?.dataIssueDetected ? '<div class="warning-banner">Stored data was invalid. Demo data was restored before migration.</div>' : ''}
      <div class="ref-flag">Ref Flag: Review standards-to-signals alignment before weekly adjustment lock.</div>
      <form
        class="modal-grid"
        hx-post="/api/dashboard"
        hx-target="#overview"
        hx-swap="outerHTML"
      >
        <input type="hidden" name="intent" value="overview-save" />
        <div class="inline-row" style="margin-top:8px;">
          <label style="flex:1;">
            Focus
            <textarea name="focus">${escapeHtml(state.projectOverview.focus)}</textarea>
          </label>
          <label style="flex:1;">
            Research Question
            <textarea name="question">${escapeHtml(state.projectOverview.question)}</textarea>
          </label>
        </div>
        <label>
          Goals (one per line)
          <textarea name="goals">${escapeHtml(state.projectOverview.goals.join('\n'))}</textarea>
        </label>
        <div class="modal-actions">
          <button type="submit">Save Overview</button>
        </div>
      </form>
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
        <div class="kpi"><div class="label">Source Status</div><div class="value">${escapeHtml(statusSummary(state))}</div></div>
        <div class="kpi"><div class="label">Prompt Logs</div><div class="value">${state.promptLog.length}</div></div>
        <div class="kpi"><div class="label">Experiments</div><div class="value">${state.experimentLog.length}</div></div>
        <div class="kpi"><div class="label">Active Week Completion</div><div class="value">${activeWeekCompletion(state)}%</div></div>
      </div>
    </section>
  `;
}

export function renderReadingSection(state) {
  const filters = state.uiState.filters.reading;
  const rows = filteredReading(state);
  return `
    <section id="reading">
      <h2 class="section-title">Reading Library</h2>
      <form class="table-toolbar" hx-post="/api/dashboard" hx-target="#reading" hx-swap="outerHTML">
        <input type="hidden" name="intent" value="reading-filters" />
        <button type="button" hx-get="/fragments/modal?type=reading" hx-target="#modalHost" hx-swap="innerHTML">Add Source</button>
        <input type="text" name="query" placeholder="Search title/author/notes" value="${escapeAttr(filters.query)}" hx-trigger="keyup changed delay:200ms" />
        <select name="status" hx-trigger="change">${['All', ...SOURCE_STATUSES].map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select>
        <select name="week" hx-trigger="change">${['All', ...WEEK_RANGE].map((week) => `<option value="${week}" ${String(filters.week) === String(week) ? 'selected' : ''}>${week === 'All' ? 'All weeks' : `Week ${week}`}</option>`).join('')}</select>
        <label class="pill"><input type="checkbox" name="keyOnly" value="true" ${filters.keyOnly ? 'checked' : ''} hx-trigger="change" /> Key Only</label>
        <select name="sort" hx-trigger="change">${READING_SORT_OPTIONS.map((sort) => `<option value="${sort}" ${filters.sort === sort ? 'selected' : ''}>Sort: ${sort === 'relatedWeek' ? 'week 5-11' : sort}</option>`).join('')}</select>
      </form>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Title</th><th>Author</th><th>Link</th><th>Week Tag</th><th>Status</th><th>Key</th><th>Notes</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (source) => `
                  <tr>
                    <td>${escapeHtml(source.title)}</td>
                    <td>${escapeHtml(source.author)}</td>
                    <td><a href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.url)}</a></td>
                    <td>Week ${source.relatedWeek}</td>
                    <td>${escapeHtml(source.status)}</td>
                    <td>${source.isKey ? 'Yes' : 'No'}</td>
                    <td>${escapeHtml(source.notes || 'No notes')}</td>
                    <td>
                      <div class="action-row">
                        <button type="button" hx-get="/fragments/modal?type=reading&id=${encodeURIComponent(source.id)}" hx-target="#modalHost" hx-swap="innerHTML">Edit</button>
                        <button type="button" hx-post="/api/dashboard?intent=reading-delete&id=${encodeURIComponent(source.id)}" hx-confirm="Delete this source?" hx-target="#reading" hx-swap="outerHTML">Delete</button>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderWeeklySection(state) {
  return `
    <section id="weekly">
      <h2 class="section-title">Weekly Plan</h2>
      <div class="week-grid">
        ${state.weeklyPlan
          .sort((a, b) => a.weekNumber - b.weekNumber)
          .map((week) => {
            const total = week.milestones.length || 1;
            const done = week.milestones.filter((milestone) => milestone.done).length;
            const percent = Math.round((done / total) * 100);
            return `
              <article class="week-card">
                <div class="inline-row" style="justify-content:space-between;align-items:center;">
                  <span class="badge">Week ${week.weekNumber}</span>
                  <span class="pill">${escapeHtml(week.status)}</span>
                </div>
                <h3>${escapeHtml(week.owner || 'Unassigned')}</h3>
                <div class="progress"><div class="progress-bar" style="width:${percent}%"></div></div>
                <p><strong>Deliverables:</strong> ${escapeHtml(week.deliverables)}</p>
                <p><strong>Risks:</strong> ${escapeHtml(week.risks)}</p>
                <details>
                  <summary>Milestones (${done}/${total})</summary>
                  <ul>
                    ${week.milestones.map((milestone) => `<li>${milestone.done ? '[x]' : '[ ]'} ${escapeHtml(milestone.text)}</li>`).join('')}
                  </ul>
                </details>
                <div class="week-actions">
                  <button type="button" hx-get="/fragments/modal?type=weekly&id=${encodeURIComponent(week.id)}" hx-target="#modalHost" hx-swap="innerHTML">Edit</button>
                  <button type="button" hx-post="/api/dashboard?intent=weekly-set-active&id=${encodeURIComponent(week.id)}" hx-target="#weekly" hx-swap="outerHTML">Set Active</button>
                  <button type="button" hx-post="/api/dashboard?intent=weekly-mark-done&id=${encodeURIComponent(week.id)}" hx-target="#weekly" hx-swap="outerHTML">Mark Done</button>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

export function renderPromptSection(state) {
  const filters = state.uiState.filters.prompts;
  const rows = filteredPrompts(state);
  return `
    <section id="prompts">
      <h2 class="section-title">Prompt Log</h2>
      <form class="table-toolbar" hx-post="/api/dashboard" hx-target="#prompts" hx-swap="outerHTML">
        <input type="hidden" name="intent" value="prompt-filters" />
        <button type="button" hx-get="/fragments/modal?type=prompt" hx-target="#modalHost" hx-swap="innerHTML">Add Prompt</button>
        <input type="text" name="query" placeholder="Search prompt/summary/changes" value="${escapeAttr(filters.query)}" hx-trigger="keyup changed delay:200ms" />
        <select name="model" hx-trigger="change">${promptModels(state).map((model) => `<option value="${model}" ${filters.model === model ? 'selected' : ''}>${model}</option>`).join('')}</select>
        <select name="week" hx-trigger="change">${['All', ...WEEK_RANGE].map((week) => `<option value="${week}" ${String(filters.week) === String(week) ? 'selected' : ''}>${week}</option>`).join('')}</select>
        <select name="tag" hx-trigger="change">${promptTags(state).map((tag) => `<option value="${tag}" ${filters.tag === tag ? 'selected' : ''}>${tag}</option>`).join('')}</select>
      </form>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Model</th><th>Week</th><th>Tags</th><th>Summary</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${rows
              .map((entry) => {
                const relatedSources = entry.relatedSourceIds
                  .map((id) => state.readingLibrary.find((source) => source.id === id)?.title)
                  .filter(Boolean);
                return `
                  <tr>
                    <td>${escapeHtml(formatDate(entry.date))}</td>
                    <td>${escapeHtml(entry.model)}</td>
                    <td>${entry.relatedWeek}</td>
                    <td>${escapeHtml(entry.tags.join(', '))}</td>
                    <td>
                      <details>
                        <summary>${escapeHtml(entry.outputSummary || 'No summary')}</summary>
                        <p><strong>Prompt:</strong> ${escapeHtml(entry.prompt)}</p>
                        <p><strong>Changed Next:</strong> ${escapeHtml(entry.changedNext || 'None')}</p>
                        <p><strong>Sources:</strong> ${escapeHtml(relatedSources.join(', ') || 'None')}</p>
                      </details>
                    </td>
                    <td>
                      <div class="action-row">
                        <button type="button" hx-get="/fragments/modal?type=prompt&id=${encodeURIComponent(entry.id)}" hx-target="#modalHost" hx-swap="innerHTML">Edit</button>
                        <button type="button" hx-post="/api/dashboard?intent=prompt-delete&id=${encodeURIComponent(entry.id)}" hx-confirm="Delete this prompt?" hx-target="#prompts" hx-swap="outerHTML">Delete</button>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderExperimentSection(state) {
  const filters = state.uiState.filters.experiments;
  const rows = filteredExperiments(state);
  return `
    <section id="experiments">
      <h2 class="section-title">Experiment Log</h2>
      <form class="table-toolbar" hx-post="/api/dashboard" hx-target="#experiments" hx-swap="outerHTML">
        <input type="hidden" name="intent" value="experiment-filters" />
        <button type="button" hx-get="/fragments/modal?type=experiment" hx-target="#modalHost" hx-swap="innerHTML">Add Experiment</button>
        <input type="text" name="query" placeholder="Search title/outcomes/notes" value="${escapeAttr(filters.query)}" hx-trigger="keyup changed delay:200ms" />
        <select name="week" hx-trigger="change">${['All', ...WEEK_RANGE].map((week) => `<option value="${week}" ${String(filters.week) === String(week) ? 'selected' : ''}>${week}</option>`).join('')}</select>
        <select name="tag" hx-trigger="change">${experimentTags(state).map((tag) => `<option value="${tag}" ${filters.tag === tag ? 'selected' : ''}>${tag}</option>`).join('')}</select>
      </form>
      <div class="cards-grid">
        ${rows
          .map(
            (entry) => `
              <article class="card">
                <div class="inline-row" style="justify-content:space-between;align-items:center;">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span class="pill">Week ${entry.relatedWeek}</span>
                </div>
                <p>${escapeHtml(entry.outcome || 'No outcome recorded')}</p>
                <details>
                  <summary>Details</summary>
                  <p><strong>What I Tried:</strong> ${escapeHtml(entry.whatITried)}</p>
                  <p><strong>Next Step:</strong> ${escapeHtml(entry.nextStep)}</p>
                  <p><strong>Tags:</strong> ${escapeHtml(entry.tags.join(', '))}</p>
                  <p><strong>Notes:</strong> ${escapeHtml(entry.notes || 'None')}</p>
                  ${entry.imageUrls.length ? `<div class="thumb-grid">${entry.imageUrls.map((url) => `<img src="${escapeAttr(url)}" alt="${escapeAttr(entry.title)}" />`).join('')}</div>` : ''}
                </details>
                <div class="action-row">
                  <button type="button" hx-get="/fragments/modal?type=experiment&id=${encodeURIComponent(entry.id)}" hx-target="#modalHost" hx-swap="innerHTML">Edit</button>
                  <button type="button" hx-post="/api/dashboard?intent=experiment-delete&id=${encodeURIComponent(entry.id)}" hx-confirm="Delete this experiment?" hx-target="#experiments" hx-swap="outerHTML">Delete</button>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

export function renderLinksSection(state) {
  return `
    <section id="links">
      <h2 class="section-title">Links</h2>
      <div class="controls">
        <button type="button" hx-get="/fragments/modal?type=link" hx-target="#modalHost" hx-swap="innerHTML">Add Link</button>
      </div>
      <div class="links-grid">
        ${state.links
          .map(
            (link) => `
              <article class="link-card">
                <strong>${escapeHtml(link.name)}</strong>
                <div><span class="pill">${escapeHtml(link.category || 'General')}</span></div>
                <a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.url)}</a>
                <div class="action-row" style="margin-top:8px;">
                  <button type="button" hx-get="/fragments/modal?type=link&id=${encodeURIComponent(link.id)}" hx-target="#modalHost" hx-swap="innerHTML">Edit</button>
                  <button type="button" hx-post="/api/dashboard?intent=link-delete&id=${encodeURIComponent(link.id)}" hx-confirm="Delete this link?" hx-target="#links" hx-swap="outerHTML">Delete</button>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

export function renderModalHost(content = '') {
  return `<div id="modalHost">${content}</div>`;
}

function renderMilestonesEditor(week) {
  return week.milestones.map((milestone) => `${milestone.done ? '[x]' : '[ ]'} ${milestone.text}`).join('\n');
}

function renderSourceOptions(state, selectedIds = []) {
  return state.readingLibrary
    .map(
      (source) => `
        <label class="pill">
          <input type="checkbox" name="relatedSourceIds" value="${escapeAttr(source.id)}" ${selectedIds.includes(source.id) ? 'checked' : ''} />
          ${escapeHtml(source.title)}
        </label>
      `
    )
    .join('');
}

export function renderModal(type, state, item = null) {
  if (type === 'reading') {
    const source = item || {
      title: '',
      author: '',
      url: '',
      status: SOURCE_STATUSES[0],
      notes: '',
      isKey: false,
      relatedWeek: Number(state.uiState.activeWeek),
      accessedDate: new Date().toISOString()
    };
    return `
      <div class="modal-overlay" data-overlay-close="true">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Source editor">
          <h3>${item ? 'Edit Source' : 'Add Source'}</h3>
          <form class="modal-grid" hx-post="/api/dashboard" hx-target="#reading" hx-swap="outerHTML">
            <input type="hidden" name="intent" value="reading-save" />
            <input type="hidden" name="id" value="${escapeAttr(item?.id || '')}" />
            <div class="modal-grid two">
              <label>URL* <input name="url" value="${escapeAttr(source.url)}" required /></label>
              <label>Week Tag* <select name="relatedWeek">${WEEK_RANGE.map((week) => `<option value="${week}" ${week === Number(source.relatedWeek) ? 'selected' : ''}>${week}</option>`).join('')}</select></label>
            </div>
            <label>Title <input name="title" value="${escapeAttr(source.title)}" /></label>
            <label>Author <input name="author" value="${escapeAttr(source.author)}" /></label>
            <label>Status <select name="status">${SOURCE_STATUSES.map((status) => `<option value="${status}" ${status === source.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
            <label>Key <select name="isKey"><option value="false" ${!source.isKey ? 'selected' : ''}>No</option><option value="true" ${source.isKey ? 'selected' : ''}>Yes</option></select></label>
            <label>Accessed Date <input type="date" name="accessedDate" value="${escapeAttr((source.accessedDate || '').slice(0, 10))}" /></label>
            <label>Notes <textarea name="notes">${escapeHtml(source.notes)}</textarea></label>
            <div class="modal-actions">
              <button type="button" data-close-modal="true">Cancel</button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === 'weekly') {
    const week = item || activeWeek(state);
    return `
      <div class="modal-overlay" data-overlay-close="true">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Weekly plan editor">
          <h3>Edit Week ${week.weekNumber}</h3>
          <form class="modal-grid" hx-post="/api/dashboard" hx-target="#weekly" hx-swap="outerHTML">
            <input type="hidden" name="intent" value="weekly-save" />
            <input type="hidden" name="id" value="${escapeAttr(week.id)}" />
            <label>Owner <input name="owner" value="${escapeAttr(week.owner)}" /></label>
            <label>Status <select name="status">${['Planned', 'Active', 'Done'].map((status) => `<option value="${status}" ${status === week.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
            <label>Milestones ([x] or [ ] prefix per line)
              <textarea name="milestones">${escapeHtml(renderMilestonesEditor(week))}</textarea>
            </label>
            <label>Deliverables <textarea name="deliverables">${escapeHtml(week.deliverables)}</textarea></label>
            <label>Risks <textarea name="risks">${escapeHtml(week.risks)}</textarea></label>
            <div class="modal-actions">
              <button type="button" data-close-modal="true">Cancel</button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === 'prompt') {
    const entry = item || {
      date: new Date().toISOString(),
      model: 'GPT-5',
      prompt: '',
      outputSummary: '',
      changedNext: '',
      tags: [],
      relatedWeek: Number(state.uiState.activeWeek),
      relatedSourceIds: []
    };
    return `
      <div class="modal-overlay" data-overlay-close="true">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Prompt editor">
          <h3>${item ? 'Edit Prompt' : 'Add Prompt'}</h3>
          <form class="modal-grid" hx-post="/api/dashboard" hx-target="#prompts" hx-swap="outerHTML">
            <input type="hidden" name="intent" value="prompt-save" />
            <input type="hidden" name="id" value="${escapeAttr(item?.id || '')}" />
            <div class="modal-grid two">
              <label>Date <input type="date" name="date" value="${escapeAttr((entry.date || '').slice(0, 10))}" /></label>
              <label>Week <select name="relatedWeek">${WEEK_RANGE.map((week) => `<option value="${week}" ${week === Number(entry.relatedWeek) ? 'selected' : ''}>${week}</option>`).join('')}</select></label>
            </div>
            <label>Model <input name="model" value="${escapeAttr(entry.model)}" list="promptModelsList" /></label>
            <label>Prompt <textarea name="prompt">${escapeHtml(entry.prompt)}</textarea></label>
            <label>Output Summary <textarea name="outputSummary">${escapeHtml(entry.outputSummary)}</textarea></label>
            <label>Changed Next <textarea name="changedNext">${escapeHtml(entry.changedNext)}</textarea></label>
            <label>Tags (comma separated) <input name="tags" value="${escapeAttr(entry.tags.join(', '))}" /></label>
            <fieldset>
              <legend>Related Sources</legend>
              <div class="flow-chips">${renderSourceOptions(state, entry.relatedSourceIds)}</div>
            </fieldset>
            <div class="modal-actions">
              <button type="button" data-close-modal="true">Cancel</button>
              <button type="submit">Save</button>
            </div>
          </form>
          <datalist id="promptModelsList">
            ${MODEL_OPTIONS.map((model) => `<option value="${escapeAttr(model)}"></option>`).join('')}
          </datalist>
        </div>
      </div>
    `;
  }

  if (type === 'experiment') {
    const entry = item || {
      date: new Date().toISOString(),
      title: '',
      whatITried: '',
      outcome: '',
      nextStep: '',
      imageUrls: [],
      notes: '',
      tags: [],
      relatedWeek: Number(state.uiState.activeWeek)
    };
    return `
      <div class="modal-overlay" data-overlay-close="true">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Experiment editor">
          <h3>${item ? 'Edit Experiment' : 'Add Experiment'}</h3>
          <form class="modal-grid" hx-post="/api/dashboard" hx-target="#experiments" hx-swap="outerHTML">
            <input type="hidden" name="intent" value="experiment-save" />
            <input type="hidden" name="id" value="${escapeAttr(item?.id || '')}" />
            <div class="modal-grid two">
              <label>Date <input type="date" name="date" value="${escapeAttr((entry.date || '').slice(0, 10))}" /></label>
              <label>Week <select name="relatedWeek">${WEEK_RANGE.map((week) => `<option value="${week}" ${week === Number(entry.relatedWeek) ? 'selected' : ''}>${week}</option>`).join('')}</select></label>
            </div>
            <label>Title <input name="title" value="${escapeAttr(entry.title)}" /></label>
            <label>What I Tried <textarea name="whatITried">${escapeHtml(entry.whatITried)}</textarea></label>
            <label>Outcome <textarea name="outcome">${escapeHtml(entry.outcome)}</textarea></label>
            <label>Next Step <textarea name="nextStep">${escapeHtml(entry.nextStep)}</textarea></label>
            <label>Image URLs (one per line) <textarea name="imageUrls">${escapeHtml(entry.imageUrls.join('\n'))}</textarea></label>
            <label>Tags (comma separated) <input name="tags" value="${escapeAttr(entry.tags.join(', '))}" /></label>
            <label>Notes <textarea name="notes">${escapeHtml(entry.notes)}</textarea></label>
            <div class="modal-actions">
              <button type="button" data-close-modal="true">Cancel</button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === 'link') {
    const link = item || { name: '', url: '', category: 'General' };
    return `
      <div class="modal-overlay" data-overlay-close="true">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Link editor">
          <h3>${item ? 'Edit Link' : 'Add Link'}</h3>
          <form class="modal-grid" hx-post="/api/dashboard" hx-target="#links" hx-swap="outerHTML">
            <input type="hidden" name="intent" value="link-save" />
            <input type="hidden" name="id" value="${escapeAttr(item?.id || '')}" />
            <label>Name <input name="name" value="${escapeAttr(link.name)}" /></label>
            <label>URL <input name="url" value="${escapeAttr(link.url)}" /></label>
            <label>Category <input name="category" value="${escapeAttr(link.category || 'General')}" /></label>
            <div class="modal-actions">
              <button type="button" data-close-modal="true">Cancel</button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return '';
}

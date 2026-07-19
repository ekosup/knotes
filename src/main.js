import { saveNote, deleteNote, listNotes, getNote, getStorageEstimate } from './db.js';
import { getEditorState, setEditorState, clearEditor, onEditorChange, onCueChange, onAddCue, onTagChange, tagsList } from './editor.js';
import { debounce, formatBytes } from './utils.js';
import { exportJSON, exportMarkdown, importFile } from './export.js';
import { icon } from './icons.js';
import { initSidebarResize, initEditorPreviewResize, initSummaryResize } from './resize.js';

// --- Theme ---
const themeKey = 'enotes-theme';
const lastNoteKey = 'enotes-last-note';
const btnTheme = document.getElementById('btn-theme');

function getTheme() {
  return localStorage.getItem(themeKey) || 'system';
}
function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  btnTheme.innerHTML = icon(isDark ? 'sun' : 'moon');
}
function toggleTheme() {
  const current = getTheme();
  const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
  localStorage.setItem(themeKey, next);
  applyTheme(next);
}
btnTheme.addEventListener('click', toggleTheme);
applyTheme(getTheme());
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') applyTheme('system');
});

// --- Inject icons ---
document.getElementById('btn-add-cue').innerHTML = icon('plus');
document.getElementById('btn-pin').innerHTML = icon('pin');
document.querySelector('.logo-icon').innerHTML = icon('notes');
document.querySelector('.palette-search-icon').innerHTML = icon('search');
document.querySelector('.trigger-search-icon').innerHTML = icon('search');
document.getElementById('status-badge').innerHTML = icon('cloud-off') + ' Offline';

// --- State ---
let currentNoteId = null;
let dirty = false;

const statusBadge = document.getElementById('status-badge');
const triggerBtn = document.getElementById('palette-trigger');
const currentLabel = document.getElementById('current-note-label');

function updateSaveStatus(status) {
  if (status === 'saving') {
    statusBadge.innerHTML = icon('loader') + ' Saving…';
    statusBadge.className = 'badge badge-saving';
  } else if (status === 'saved') {
    statusBadge.innerHTML = icon('check') + ' Saved';
    statusBadge.className = 'badge';
    clearTimeout(statusBadge._timeout);
    statusBadge._timeout = setTimeout(() => {
      statusBadge.innerHTML = icon('cloud-off') + ' Offline';
      statusBadge.className = 'badge';
    }, 2000);
  }
}

// --- Persist ---
const persist = debounce(async () => {
  if (!dirty) return;
  updateSaveStatus('saving');
  const state = getEditorState();
  const note = { ...state, id: currentNoteId || '' };
  const saved = await saveNote(note);
  if (!currentNoteId) {
    currentNoteId = saved.id;
    dirty = false;
    persistLastNote(currentNoteId);
    updateTriggerLabel();
  }
  dirty = false;
  updateSaveStatus('saved');
  updateStorageInfo();
  persistLastNote(currentNoteId);
}, 500);

function markDirty() {
  dirty = true;
  persist();
}

function persistLastNote(id) {
  if (id) localStorage.setItem(lastNoteKey, id);
  else localStorage.removeItem(lastNoteKey);
}

async function updateTriggerLabel() {
  if (!currentNoteId) {
    currentLabel.textContent = 'Search notes…';
    return;
  }
  const note = await getNote(currentNoteId);
  if (note) currentLabel.textContent = note.title || '(untitled)';
}

// --- Load note ---
async function loadNote(id) {
  if (!id) {
    currentNoteId = null;
    clearEditor();
    persistLastNote(null);
    updateTriggerLabel();
    return;
  }
  const note = await getNote(id);
  if (!note) {
    currentNoteId = null;
    clearEditor();
    persistLastNote(null);
    updateTriggerLabel();
    return;
  }
  currentNoteId = note.id;
  setEditorState(note);
  dirty = false;
  persistLastNote(note.id);
  updateTriggerLabel();
}

// --- Command Palette ---
const palette = document.getElementById('command-palette');
const paletteInput = document.getElementById('palette-input');
const paletteResults = document.getElementById('palette-results');
const paletteActions = document.getElementById('palette-actions');
const paletteTagBadge = document.getElementById('palette-tag-badge');
const backdrop = palette.querySelector('.palette-backdrop');
const importFileInput = document.getElementById('import-file');

let activeTagFilter = null;
let paletteIndex = 0;
let totalItems = 0; // notes + new-note row + action rows

function openPalette() {
  palette.classList.add('open');
  paletteInput.value = '';
  paletteIndex = 0;
  renderPalette(null, activeTagFilter);
  requestAnimationFrame(() => paletteInput.focus());
}

function closePalette() {
  palette.classList.remove('open');
  paletteInput.value = '';
}

async function renderPalette(query, tagFilter) {
  let notes = await listNotes();
  notes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  if (tagFilter) {
    notes = notes.filter((n) => (n.tags || []).includes(tagFilter));
  }

  if (query) {
    const q = query.toLowerCase();
    notes = notes.filter((n) =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.summary || '').toLowerCase().includes(q) ||
      (n.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  // --- Build results ---
  paletteResults.innerHTML = '';
  // "New Note" always first
  paletteResults.appendChild(actionRow('new', icon('plus'), 'New Note', 'Ctrl+N'));

  notes.forEach((n) => {
    paletteResults.appendChild(noteRow(n));
  });

  if (notes.length === 0 && query) {
    const empty = document.createElement('div');
    empty.className = 'palette-item';
    empty.innerHTML = `<span class="palette-item-title" style="color:var(--text-tertiary);font-style:italic">No notes found</span>`;
    paletteResults.appendChild(empty);
  }

  // --- Build actions ---
  paletteActions.innerHTML = '';
  paletteActions.appendChild(actionRow('delete', icon('trash'), 'Delete current note', '', !currentNoteId));
  paletteActions.appendChild(actionRow('export-json', icon('file-download'), 'Export as JSON', ''));
  paletteActions.appendChild(actionRow('export-md', icon('file-export'), 'Export as Markdown', ''));
  paletteActions.appendChild(actionRow('import', icon('file-import'), 'Import note…', ''));

  // Count total navigable items
  totalItems = paletteResults.children.length + paletteActions.children.length;
  paletteIndex = Math.min(paletteIndex, totalItems - 1);
  highlightRow();
}

function noteRow(n) {
  const div = document.createElement('div');
  div.className = 'palette-item';
  div.dataset.action = 'note';
  div.dataset.id = n.id;
  const pinIcon = n.pinned ? icon('pin-filled') : '';
  const tagPills = (n.tags || []).map((t) => `<span class="palette-tag">${escHTML(t)}</span>`).join('');
  div.innerHTML = `
    <span class="palette-item-icon">${pinIcon}</span>
    <span class="palette-item-title">${escHTML(n.title || '(untitled)')}</span>
    <span class="palette-item-tags">${tagPills}</span>
  `;
  return div;
}

function actionRow(action, ico, label, shortcut, disabled) {
  const div = document.createElement('div');
  div.className = 'palette-item';
  div.dataset.action = action;
  if (disabled) div.classList.add('disabled');
  div.innerHTML = `
    <span class="palette-item-icon">${ico}</span>
    <span class="palette-item-title">${label}</span>
    ${shortcut ? `<span class="trigger-kbd">${shortcut}</span>` : ''}
  `;
  return div;
}

function getAllRows() {
  return [...paletteResults.querySelectorAll('.palette-item'), ...paletteActions.querySelectorAll('.palette-item')];
}

function highlightRow() {
  const rows = getAllRows();
  rows.forEach((r, i) => r.classList.toggle('active', i === paletteIndex));
  const active = rows[paletteIndex];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// --- Palette keyboard ---
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    paletteIndex = (paletteIndex + 1) % totalItems;
    highlightRow();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    paletteIndex = (paletteIndex - 1 + totalItems) % totalItems;
    highlightRow();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const row = getAllRows()[paletteIndex];
    if (row && !row.classList.contains('disabled')) executeRow(row);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
});

paletteInput.addEventListener('input', debounce(() => {
  const q = paletteInput.value.trim();
  renderPalette(q || null, activeTagFilter);
}, 150));

backdrop.addEventListener('click', closePalette);

// Click on result or action
palette.addEventListener('click', (e) => {
  // Tag in result → filter
  const tagEl = e.target.closest('.palette-tag');
  if (tagEl) {
    e.stopPropagation();
    const tag = tagEl.textContent;
    if (activeTagFilter === tag) {
      activeTagFilter = null;
      paletteTagBadge.style.display = 'none';
    } else {
      activeTagFilter = tag;
      paletteTagBadge.innerHTML = icon('tag') + ' ' + escHTML(tag) + ` <span class="palette-tag-clear">${icon('x')}</span>`;
      paletteTagBadge.style.display = 'inline-flex';
    }
    paletteInput.value = '';
    renderPalette(null, activeTagFilter);
    return;
  }

  const item = e.target.closest('.palette-item');
  if (!item || item.classList.contains('disabled')) return;
  const rows = getAllRows();
  paletteIndex = rows.indexOf(item);
  executeRow(item);
});

// Clear tag filter
paletteTagBadge.addEventListener('click', (e) => {
  if (e.target.closest('.palette-tag-clear')) {
    activeTagFilter = null;
    paletteTagBadge.style.display = 'none';
    renderPalette(paletteInput.value.trim() || null, null);
  }
});

async function executeRow(row) {
  const action = row.dataset.action;
  if (action === 'new') {
    closePalette();
    await newNote();
  } else if (action === 'note') {
    closePalette();
    await loadNote(row.dataset.id);
  } else if (action === 'delete') {
    if (!currentNoteId) return;
    closePalette();
    await deleteCurrentNote();
  } else if (action === 'export-json') {
    closePalette();
    if (dirty) persist.flush();
    if (currentNoteId) { const note = await getNote(currentNoteId); if (note) exportJSON(note); }
  } else if (action === 'export-md') {
    closePalette();
    exportMarkdown(getEditorState());
  } else if (action === 'import') {
    closePalette();
    importFileInput.click();
  }
}

// --- Tag click in editor → filter via palette ---
tagsList.addEventListener('click', (e) => {
  const rm = e.target.closest('.tag-remove');
  if (rm) return;
  const pill = e.target.closest('.tag-pill');
  if (!pill) return;
  const tagText = pill.querySelector('.tag-text').textContent;
  activeTagFilter = tagText;
  paletteTagBadge.innerHTML = icon('tag') + ' ' + escHTML(tagText) + ` <span class="palette-tag-clear">${icon('x')}</span>`;
  paletteTagBadge.style.display = 'inline-flex';
  openPalette();
  renderPalette(null, activeTagFilter);
});

// --- Trigger button ---
triggerBtn.addEventListener('click', openPalette);

// --- New note ---
async function newNote() {
  if (dirty) persist.flush();
  currentNoteId = null;
  clearEditor();
  dirty = false;
  persistLastNote(null);
  updateTriggerLabel();
}

// --- Delete note ---
async function deleteCurrentNote() {
  if (!currentNoteId) return;
  if (!confirm('Delete this note?')) return;
  await deleteNote(currentNoteId);
  currentNoteId = null;
  clearEditor();
  dirty = false;
  persistLastNote(null);
  updateStorageInfo();
  updateTriggerLabel();
}

// --- Wire events ---
onEditorChange(markDirty);
onCueChange(markDirty);
onAddCue(markDirty);
onTagChange(markDirty);

// Import file handler
importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const note = await importFile(file);
    const saved = await saveNote(note);
    currentNoteId = saved.id;
    setEditorState(saved);
    dirty = false;
    persistLastNote(currentNoteId);
    updateStorageInfo();
    updateTriggerLabel();
  } catch (err) { alert('Import failed: ' + err.message); }
  e.target.value = '';
});

async function updateStorageInfo() {
  const bytes = await getStorageEstimate();
  document.getElementById('storage-info').textContent = formatBytes(bytes);
}

// --- Before unload ---
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    persist.flush();
    e.preventDefault();
  }
});

// --- Word/character count ---
function updateCounts() {
  const text = document.getElementById('editor-textarea').value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = `${words} words · ${chars} chars`;
}

// --- Utils ---
function escHTML(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Init ---
(async () => {
  initSidebarResize();
  initEditorPreviewResize();
  initSummaryResize();
  updateStorageInfo();

  // Restore last active note
  const lastId = localStorage.getItem(lastNoteKey);
  if (lastId) {
    const note = await getNote(lastId);
    if (note) {
      currentNoteId = note.id;
      setEditorState(note);
      dirty = false;
      updateTriggerLabel();
    } else {
      localStorage.removeItem(lastNoteKey);
    }
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 's') { e.preventDefault(); persist.flush(); }
    if (mod && e.key === 'n') { e.preventDefault(); newNote(); }
    if (mod && e.key === 'k') {
      e.preventDefault();
      if (!palette.classList.contains('open')) openPalette();
      else closePalette();
    }
    if (e.key === 'Escape' && palette.classList.contains('open')) {
      e.preventDefault();
      closePalette();
    }
  });

  // Word count
  const textarea = document.getElementById('editor-textarea');
  textarea.addEventListener('input', updateCounts);
  updateCounts();
})();

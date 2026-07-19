import { saveNote, deleteNote, listNotes, getNote, getStorageEstimate } from './db.js';
import { getEndpoint, setEndpoint, hasEndpoint, getUserId, setUserId, syncNotes } from './sync.js';
import { getEditorState, setEditorState, clearEditor, onEditorChange, onCueChange, onAddCue, onTagChange, tagsList, getMindmapActive, setMindmapActive } from './editor.js';
import { debounce, formatBytes } from './utils.js';
import { exportJSON, exportMarkdown, importFile } from './export.js';
import { icon } from './icons.js';
import { initSidebarResize, initEditorPreviewResize, initSummaryResize } from './resize.js';
import { drawMindmapLines, initMindmapZoomPan } from './mindmap.js';

// --- Theme ---
const themeKey = 'enotes-theme';
const lastNoteKey = 'enotes-last-note';
const btnTheme = document.getElementById('btn-theme');
const btnSync = document.getElementById('btn-sync');

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

// --- Sync ---
function updateSyncIcon(state) {
  const icons = { idle: 'cloud', syncing: 'loader', ok: 'cloud-check', err: 'cloud-exclamation' };
  btnSync.innerHTML = icon(icons[state] || 'cloud');
  btnSync.className = `btn btn-ghost btn-icon-only${state === 'syncing' ? ' badge-saving' : ''}`;
  if (state === 'ok') {
    clearTimeout(btnSync._timeout);
    btnSync._timeout = setTimeout(() => updateSyncIcon('idle'), 2000);
  }
}

btnSync.addEventListener('click', async () => {
  if (!hasEndpoint()) {
    const url = prompt('Cloud sync endpoint URL:', getEndpoint() || 'https://enotes-sync.namakamu.workers.dev');
    if (!url) return;
    setEndpoint(url.trim());
  }
  if (!getUserId()) {
    const userId = prompt('Your user ID — pick something not easy to guess\n(no auth, anyone with this ID can access your notes):', getUserId() || 'eko');
    if (!userId) return;
    setUserId(userId.trim());
  }

  if (dirty) persist.flush();

  const localNotes = await listNotes();
  const endpoint = getEndpoint();
  const userId = getUserId();

  await syncNotes(endpoint, userId, localNotes, async (remoteNotes) => {
    // ponytail: full replacement — server is source of truth, simplest conflict model
    const remoteIds = new Set(remoteNotes.map((n) => n.id));
    const localAll = await listNotes();
    for (const n of localAll) {
      if (!remoteIds.has(n.id)) await deleteNote(n.id);
    }
    for (const n of remoteNotes) {
      await saveNote(n);
    }

    // Reload current note if it still exists
    if (currentNoteId) {
      const refreshed = await getNote(currentNoteId);
      if (refreshed) {
        setEditorState(refreshed);
        dirty = false;
      } else {
        currentNoteId = null;
        clearEditor();
      }
    }
    updateTriggerLabel();
    updateStorageInfo();
  }, updateSyncIcon);
});

// Right-click to change endpoint or user
btnSync.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const currentEp = getEndpoint();
  const currentUser = getUserId();
  const url = prompt('Change sync endpoint:', currentEp || 'https://enotes-sync.namakamu.workers.dev');
  if (url === null) return;
  if (url === '') {
    localStorage.removeItem('enotes-sync-endpoint');
    localStorage.removeItem('enotes-sync-user');
    updateSyncIcon('idle');
    return;
  }
  setEndpoint(url.trim());

  const userId = prompt('Change user ID (pick something hard to guess):', currentUser || 'eko');
  if (userId === null) return;
  setUserId(userId.trim() || currentUser);
  updateSyncIcon('idle');
});

// --- Inject icons ---
document.getElementById('btn-add-cue').innerHTML = icon('plus');
document.getElementById('btn-pin').innerHTML = icon('pin');
document.querySelector('.logo-icon').innerHTML = icon('notes');
document.querySelector('.palette-search-icon').innerHTML = icon('search');
document.querySelector('.trigger-search-icon').innerHTML = icon('search');
document.getElementById('status-badge').innerHTML = icon('cloud-off') + ' Offline';
updateSyncIcon('idle');

// --- Panel control icons ---
document.getElementById('btn-maximize-cues').innerHTML = icon('maximize');
document.getElementById('btn-maximize-summary').innerHTML = icon('maximize');
document.getElementById('btn-hide-preview').innerHTML = icon('eye-off');
document.getElementById('btn-toggle-preview').innerHTML = icon('eye-off');
document.getElementById('btn-maximize-preview').innerHTML = icon('maximize');
document.getElementById('btn-present-preview').innerHTML = icon('presentation');
document.getElementById('btn-toc-preview').innerHTML = icon('list');
document.getElementById('btn-mindmap-toggle').innerHTML = icon('sitemap');

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

// --- Mobile Tab Switching ---
function switchToTab(tabName) {
  const app = document.getElementById('app');
  if (app) {
    app.setAttribute('data-active-tab', tabName);
  }
  const mobileTabBtns = document.querySelectorAll('.mobile-tab-btn');
  mobileTabBtns.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (tabName === 'preview' && getMindmapActive()) {
    setTimeout(drawMindmapLines, 50);
  }
}

// --- Load note ---
async function loadNote(id) {
  if (!id) {
    currentNoteId = null;
    clearEditor();
    persistLastNote(null);
    updateTriggerLabel();
    switchToTab('edit');
    return;
  }
  const note = await getNote(id);
  if (!note) {
    currentNoteId = null;
    clearEditor();
    persistLastNote(null);
    updateTriggerLabel();
    switchToTab('edit');
    return;
  }
  currentNoteId = note.id;
  setEditorState(note);
  dirty = false;
  persistLastNote(note.id);
  updateTriggerLabel();
  switchToTab('edit');
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
  switchToTab('edit');
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

// ===========================
// Panel Maximize / Hide Logic
// ===========================
const panelStateKey = 'enotes-panels';

function loadPanelState() {
  try { return JSON.parse(localStorage.getItem(panelStateKey)) || {}; }
  catch { return {}; }
}

function savePanelState(state) {
  localStorage.setItem(panelStateKey, JSON.stringify(state));
}

// --- Cues Sidebar Maximize ---
const sidebar = document.getElementById('sidebar');
const btnMaxCues = document.getElementById('btn-maximize-cues');

function toggleMaximizeCues() {
  const isMaximized = sidebar.classList.contains('panel-maximized');
  if (isMaximized) {
    sidebar.classList.remove('panel-maximized');
    btnMaxCues.innerHTML = icon('maximize');
    btnMaxCues.title = 'Maximize cues panel';
  } else {
    // Restore from collapsed first if needed
    sidebar.classList.remove('panel-collapsed');
    sidebar.classList.add('panel-maximized');
    btnMaxCues.innerHTML = icon('minimize');
    btnMaxCues.title = 'Restore cues panel';
  }
  const ps = loadPanelState();
  ps.cuesMaximized = !isMaximized;
  savePanelState(ps);
}

btnMaxCues.addEventListener('click', toggleMaximizeCues);

// --- Preview Pane Controls ---
const previewPane = document.getElementById('preview-pane');
const btnHidePreview = document.getElementById('btn-hide-preview');
const btnTogglePreview = document.getElementById('btn-toggle-preview');
const btnMaxPreview = document.getElementById('btn-maximize-preview');
const btnPresentPreview = document.getElementById('btn-present-preview');
const resizeEditorPreview = document.getElementById('resize-editor-preview');

function toggleHidePreview() {
  const isHidden = previewPane.classList.contains('panel-hidden');
  if (isHidden) {
    previewPane.classList.remove('panel-hidden');
    resizeEditorPreview.style.display = '';
    btnHidePreview.innerHTML = icon('eye-off');
    btnHidePreview.title = 'Hide preview';
    btnTogglePreview.innerHTML = icon('eye-off');
    btnTogglePreview.title = 'Hide preview';
    if (getMindmapActive()) {
      setTimeout(drawMindmapLines, 50);
    }
  } else {
    // Restore from maximized first
    previewPane.classList.remove('panel-maximized');
    previewPane.classList.add('panel-hidden');
    resizeEditorPreview.style.display = 'none';
    btnHidePreview.innerHTML = icon('eye');
    btnHidePreview.title = 'Show preview';
    btnTogglePreview.innerHTML = icon('eye');
    btnTogglePreview.title = 'Show preview';
  }
  const ps = loadPanelState();
  ps.previewHidden = !isHidden;
  savePanelState(ps);
}

function toggleMaximizePreview() {
  const isMaximized = previewPane.classList.contains('panel-maximized');
  if (isMaximized) {
    previewPane.classList.remove('panel-maximized');
    btnMaxPreview.innerHTML = icon('maximize');
    btnMaxPreview.title = 'Maximize preview';
  } else {
    previewPane.classList.remove('panel-hidden');
    resizeEditorPreview.style.display = '';
    btnHidePreview.innerHTML = icon('eye-off');
    btnHidePreview.title = 'Hide preview';
    btnTogglePreview.innerHTML = icon('eye-off');
    btnTogglePreview.title = 'Hide preview';
    previewPane.classList.add('panel-maximized');
    btnMaxPreview.innerHTML = icon('minimize');
    btnMaxPreview.title = 'Restore preview';
  }
  if (getMindmapActive()) {
    setTimeout(drawMindmapLines, 50);
  }
  const ps = loadPanelState();
  ps.previewMaximized = !isMaximized;
  ps.previewHidden = false;
  savePanelState(ps);
}

// --- Slide Presentation Mode Implementation ---
let presentationActive = false;
let slides = [];
let currentSlideIndex = 0;
let slideZoomMultiplier = 1.0;
let hudTimeout = null;
const BASE_WIDTH = 960;
const BASE_HEIGHT = 600;

function resetHudTimeout() {
  if (!presentationActive) return;
  const hud = document.querySelector('.presentation-hud');
  if (hud) hud.classList.remove('hud-hidden');
  presentationOverlay.style.cursor = 'default';

  clearTimeout(hudTimeout);
  hudTimeout = setTimeout(() => {
    if (presentationActive && hud) {
      hud.classList.add('hud-hidden');
      presentationOverlay.style.cursor = 'none';
    }
  }, 5000);
}

const presentationOverlay = document.getElementById('presentation-overlay');
const presentationNoteTitle = document.getElementById('presentation-note-title');
const presentationSlideBox = document.getElementById('presentation-slide-box');
const presentationSlideContent = document.getElementById('presentation-slide-content');
const presentSlideCounter = document.getElementById('present-slide-counter');
const presentZoomLevel = document.getElementById('present-zoom-level');

// Inject presentation icons
document.getElementById('btn-present-fullscreen').innerHTML = icon('maximize');
document.getElementById('btn-present-close').innerHTML = icon('x');
document.getElementById('btn-present-prev').innerHTML = icon('chevron-left');
document.getElementById('btn-present-next').innerHTML = icon('chevron-right');
document.getElementById('btn-present-zoom-out').innerHTML = icon('zoom-out');
document.getElementById('btn-present-zoom-in').innerHTML = icon('zoom-in');

function adjustSlideScale() {
  if (!presentationActive) return;
  const body = document.querySelector('.presentation-body');
  if (!presentationSlideBox || !body) return;

  const bodyWidth = body.clientWidth;
  const bodyHeight = body.clientHeight;

  // Fit scale with padding
  const scaleX = (bodyWidth - 40) / BASE_WIDTH;
  const scaleY = (bodyHeight - 40) / BASE_HEIGHT;
  const fitScale = Math.min(scaleX, scaleY);

  const finalScale = fitScale * slideZoomMultiplier;

  presentationSlideBox.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
  
  if (presentZoomLevel) {
    presentZoomLevel.textContent = `${Math.round(slideZoomMultiplier * 100)}%`;
  }
}

function showSlide(index) {
  if (index < 0 || index >= slides.length) return;
  currentSlideIndex = index;
  
  presentationSlideContent.innerHTML = '';
  slides[currentSlideIndex].forEach(node => {
    presentationSlideContent.appendChild(node.cloneNode(true));
  });

  presentSlideCounter.textContent = `${currentSlideIndex + 1} / ${slides.length}`;

  document.getElementById('btn-present-prev').disabled = (currentSlideIndex === 0);
  document.getElementById('btn-present-next').disabled = (currentSlideIndex === slides.length - 1);
  
  adjustSlideScale();
  resetHudTimeout();
}

function enterPresentMode() {
  const previewContent = document.getElementById('preview-content');
  if (!previewContent) return;

  slides = [];
  const proseDiv = previewContent.querySelector('.prose');
  const rootElement = proseDiv || previewContent;

  let currentSlideNodes = [];
  Array.from(rootElement.childNodes).forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'HR') {
      if (currentSlideNodes.length > 0) {
        slides.push(currentSlideNodes);
        currentSlideNodes = [];
      }
    } else {
      currentSlideNodes.push(node.cloneNode(true));
    }
  });
  if (currentSlideNodes.length > 0) {
    slides.push(currentSlideNodes);
  }

  if (slides.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No content to present.';
    slides.push([p]);
  }

  presentationActive = true;
  slideZoomMultiplier = 1.0;
  presentationNoteTitle.textContent = document.getElementById('note-title').value || 'Untitled note…';

  presentationOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  showSlide(0);

  // Auto-request browser fullscreen
  document.documentElement.requestFullscreen().catch(() => {});

  // Start HUD auto-hide timeout and wire mouse listener
  resetHudTimeout();
  presentationOverlay.addEventListener('mousemove', resetHudTimeout);

  window.addEventListener('resize', adjustSlideScale);
}

function exitPresentMode() {
  presentationActive = false;
  presentationOverlay.style.display = 'none';
  document.body.style.overflow = '';
  window.removeEventListener('resize', adjustSlideScale);

  // Clean up HUD auto-hide timeout and listeners
  clearTimeout(hudTimeout);
  presentationOverlay.removeEventListener('mousemove', resetHudTimeout);
  presentationOverlay.style.cursor = '';
  const hud = document.querySelector('.presentation-hud');
  if (hud) hud.classList.remove('hud-hidden');

  // Auto-exit fullscreen if active
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function nextSlide() {
  if (currentSlideIndex < slides.length - 1) {
    showSlide(currentSlideIndex + 1);
  }
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    showSlide(currentSlideIndex - 1);
  }
}

function zoomIn() {
  slideZoomMultiplier = Math.min(2.5, slideZoomMultiplier + 0.1);
  adjustSlideScale();
  resetHudTimeout();
}

function zoomOut() {
  slideZoomMultiplier = Math.max(0.5, slideZoomMultiplier - 0.1);
  adjustSlideScale();
  resetHudTimeout();
}

function resetZoom() {
  slideZoomMultiplier = 1.0;
  adjustSlideScale();
  resetHudTimeout();
}

function toggleBrowserFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// Update fullscreen icon on state changes
document.addEventListener('fullscreenchange', () => {
  const btnFs = document.getElementById('btn-present-fullscreen');
  if (btnFs) {
    if (document.fullscreenElement) {
      btnFs.innerHTML = icon('minimize');
      btnFs.title = 'Exit Fullscreen (F)';
    } else {
      btnFs.innerHTML = icon('maximize');
      btnFs.title = 'Enter Fullscreen (F)';
    }
  }
  if (getMindmapActive()) {
    setTimeout(drawMindmapLines, 150);
  }
});

// Hook presentation control events
document.getElementById('btn-present-fullscreen').addEventListener('click', toggleBrowserFullscreen);
document.getElementById('btn-present-close').addEventListener('click', exitPresentMode);
document.getElementById('btn-present-prev').addEventListener('click', prevSlide);
document.getElementById('btn-present-next').addEventListener('click', nextSlide);
document.getElementById('btn-present-zoom-out').addEventListener('click', zoomOut);
document.getElementById('btn-present-zoom-in').addEventListener('click', zoomIn);
presentZoomLevel.addEventListener('click', resetZoom);

function togglePresentMode() {
  enterPresentMode();
}

btnHidePreview.addEventListener('click', toggleHidePreview);
btnTogglePreview.addEventListener('click', toggleHidePreview);
btnMaxPreview.addEventListener('click', toggleMaximizePreview);
btnPresentPreview.addEventListener('click', togglePresentMode);

// --- Mindmap Toggle & Connection Redrawing ---
const btnMindmapToggle = document.getElementById('btn-mindmap-toggle');
btnMindmapToggle.addEventListener('click', () => {
  const nextActive = !getMindmapActive();
  setMindmapActive(nextActive);
  btnMindmapToggle.classList.toggle('active', nextActive);
});

window.addEventListener('resize', () => {
  if (getMindmapActive()) {
    drawMindmapLines();
  }
});

// --- Table of Contents Overlay Toggle ---
const btnTocPreview = document.getElementById('btn-toc-preview');
const tocOverlay = document.getElementById('preview-toc-overlay');

btnTocPreview.addEventListener('click', (e) => {
  e.stopPropagation();
  tocOverlay.classList.toggle('open');
});

// Close TOC overlay when clicking a link inside it
tocOverlay.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    tocOverlay.classList.remove('open');
  }
});

// Close TOC overlay when clicking outside
document.addEventListener('click', (e) => {
  if (!tocOverlay.contains(e.target) && e.target !== btnTocPreview) {
    tocOverlay.classList.remove('open');
  }
});

// --- Summary Maximize ---
const bottomPanel = document.getElementById('bottom-panel');
const btnMaxSummary = document.getElementById('btn-maximize-summary');
const resizeSummary = document.getElementById('resize-summary');

function toggleMaximizeSummary() {
  const isMaximized = bottomPanel.classList.contains('panel-maximized');
  if (isMaximized) {
    bottomPanel.classList.remove('panel-maximized');
    btnMaxSummary.innerHTML = icon('maximize');
    btnMaxSummary.title = 'Maximize summary panel';
    resizeSummary.style.display = '';
  } else {
    bottomPanel.classList.remove('panel-collapsed');
    bottomPanel.classList.add('panel-maximized');
    btnMaxSummary.innerHTML = icon('minimize');
    btnMaxSummary.title = 'Restore summary panel';
    resizeSummary.style.display = 'none';
  }
  const ps = loadPanelState();
  ps.summaryMaximized = !isMaximized;
  savePanelState(ps);
}

btnMaxSummary.addEventListener('click', toggleMaximizeSummary);

// --- Escape key closes any maximized panel ---
function handlePanelEscape(e) {
  if (e.key !== 'Escape') return;
  // Don't interfere with palette
  if (palette.classList.contains('open')) return;

  if (previewPane.classList.contains('panel-maximized')) {
    e.preventDefault();
    toggleMaximizePreview();
    return;
  }
  if (sidebar.classList.contains('panel-maximized')) {
    e.preventDefault();
    toggleMaximizeCues();
    return;
  }
  if (bottomPanel.classList.contains('panel-maximized')) {
    e.preventDefault();
    toggleMaximizeSummary();
    return;
  }
}

// --- Init ---
(async () => {
  initSidebarResize();
  initEditorPreviewResize();
  initSummaryResize();
  initMindmapZoomPan();
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

  // Restore panel states
  const ps = loadPanelState();
  if (ps.previewHidden) {
    previewPane.classList.add('panel-hidden');
    resizeEditorPreview.style.display = 'none';
    btnHidePreview.innerHTML = icon('eye');
    btnHidePreview.title = 'Show preview';
    btnTogglePreview.innerHTML = icon('eye');
    btnTogglePreview.title = 'Show preview';
  } else {
    btnTogglePreview.innerHTML = icon('eye-off');
    btnTogglePreview.title = 'Hide preview';
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (presentationActive) {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        e.preventDefault();
        exitPresentMode();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        nextSlide();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
        e.preventDefault();
        prevSlide();
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        resetZoom();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleBrowserFullscreen();
        return;
      }
      return; // disable other app shortcuts during presentation
    }

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
      return;
    }
    handlePanelEscape(e);
  });

  // Word count
  const textarea = document.getElementById('editor-textarea');
  textarea.addEventListener('input', updateCounts);
  updateCounts();

  // --- Mobile Tabs Initialization & Event Listeners ---
  const mobileTabBtns = document.querySelectorAll('.mobile-tab-btn');
  mobileTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchToTab(tab);
    });
  });

  const cuesTabIcon = document.querySelector('.mobile-tab-btn[data-tab="cues"] .mobile-tab-icon');
  const editTabIcon = document.querySelector('.mobile-tab-btn[data-tab="edit"] .mobile-tab-icon');
  const previewTabIcon = document.querySelector('.mobile-tab-btn[data-tab="preview"] .mobile-tab-icon');
  const summaryTabIcon = document.querySelector('.mobile-tab-btn[data-tab="summary"] .mobile-tab-icon');

  if (cuesTabIcon) cuesTabIcon.innerHTML = icon('list');
  if (editTabIcon) editTabIcon.innerHTML = icon('notes');
  if (previewTabIcon) previewTabIcon.innerHTML = icon('eye');
  if (summaryTabIcon) summaryTabIcon.innerHTML = icon('file-text');

  if (window.innerWidth <= 768) {
    switchToTab('edit');
  }

  // --- Register Service Worker for PWA ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    });
  }
})();

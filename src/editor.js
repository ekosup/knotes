import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';

const textarea = document.getElementById('editor-textarea');
const preview = document.getElementById('preview-content');
const titleInput = document.getElementById('note-title');
const summaryTextarea = document.getElementById('summary-textarea');
const cuesList = document.getElementById('cues-list');
const tagsList = document.getElementById('tags-list');
const tagInput = document.getElementById('tag-input');
const btnPin = document.getElementById('btn-pin');

let pinned = false;
let tags = [];

// --- Live markdown preview ---
export function updatePreview() {
  const { html, tocHtml } = renderMarkdown(textarea.value || '');
  preview.innerHTML = `${tocHtml}<div class="prose">${html}</div>`;
}

// --- Sync scroll ---
let scrollSyncing = false;
textarea.addEventListener('scroll', () => {
  if (scrollSyncing) return;
  scrollSyncing = true;
  const ratio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1);
  preview.parentElement.scrollTop = ratio * (preview.parentElement.scrollHeight - preview.parentElement.clientHeight);
  requestAnimationFrame(() => (scrollSyncing = false));
});
preview.parentElement.addEventListener('scroll', () => {
  if (scrollSyncing) return;
  scrollSyncing = true;
  const ratio = preview.parentElement.scrollTop / (preview.parentElement.scrollHeight - preview.parentElement.clientHeight || 1);
  textarea.scrollTop = ratio * (textarea.scrollHeight - textarea.clientHeight);
  requestAnimationFrame(() => (scrollSyncing = false));
});

// --- Cues ---
export function layoutCues(cues) {
  cuesList.innerHTML = '';
  (cues || []).forEach((cue, i) => {
    const li = document.createElement('li');
    li.className = 'cue-item';
    li.innerHTML = `
      <span class="cue-grip">${icon('grip-vertical')}</span>
      <input type="text" class="cue-input" value="${esc(cue.text)}" placeholder="Cue ${i + 1}…" data-cue-id="${cue.id}" />
      <button class="cue-remove btn btn-ghost btn-icon-only btn-xs" data-cue-id="${cue.id}" title="Remove">${icon('x')}</button>
    `;
    cuesList.appendChild(li);
  });
}

export function getEditorState() {
  return {
    title: titleInput.value,
    content: textarea.value,
    summary: summaryTextarea.value,
    cues: [...cuesList.querySelectorAll('.cue-input')].map((inp) => ({
      id: inp.dataset.cueId,
      text: inp.value,
    })),
    tags: [...tags],
    pinned,
  };
}

export function setEditorState({ title, content, summary, cues, tags: t, pinned: p }) {
  titleInput.value = title || '';
  textarea.value = content || '';
  summaryTextarea.value = summary || '';
  tags = t || [];
  pinned = p || false;
  updatePreview();
  layoutCues(cues || []);
  layoutTags();
  updatePinButton();
}

export function clearEditor() {
  setEditorState({ title: '', content: '', summary: '', cues: [], tags: [], pinned: false });
  titleInput.focus();
}

// --- Tags ---
function layoutTags() {
  tagsList.innerHTML = '';
  tags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `<span class="tag-text">${esc(tag)}</span><span class="tag-remove" data-tag="${escAttr(tag)}">${icon('x')}</span>`;
    tagsList.appendChild(pill);
  });
}

function addTag(text) {
  const t = text.trim();
  if (!t || tags.includes(t)) return;
  tags.push(t);
  layoutTags();
  tagInput.value = '';
  fireTagChange();
}

function removeTag(tag) {
  tags = tags.filter((t) => t !== tag);
  layoutTags();
  fireTagChange();
}

function fireTagChange() {
  onTagChange._fn && onTagChange._fn();
}

tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value.replace(/,/g, ''));
  }
  if (e.key === 'Backspace' && !tagInput.value && tags.length) {
    removeTag(tags[tags.length - 1]);
  }
});
tagInput.addEventListener('blur', () => {
  if (tagInput.value.trim()) addTag(tagInput.value);
});

tagsList.addEventListener('click', (e) => {
  const rm = e.target.closest('.tag-remove');
  if (rm) removeTag(rm.dataset.tag);
});

// --- Pin ---
function updatePinButton() {
  btnPin.innerHTML = icon(pinned ? 'pin-filled' : 'pin');
  btnPin.classList.toggle('btn-pinned', pinned);
}

btnPin.addEventListener('click', () => {
  pinned = !pinned;
  updatePinButton();
  fireTagChange();
});

// --- Event wiring ---
export function onEditorChange(fn) {
  textarea.addEventListener('input', () => { updatePreview(); fn(); });
  titleInput.addEventListener('input', fn);
  summaryTextarea.addEventListener('input', fn);
}

export function onTagChange(fn) {
  onTagChange._fn = fn;
}

// Expose for tag click filtering from main.js
export { tagsList, tags };

export function onCueChange(fn) {
  cuesList.addEventListener('input', (e) => {
    if (e.target.classList.contains('cue-input')) fn();
  });
  cuesList.addEventListener('click', (e) => {
    const btn = e.target.closest('.cue-remove');
    if (btn) {
      btn.closest('.cue-item').remove();
      fn();
    }
  });
}

export function onAddCue(fn) {
  document.getElementById('btn-add-cue').addEventListener('click', () => {
    const id = crypto.randomUUID();
    const li = document.createElement('li');
    li.className = 'cue-item';
    li.innerHTML = `
      <span class="cue-grip">${icon('grip-vertical')}</span>
      <input type="text" class="cue-input" value="" placeholder="New cue…" data-cue-id="${id}" />
      <button class="cue-remove btn btn-ghost btn-icon-only btn-xs" data-cue-id="${id}" title="Remove">${icon('x')}</button>
    `;
    cuesList.appendChild(li);
    li.querySelector('.cue-input').focus();
    fn();
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

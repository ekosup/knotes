// Resizable dividers between: sidebar|main and main|summary
const STORAGE_KEY = 'enotes-layout';
const DEFAULTS = { sidebarW: 252, editorFlex: 1, summaryH: 128 };

function loadLayout() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
  catch { return { ...DEFAULTS }; }
}

function saveLayout(layout) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

// --- Horizontal divider (sidebar <-> main) ---
export function initSidebarResize() {
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('resize-sidebar');
  const layout = loadLayout();

  sidebar.style.width = layout.sidebarW + 'px';

  let dragging = false;
  let startX, startW;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    handle.classList.add('resize-active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.max(180, Math.min(500, startW + (e.clientX - startX)));
    sidebar.style.width = w + 'px';
    layout.sidebarW = w;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('resize-active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveLayout(layout);
  });
}

// --- Vertical divider (editor <-> preview in main area) ---
export function initEditorPreviewResize() {
  const editor = document.getElementById('editor-textarea').parentElement;
  const preview = document.getElementById('preview-content').parentElement;
  const handle = document.getElementById('resize-editor-preview');
  const container = document.getElementById('editor-container');
  const layout = loadLayout();

  setFlex(editor, layout.editorFlex);

  let dragging = false;
  let startX, startFlex;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startFlex = getFlex(editor);
    handle.classList.add('resize-active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const totalW = container.getBoundingClientRect().width;
    const delta = (e.clientX - startX) / totalW;
    const flex = Math.max(0.2, Math.min(0.8, startFlex + delta));
    setFlex(editor, flex);
    setFlex(preview, 1 - flex);
    layout.editorFlex = flex;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('resize-active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveLayout(layout);
  });
}

// --- Horizontal divider (main <-> summary) ---
export function initSummaryResize() {
  const panel = document.getElementById('bottom-panel');
  const handle = document.getElementById('resize-summary');
  const layout = loadLayout();

  panel.style.height = layout.summaryH + 'px';

  let dragging = false;
  let startY, startH;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;
    handle.classList.add('resize-active');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const h = Math.max(64, Math.min(400, startH - (e.clientY - startY)));
    panel.style.height = h + 'px';
    layout.summaryH = h;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('resize-active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveLayout(layout);
  });
}

function getFlex(el) { return parseFloat(el.style.flex) || 0.5; }
function setFlex(el, v) { el.style.flex = v.toFixed(3); }

import { icon } from './icons.js';

// Global Zoom & Pan State
let zoom = 1.0;
let panX = 0;
let panY = 0;

// --- Markdown to Tree Parser ---
export function parseMarkdownToTree(text) {
  const lines = text.split('\n');
  const root = { id: 'root', type: 'root', text: 'Root', children: [] };
  const stack = [{ node: root, type: 'root', headingLevel: 0, listIndent: -1 }];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;

    // Ignore horizontal rules / markdown separators (e.g. ---, ***, ___, - - -, etc.)
    if (/^(?:\s*[-\*_]){3,}\s*$/.test(trimmed)) {
      return;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const node = {
        id: `node-${index}`,
        type: 'heading',
        level: level,
        text: content,
        children: []
      };

      while (stack.length > 1 && 
             (stack[stack.length - 1].type === 'list-item' || 
              stack[stack.length - 1].type === 'paragraph' ||
              stack[stack.length - 1].headingLevel >= level)) {
        stack.pop();
      }

      stack[stack.length - 1].node.children.push(node);
      stack.push({ node, type: 'heading', headingLevel: level, listIndent: -1 });
      return;
    }

    // List items
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const indentStr = listMatch[1];
      const indent = indentStr.length;
      const bullet = listMatch[2];
      const content = listMatch[3];
      const node = {
        id: `node-${index}`,
        type: 'list-item',
        level: indent,
        bullet: bullet,
        indent: indentStr,
        text: content,
        children: []
      };

      while (stack.length > 1 && 
             ((stack[stack.length - 1].type === 'list-item' && stack[stack.length - 1].listIndent >= indent) ||
              stack[stack.length - 1].type === 'paragraph')) {
        stack.pop();
      }

      stack[stack.length - 1].node.children.push(node);
      stack.push({ node, type: 'list-item', headingLevel: stack[stack.length - 1].headingLevel, listIndent: indent });
      return;
    }

    // Paragraph
    const node = {
      id: `node-${index}`,
      type: 'paragraph',
      text: line,
      children: []
    };

    while (stack.length > 1 && 
           (stack[stack.length - 1].type === 'list-item' || 
            stack[stack.length - 1].type === 'paragraph')) {
      stack.pop();
    }

    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, type: 'paragraph', headingLevel: stack[stack.length - 1].headingLevel, listIndent: stack[stack.length - 1].listIndent });
  });

  return root;
}

// --- DOM tree to Markdown Serializer ---
export function domToMarkdown(branchEl) {
  const nodeEl = branchEl.querySelector(':scope > .mindmap-node');
  const childrenContainer = branchEl.querySelector(':scope > .mindmap-children');
  let lines = [];

  if (nodeEl && nodeEl.dataset.type !== 'root') {
    const type = nodeEl.dataset.type;
    const textNode = nodeEl.querySelector('.mindmap-node-text');
    const text = textNode ? textNode.textContent : '';
    
    if (type === 'heading') {
      const level = parseInt(nodeEl.dataset.level || '1');
      if (lines.length > 0) lines.push('');
      lines.push(`${'#'.repeat(level)} ${text}`);
    } else if (type === 'list-item') {
      const indent = nodeEl.dataset.indent || '';
      const bullet = nodeEl.dataset.bullet || '-';
      lines.push(`${indent}${bullet} ${text}`);
    } else if (type === 'paragraph') {
      lines.push(text);
    }
  }

  if (childrenContainer) {
    const childBranches = childrenContainer.querySelectorAll(':scope > .mindmap-branch');
    childBranches.forEach(child => {
      lines.push(...domToMarkdown(child));
    });
  }

  return lines;
}

// --- SVG connections drawing ---
export function drawMindmapLines() {
  const container = document.getElementById('mindmap-container');
  if (!container) return;
  const viewportContent = document.getElementById('mindmap-viewport-content');
  if (!viewportContent) return;
  const svg = document.getElementById('mindmap-svg');
  if (!svg) return;

  svg.innerHTML = '';
  
  // Set SVG size to match the viewportContent's layout size
  const scrollWidth = viewportContent.offsetWidth;
  const scrollHeight = viewportContent.offsetHeight;
  
  // Set attributes for SVG layout/viewbox
  svg.setAttribute('width', scrollWidth);
  svg.setAttribute('height', scrollHeight);
  svg.setAttribute('viewBox', `0 0 ${scrollWidth} ${scrollHeight}`);
  svg.style.width = `${scrollWidth}px`;
  svg.style.height = `${scrollHeight}px`;

  if (scrollWidth === 0 || scrollHeight === 0) return; // Hidden, don't draw

  const branches = container.querySelectorAll('.mindmap-branch');

  // Helper function to get relative coordinates of a node inside the viewport content
  function getRelativePos(element, targetContainer) {
    let x = 0;
    let y = 0;
    let current = element;
    let found = false;
    while (current) {
      if (current === targetContainer) {
        found = true;
        break;
      }
      x += current.offsetLeft;
      y += current.offsetTop;
      current = current.offsetParent;
    }
    return found ? { x, y } : null;
  }

  branches.forEach(branch => {
    const parentNode = branch.querySelector(':scope > .mindmap-node');
    const childrenContainer = branch.querySelector(':scope > .mindmap-children');
    if (!parentNode || !childrenContainer) return;

    const childBranches = childrenContainer.querySelectorAll(':scope > .mindmap-branch');
    childBranches.forEach(childBranch => {
      const childNode = childBranch.querySelector(':scope > .mindmap-node');
      if (!childNode) return;

      const pPos = getRelativePos(parentNode, viewportContent);
      const cPos = getRelativePos(childNode, viewportContent);
      if (!pPos || !cPos) return; // Skips if not in viewportContent or hidden

      // Calculate connection coordinates relative to the viewportContent
      const x1 = pPos.x + parentNode.offsetWidth;
      const y1 = pPos.y + parentNode.offsetHeight / 2;

      const x2 = cPos.x;
      const y2 = cPos.y + childNode.offsetHeight / 2;

      // Calculate beautiful bezier control points
      const dx = Math.max(30, (x2 - x1) * 0.45);
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', 'mindmap-connection-line');
      svg.appendChild(path);
    });
  });
}

// --- Node interaction events ---
function initNodeEvents(contentSpan) {
  contentSpan.addEventListener('focus', () => {
    contentSpan.dataset.originalText = contentSpan.textContent;
  });

  contentSpan.addEventListener('input', () => {
    // Redraw lines instantly as user types (handles wrapping and height changes)
    drawMindmapLines();
  });

  contentSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      contentSpan.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      contentSpan.textContent = contentSpan.dataset.originalText || '';
      contentSpan.blur();
    }
  });

  contentSpan.addEventListener('blur', () => {
    const oldText = contentSpan.dataset.originalText;
    const newText = contentSpan.textContent;

    if (oldText !== newText) {
      const nodeEl = contentSpan.closest('.mindmap-node');
      const isRoot = nodeEl.dataset.type === 'root';

      if (isRoot) {
        // Sync note title input
        const noteTitleInput = document.getElementById('note-title');
        if (noteTitleInput) {
          noteTitleInput.value = newText;
          noteTitleInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        // Serialize the mindmap DOM back to markdown
        const rootBranch = document.querySelector('.mindmap-root-branch');
        if (rootBranch) {
          const markdown = domToMarkdown(rootBranch).join('\n');
          const textarea = document.getElementById('editor-textarea');
          if (textarea) {
            textarea.value = markdown;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    }
    drawMindmapLines();
  });
}

// --- Node renderer helper ---
function createNodeElement(node) {
  const branchDiv = document.createElement('div');
  branchDiv.className = 'mindmap-branch';
  if (node.type === 'root') {
    branchDiv.classList.add('mindmap-root-branch');
  }

  const nodeDiv = document.createElement('div');
  nodeDiv.className = `mindmap-node mindmap-node-${node.type}`;
  nodeDiv.dataset.id = node.id;
  nodeDiv.dataset.type = node.type;
  
  if (node.type === 'heading') {
    nodeDiv.dataset.level = node.level;
  } else if (node.type === 'list-item') {
    nodeDiv.dataset.indent = node.indent;
    nodeDiv.dataset.bullet = node.bullet;
  }

  // Node content
  const contentSpan = document.createElement('span');
  contentSpan.className = 'mindmap-node-text';
  contentSpan.contentEditable = 'true';
  contentSpan.textContent = node.text;
  
  // Attach events
  initNodeEvents(contentSpan);
  
  // Icon/Bullet prefix
  let iconSpan = null;
  if (node.type === 'root') {
    iconSpan = document.createElement('span');
    iconSpan.className = 'mindmap-node-icon root-icon';
    iconSpan.innerHTML = icon('notes');
  } else if (node.type === 'heading') {
    iconSpan = document.createElement('span');
    iconSpan.className = 'mindmap-node-icon heading-icon';
    iconSpan.textContent = `H${node.level}`;
  } else if (node.type === 'list-item') {
    iconSpan = document.createElement('span');
    iconSpan.className = 'mindmap-node-icon list-icon';
    iconSpan.textContent = '•';
  } else if (node.type === 'paragraph') {
    iconSpan = document.createElement('span');
    iconSpan.className = 'mindmap-node-icon para-icon';
    iconSpan.textContent = '¶';
  }

  if (iconSpan) {
    nodeDiv.appendChild(iconSpan);
  }
  nodeDiv.appendChild(contentSpan);
  branchDiv.appendChild(nodeDiv);

  if (node.children && node.children.length > 0) {
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'mindmap-children';
    node.children.forEach(child => {
      childrenDiv.appendChild(createNodeElement(child));
    });
    branchDiv.appendChild(childrenDiv);
  }

  return branchDiv;
}

// --- Zoom & Pan Controls ---
export function resetMindmapZoomPan() {
  zoom = 1.0;
  panX = 0;
  panY = 0;
  const viewportContent = document.getElementById('mindmap-viewport-content');
  const zoomLabel = document.getElementById('mindmap-zoom-level');
  if (viewportContent) {
    viewportContent.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    viewportContent.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
  if (zoomLabel) {
    zoomLabel.textContent = '100%';
  }
}

export function initMindmapZoomPan() {
  const scrollParent = document.getElementById('mindmap-content');
  const viewportContent = document.getElementById('mindmap-viewport-content');
  const btnZoomIn = document.getElementById('btn-mindmap-zoom-in');
  const btnZoomOut = document.getElementById('btn-mindmap-zoom-out');
  const zoomLabel = document.getElementById('mindmap-zoom-level');

  if (!scrollParent || !viewportContent) return;

  // Set up ResizeObserver to handle layout size changes, screen size changes, maximize, or tab switching robustly
  const container = document.getElementById('mindmap-container');
  if (container && window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        drawMindmapLines();
      }
    });
    resizeObserver.observe(container);
    resizeObserver.observe(viewportContent);
    resizeObserver.observe(scrollParent);
  }

  // Inject icons into HUD buttons
  if (btnZoomIn) btnZoomIn.innerHTML = icon('zoom-in');
  if (btnZoomOut) btnZoomOut.innerHTML = icon('zoom-out');

  function updateTransform(smooth = false) {
    if (smooth) {
      viewportContent.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
      viewportContent.style.transition = 'none';
    }
    viewportContent.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  // Zoom actions
  function zoomIn() {
    zoom = Math.min(2.0, zoom + 0.1);
    updateTransform(true);
  }

  function zoomOut() {
    zoom = Math.max(0.4, zoom - 0.1);
    updateTransform(true);
  }

  // Bind click handlers
  if (btnZoomIn) {
    btnZoomIn.onclick = (e) => {
      e.stopPropagation();
      zoomIn();
    };
  }

  if (btnZoomOut) {
    btnZoomOut.onclick = (e) => {
      e.stopPropagation();
      zoomOut();
    };
  }

  if (zoomLabel) {
    zoomLabel.onclick = (e) => {
      e.stopPropagation();
      resetMindmapZoomPan();
    };
  }

  // Mouse Drag to Pan
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  scrollParent.addEventListener('mousedown', (e) => {
    // Prevent panning when clicking nodes or HUD
    if (e.target.closest('.mindmap-node') || e.target.closest('.mindmap-hud') || e.target.closest('.btn')) {
      return;
    }
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform(false);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch Support
  let isTouching = false;
  scrollParent.addEventListener('touchstart', (e) => {
    if (e.target.closest('.mindmap-node') || e.target.closest('.mindmap-hud') || e.target.closest('.btn')) {
      return;
    }
    const touch = e.touches[0];
    isTouching = true;
    startX = touch.clientX - panX;
    startY = touch.clientY - panY;
  });

  document.addEventListener('touchmove', (e) => {
    if (!isTouching) return;
    const touch = e.touches[0];
    panX = touch.clientX - startX;
    panY = touch.clientY - startY;
    updateTransform(false);
  });

  document.addEventListener('touchend', () => {
    isTouching = false;
  });
}

// --- Render Mindmap ---
export function renderMindmap(markdownText, noteTitle, forceReset = false) {
  const container = document.getElementById('mindmap-container');
  const scrollParent = document.getElementById('mindmap-content');
  if (!container || !scrollParent) return;

  const isUpdate = container.children.length > 0;

  if (forceReset) {
    resetMindmapZoomPan();
  }

  function doRender() {
    container.innerHTML = '';
    
    // Parse markdown to tree
    const tree = parseMarkdownToTree(markdownText);
    tree.text = noteTitle || 'Untitled Note';
    
    // Create tree structure
    const rootBranch = createNodeElement(tree);
    container.appendChild(rootBranch);

    // Initial draw of connection lines
    setTimeout(() => {
      drawMindmapLines();
      if (isUpdate) {
        scrollParent.classList.remove('updating');
      }
    }, 50);
  }

  if (isUpdate) {
    scrollParent.classList.add('updating');
    // Wait for the opacity transition to complete (200ms)
    setTimeout(doRender, 200);
  } else {
    doRender();
  }
}

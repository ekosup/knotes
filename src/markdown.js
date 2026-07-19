import { Marked } from 'marked';

const marked = new Marked({ gfm: true });

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyHeading(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function createUniqueSlug(text, usedSlugs) {
  const base = slugifyHeading(text) || 'section';
  let slug = base;
  let counter = 2;

  while (usedSlugs.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  usedSlugs.add(slug);
  return slug;
}

function buildTocTree(headings) {
  const root = [];
  const stack = [{ depth: 0, children: root }];

  headings.forEach((heading) => {
    while (stack.length > 1 && heading.depth <= stack[stack.length - 1].depth) {
      stack.pop();
    }

    const node = { ...heading, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });

  return root;
}

function buildTocList(items) {
  if (!items.length) return '';

  const itemsHtml = items.map((item) => {
    const nestedList = item.children.length ? `<ol class="toc-list">${buildTocList(item.children)}</ol>` : '';
    return `<li class="toc-item"><a href="#${item.slug}">${escapeHtml(item.text)}</a>${nestedList}</li>`;
  }).join('');

  return itemsHtml;
}

function buildTocHtml(headings) {
  if (!headings.length) return '';

  return `
    <nav class="toc" aria-label="Table of contents">
      <div class="toc-title">Contents</div>
      <ol class="toc-list">${buildTocList(headings)}</ol>
    </nav>
  `;
}

export function renderMarkdown(markdown) {
  const html = marked.parse(markdown || '');
  const container = document.createElement('div');
  container.innerHTML = html;

  const usedSlugs = new Set();
  const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((heading) => {
    const text = heading.textContent.trim();
    const slug = createUniqueSlug(text, usedSlugs);
    heading.id = slug;
    return { text, depth: Number(heading.tagName.slice(1)), slug };
  });

  return {
    html: container.innerHTML,
    tocHtml: buildTocHtml(buildTocTree(headings)),
  };
}

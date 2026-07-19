export function exportJSON(note) {
  const blob = new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${slug(note.title || 'note')}.json`);
}

export function exportMarkdown(note) {
  let md = '';
  md += `# ${note.title || 'Untitled'}\n\n`;
  if (note.tags && note.tags.length > 0) {
    md += `**Tags:** ${note.tags.join(', ')}\n\n`;
  }
  if (note.cues && note.cues.length > 0) {
    md += `## Cues\n\n`;
    note.cues.forEach((c) => {
      md += `- ${c.text || '(empty)'}\n`;
    });
    md += '\n';
  }
  md += `## Notes\n\n${note.content || ''}\n\n`;
  md += `## Summary\n\n${note.summary || ''}\n`;
  const blob = new Blob([md], { type: 'text/markdown' });
  downloadBlob(blob, `${slug(note.title || 'note')}.md`);
}

export async function importFile(file) {
  const text = await file.text();
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'json') {
    const data = JSON.parse(text);
    return {
      id: '',
      title: data.title || '',
      createdAt: data.createdAt || '',
      updatedAt: data.updatedAt || '',
      cues: data.cues || [],
      tags: data.tags || [],
      pinned: data.pinned || false,
      content: data.content || '',
      summary: data.summary || '',
    };
  }

  if (ext === 'md' || ext === 'markdown') {
    return parseMarkdownToNote(text, file.name.replace(/\.(md|markdown)$/i, ''));
  }

  throw new Error('Unsupported format. Use .json or .md files.');
}

function parseMarkdownToNote(md, fallbackTitle) {
  const lines = md.split('\n');
  let title = fallbackTitle;
  const cues = [];
  let content = '';
  let summary = '';
  let section = 'content';

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/i);
    if (h1) {
      title = h1[1].trim();
      section = 'content';
      continue;
    }
    if (h2) {
      const heading = h2[1].toLowerCase();
      if (heading === 'cues' || heading === 'keywords') {
        section = 'cues';
        continue;
      }
      if (heading === 'notes' || heading === 'content') {
        section = 'content';
        continue;
      }
      if (heading === 'summary') {
        section = 'summary';
        continue;
      }
    }
    if (section === 'cues' && line.startsWith('- ')) {
      cues.push({ id: crypto.randomUUID(), text: line.slice(2).trim() });
    } else if (section === 'content') {
      content += line + '\n';
    } else if (section === 'summary') {
      summary += line + '\n';
    }
  }

  return {
    id: '',
    title: title.trim(),
    createdAt: '',
    updatedAt: '',
    cues,
    tags: [],
    pinned: false,
    content: content.trim(),
    summary: summary.trim(),
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'note';
}

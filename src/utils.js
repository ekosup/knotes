// Tiny helpers — no dependencies
export function debounce(fn, ms = 300) {
  let id;
  const debounced = (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
  debounced.flush = () => {
    clearTimeout(id);
    fn();
  };
  debounced.cancel = () => clearTimeout(id);
  return debounced;
}

export function uuid() {
  return crypto.randomUUID();
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

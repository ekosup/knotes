const endpointKey = 'enotes-sync-endpoint';
const userIdKey = 'enotes-sync-user';

export function getEndpoint() {
  return localStorage.getItem(endpointKey) || '';
}

export function setEndpoint(url) {
  localStorage.setItem(endpointKey, url);
}

export function hasEndpoint() {
  return !!getEndpoint();
}

export function getUserId() {
  return localStorage.getItem(userIdKey) || '';
}

export function setUserId(id) {
  localStorage.setItem(userIdKey, id);
}

export async function pushPull(endpoint, userId, notes) {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, notes }),
  });

  if (!res.ok) {
    throw new Error(`Sync failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.notes || !Array.isArray(data.notes)) {
    throw new Error('Invalid sync response');
  }

  return data.notes;
}

// ponytail: global lock — if someone double-clicks sync, last merge wins; no queue needed
let syncing = false;

export async function syncNotes(endpoint, userId, localNotes, onMerge, onStatus) {
  if (syncing) return;
  syncing = true;

  try {
    onStatus?.('syncing');
    const remoteNotes = await pushPull(endpoint, userId, localNotes);
    onMerge?.(remoteNotes);
    onStatus?.('ok');
  } catch (err) {
    console.error('Sync error:', err);
    onStatus?.('err', err.message);
  } finally {
    syncing = false;
  }
}

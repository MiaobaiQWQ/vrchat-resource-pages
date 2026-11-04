const DB_NAME = 'shijian-local-library';
let connection;

export function openStorage() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['sources', 'preferences', 'covers']) db.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}

export async function storage(store, action, key, value) {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, ['get', 'getAll', 'getAllKeys'].includes(action) ? 'readonly' : 'readwrite');
    const target = transaction.objectStore(store);
    const request = action === 'put' ? target.put(value, key) : key === undefined ? target[action]() : target[action](key);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('本地存储操作已中断'));
  });
}

export async function saveCover(key, blob) {
  await storage('covers', 'put', key, { blob, at: Date.now() });
  const keys = await storage('covers', 'getAllKeys');
  if (keys.length > 180) {
    const values = await storage('covers', 'getAll');
    const oldest = keys.map((id, i) => ({ id, at: values[i].at })).sort((a, b) => a.at - b.at).slice(0, keys.length - 180);
    await Promise.all(oldest.map(item => storage('covers', 'delete', item.id)));
  }
}

export async function purgeSource(sourceId) {
  await storage('sources', 'delete', sourceId);
  const keys = await storage('covers', 'getAllKeys');
  await Promise.all(keys.filter(key => key.startsWith(sourceId + ':')).map(key => storage('covers', 'delete', key)));
  const settings = await storage('preferences', 'getAllKeys');
  await Promise.all(settings.filter(key => key.startsWith('password:' + sourceId + ':')).map(key => storage('preferences', 'delete', key)));
}

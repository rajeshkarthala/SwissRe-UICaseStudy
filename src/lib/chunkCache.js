// Minimal IndexedDB chunk cache wrapper for storing file byte ranges.
// Simple API: open(dbName), putChunk(fileId, start, blob), getChunk(fileId, start, end), getManifest(fileId), putManifest
const DB_NAME = 'doc-chunks-v1'
const DB_VERSION = 1
const CHUNKS_STORE = 'chunks'
const MANIFEST_STORE = 'manifests'

// Simple per-file cache cap (demo). If exceeded, we'll evict that file's chunks.
const PER_FILE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB per file (demo)

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const s = db.createObjectStore(CHUNKS_STORE, { keyPath: ['fileId','start'] })
        s.createIndex('byFile', ['fileId'])
      }
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) {
        db.createObjectStore(MANIFEST_STORE, { keyPath: 'fileId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putChunk(fileId, start, blob) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readwrite')
    const store = tx.objectStore(CHUNKS_STORE)
    store.put({ fileId, start, blob })
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getChunksForRange(fileId, start, end) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly')
    const store = tx.objectStore(CHUNKS_STORE)
    const index = store.index('byFile')
    const req = index.openCursor(IDBKeyRange.only([fileId]))
    const out = []
    req.onsuccess = (ev) => {
      const cur = ev.target.result
      if (!cur) return resolve(out)
      const rec = cur.value
      const recStart = rec.start
      const recBlob = rec.blob
      // We store chunk start only; assume chunk size from blob.size
      const recEnd = recStart + (recBlob.size || 0) - 1
      if (!(recEnd < start || recStart > end)) {
        out.push({ start: recStart, end: recEnd, blob: recBlob })
      }
      cur.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

export async function putManifest(manifest) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MANIFEST_STORE, 'readwrite')
    const store = tx.objectStore(MANIFEST_STORE)
    store.put(manifest)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getManifest(fileId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MANIFEST_STORE, 'readonly')
    const store = tx.objectStore(MANIFEST_STORE)
    const req = store.get(fileId)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function clearChunks(fileId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readwrite')
    const store = tx.objectStore(CHUNKS_STORE)
    const index = store.index('byFile')
    const req = index.openCursor(IDBKeyRange.only([fileId]))
    req.onsuccess = (ev) => {
      const cur = ev.target.result
      if (!cur) return resolve(true)
      cur.delete()
      cur.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

// Convenience: add chunk and update manifest with simple eviction policy.
export async function putChunkWithManifest(fileId, start, blob) {
  // store chunk
  await putChunk(fileId, start, blob)
  // update manifest
  let manifest = await getManifest(fileId)
  if (!manifest) manifest = { fileId, ranges: [], totalBytes: 0, updatedAt: Date.now() }
  const size = blob.size || 0
  manifest.ranges.push({ start, end: start + size - 1 })
  manifest.totalBytes = (manifest.totalBytes || 0) + size
  manifest.updatedAt = Date.now()
  await putManifest(manifest)

  // simple eviction: if this file exceeds per-file cap, clear its chunks
  if (manifest.totalBytes > PER_FILE_MAX_BYTES) {
    await clearChunks(fileId)
    manifest.ranges = []
    manifest.totalBytes = 0
    manifest.updatedAt = Date.now()
    await putManifest(manifest)
  }
  return true
}

export default { putChunk, getChunksForRange, putManifest, getManifest, clearChunks }

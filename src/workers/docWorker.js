// Web Worker module (ESM).
// Streams a PDF from a URL (uses fetch + ReadableStream) and posts ArrayBuffer chunks to the main thread.

import { getChunksForRange, putChunk, getManifest, putManifest } from '../lib/chunkCache.js'

let cancelled = false

// Import pdfjs in worker scope using dynamic import so bundlers handle it.
let pdfjsLib = null

self.onmessage = async (evt) => {
  const msg = evt.data
  if (!msg || !msg.type) return

  if (msg.type === 'start') {
    cancelled = false
    const { docId, url, fileId = url, useRange = false } = msg
    try {
      if (!pdfjsLib) {
        // eslint-disable-next-line no-undef
        pdfjsLib = await import('pdfjs-dist/legacy/build/pdf')
      }

      // stream and render in worker (supports optional range requests)
      await streamAndRender(url, fileId, docId, useRange)
    } catch (err) {
      self.postMessage({ type: 'error', docId, message: String(err) })
    }
  }

  if (msg.type === 'cancel') {
    cancelled = true
  }
}

async function streamAndRender(url, fileId, docId, useRange = false) {
  const buffers = []
  let received = 0
  let totalBytes = undefined

  self.postMessage({ type: 'started', docId })

  if (useRange) {
    const chunkSize = 128 * 1024 // 128KB
    let pos = 0

    // Try to reuse any cached chunks first
    while (true) {
      if (cancelled) { self.postMessage({ type: 'cancelled', docId }); return }

      // check cache for this range
      const cached = await getChunksForRange(fileId, pos, pos + chunkSize - 1)
      if (cached && cached.length) {
        // push cached pieces in order
        for (const c of cached) {
          if (cancelled) { self.postMessage({ type: 'cancelled', docId }); return }
          const buf = await c.blob.arrayBuffer()
          buffers.push(buf)
          received += buf.byteLength
          self.postMessage({ type: 'chunk', docId, chunk: buf, received, totalBytes }, [buf])
          self.postMessage({ type: 'progress', docId, received, totalBytes })
          pos = c.end + 1
        }
        // try parse after cached parts
        await tryParseAndRender(buffers, received, docId)
        // continue to fetch remaining ranges
        if (typeof totalBytes === 'number' && received >= totalBytes) break
        continue
      }

      const end = pos + chunkSize - 1
      const res = await fetch(url, { headers: { Range: `bytes=${pos}-${end}` } })
      if (!res.ok && res.status !== 206) {
        // If server doesn't support ranges, fall back to full download
        break
      }

      const chunk = await res.arrayBuffer()
      // store into cache as Blob (use manifest aware helper)
      try { await import('../lib/chunkCache.js').then(m => m.putChunkWithManifest(fileId, pos, new Blob([chunk]))) } catch (e) { /* ignore cache errors */ }

      buffers.push(chunk)
      received += chunk.byteLength
      self.postMessage({ type: 'chunk', docId, chunk, received, totalBytes }, [chunk])
      self.postMessage({ type: 'progress', docId, received, totalBytes })

      const contentRange = res.headers.get('content-range')
      if (contentRange) {
        const m = contentRange.match(/\/(\d+)$/)
        if (m) totalBytes = Number(m[1])
      } else {
        const cl = res.headers.get('content-length')
        if (cl && !totalBytes) totalBytes = Number(cl)
      }

      if (typeof totalBytes === 'number' && received >= totalBytes) break
      if (chunk.byteLength === 0) break
      pos += chunk.byteLength

      // attempt progressive parse/render after each chunk
      await tryParseAndRender(buffers, received, docId)
    }

    if (cancelled) return
    await tryParseAndRender(buffers, received, docId)
    self.postMessage({ type: 'done', docId })
    return
  }

  // Fallback: stream whole resource
  const res = await fetch(url)
  if (!res.body) throw new Error('Streaming not supported')
  const reader = res.body.getReader()

  while (true) {
    if (cancelled) { self.postMessage({ type: 'cancelled', docId }); return }
    const { done, value } = await reader.read()
    if (done) break
    const buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    try { await putChunk(url, received, new Blob([buf])) } catch (e) { /* ignore */ }
    buffers.push(buf)
    received += value.byteLength
    self.postMessage({ type: 'chunk', docId, chunk: buf, received, totalBytes }, [buf])
    self.postMessage({ type: 'progress', docId, received, totalBytes })
    await tryParseAndRender(buffers, received, docId)
  }

  self.postMessage({ type: 'done', docId })
}

async function tryParseAndRender(buffers, received, docId) {
  try {
    const combined = concatBuffers(buffers, received)
    const loadingTask = pdfjsLib.getDocument({ data: combined, disableWorker: true })
    const pdf = await loadingTask.promise

    const pageCount = Math.min(3, pdf.numPages)
    for (let i = 1; i <= pageCount; i++) {
      if (cancelled) { self.postMessage({ type: 'cancelled', docId }); return }
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 0.6 })
      const offscreen = new OffscreenCanvas(Math.floor(viewport.width), Math.floor(viewport.height))
      const ctx = offscreen.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
      const bitmap = offscreen.transferToImageBitmap()
      self.postMessage({ type: 'thumbnail', docId, page: i, bitmap }, [bitmap])
    }
  } catch (err) {
    // parsing may fail until enough bytes arrive; ignore and continue
  }
}

function concatBuffers(buffers, totalLen) {
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset)
    offset += b.byteLength
  }
  return out.buffer
}

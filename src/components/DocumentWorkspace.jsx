import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { fetchDocument, saveAnnotations, splitDocument, mergeDocument } from '../api/mockApi'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export default function DocumentWorkspace({ record, recordId, onClose, onDocChange }) {
  const workerRef = useRef(null)
  const [fileUrl, setFileUrl] = useState('/files/sample.pdf')
  const [chunks, setChunks] = useState([])
  const [progress, setProgress] = useState({ received: 0, total: 0 })
  const [status, setStatus] = useState('idle') // idle | streaming | done | cancelled
  const [useRange, setUseRange] = useState(true)
  const [recordState, setRecordState] = useState(record || null)

  const getActiveId = () => (record && record.id) || (recordState && recordState.id) || recordId
  const getActiveName = () => (record && record.name) || (recordState && recordState.name) || (recordId ? `Document ${recordId}` : undefined)

  useEffect(() => {
    // reset when record or recordId changes
    setChunks([])
    setProgress({ received: 0, total: 0 })
    setStatus('idle')
    let idToFetch = record ? record.id : recordId
    if (idToFetch) {
      (async () => {
        try {
          const meta = await fetchDocument(idToFetch)
          setRecordState(meta)
          const url = (meta && meta.fileUrl) || '/files/sample.pdf'
          const fid = (meta && meta.fileId) || url
          setFileUrl(url)
          // store fileId on the recordState so worker uses stable id
          setRecordState((r) => ({ ...r, fileId: fid }))
          setTimeout(() => { try { startStreaming() } catch (e) {} }, 60)
        } catch (e) {
          // ignore
        }
      })()
    }

    // cleanup worker on unmount or when id changes
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [record, recordId])

  const startStreaming = async () => {
    const useRecord = record || recordState
    if (!useRecord) return

    // terminate previous worker if any
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }

    // create worker using Vite's public URL for modules
    // new URL import required for bundlers (Vite)
    const worker = new Worker(new URL('../workers/docWorker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker

    // assemble binary chunks as they arrive
    let receivedBuffers = []
    let receivedBytes = 0
    let parsingInProgress = false

    worker.onmessage = (e) => {
      const msg = e.data
      if (!msg) return

      if (msg.type === 'started') {
        setStatus('streaming')
        setProgress({ received: 0, total: 0 })
      }

      if (msg.type === 'progress') {
        setProgress((p) => ({ ...p, received: msg.received, total: msg.totalBytes || p.total }))
      }

      if (msg.type === 'thumbnail') {
        // msg.bitmap is an ImageBitmap transferred from worker
        const { page, bitmap } = msg
        setChunks((c) => {
          // keep unique pages, replace if exists
          const others = c.filter(x => x.page !== page)
          return [...others, { page, bitmap }].sort((a,b)=>a.page-b.page)
        })
      }

      if (msg.type === 'done') {
        setStatus('done')
      }

      if (msg.type === 'cancelled' || msg.type === 'error') {
        setStatus('cancelled')
      }
    }

    // start streaming from the file URL provided in metadata (or default)
    const useFileId = useRecord.fileId || fileUrl
    worker.postMessage({ type: 'start', docId: useRecord.id || getActiveId(), url: fileUrl, fileId: useFileId, useRange })
  }

  const cancelStreaming = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel' })
      // terminate to ensure resources freed
      workerRef.current.terminate()
      workerRef.current = null
    }
    setStatus('cancelled')
  }

  const retry = () => {
    setChunks([])
    setProgress({ received: 0, total: 0 })
    setStatus('idle')
    startStreaming()
  }

  // Comment and annotation helpers
  const [selectedPage, setSelectedPage] = useState(null)
  const [pageComments, setPageComments] = useState({})
  const [commentText, setCommentText] = useState('')

  const addComment = async () => {
    if (!selectedPage) return
    const comment = { id: `c-${Date.now()}`, text: commentText, createdAt: new Date().toISOString() }
    setPageComments((p) => ({ ...p, [selectedPage]: [...(p[selectedPage] || []), comment] }))
    setCommentText('')
    try { await saveAnnotations(getActiveId(), { comments: [comment], page: selectedPage }) } catch (e) { /* ignore */ }
  }

  const handleSplit = async (fromPage, toPage) => {
    const activeId = getActiveId()
    if (!window.confirm(`Split document ${activeId} pages ${fromPage}-${toPage}?`)) return

    const tempId = -Date.now()
    const newTitle = `${getActiveName() || 'Document'} (split ${fromPage}-${toPage})`
    const temp = { id: tempId, name: newTitle, policyNumber: `POL-temp-${Math.abs(tempId)}`, status: 'Processing', date: new Date().toISOString().split('T')[0] }
    onDocChange && onDocChange('startCreate', { temp })

    try {
      const res = await splitDocument(activeId, fromPage, toPage)
      onDocChange && onDocChange('created', { newId: res.newId })
      pushAlert(`Split created new document id: ${res.newId}`)
    } catch (e) {
      onDocChange && onDocChange('failedCreate', { tempId })
      pushAlert('Split failed')
    }
  }

  const handleMerge = async (otherId) => {
    const activeId = getActiveId()
    if (!window.confirm(`Merge document ${activeId} with ${otherId}?`)) return

    const tempId = -Date.now()
    const newTitle = `${getActiveName() || 'Document'} + ${otherId}`
    const temp = { id: tempId, name: newTitle, policyNumber: `POL-temp-${Math.abs(tempId)}`, status: 'Merging', date: new Date().toISOString().split('T')[0] }
    onDocChange && onDocChange('startCreate', { temp })

    try {
      const res = await mergeDocument(activeId, Number(otherId))
      onDocChange && onDocChange('created', { newId: res.newId })
      pushAlert(`Merged to new document id: ${res.newId}`)
    } catch (e) {
      onDocChange && onDocChange('failedCreate', { tempId })
      pushAlert('Merge failed')
    }
  }

  const pushAlert = (msg) => {
    try { alert(msg) } catch (e) { /* noop */ }
  }

  // allow opening by `recordId` (route-driven) or by passing a `record` prop
  if (!record && !recordId) {
    return (
      <aside className="workspace empty">
        <div className="workspace-inner">No document selected</div>
      </aside>
    )
  }

  const activeRecord = record || recordState || (recordId ? { id: recordId, name: `Document ${recordId}` } : null)

  return (
    <aside className="workspace">
      <div className="workspace-inner">
        <div className="workspace-header">
          <h3>Document Workspace</h3>
          <div>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="record-summary">
          <p><strong>ID:</strong> {activeRecord && activeRecord.id}</p>
          <p><strong>Name:</strong> {activeRecord && activeRecord.name}</p>
          <p><strong>Policy:</strong> {activeRecord && activeRecord.policyNumber}</p>
          <p><strong>Status:</strong> {activeRecord && activeRecord.status}</p>
        </div>

        <div className="doc-viewer">
          <div className="viewer-controls">
            {status !== 'streaming' && <button className="btn primary" onClick={startStreaming}>Start Streaming</button>}
            {status === 'streaming' && <button className="btn" onClick={cancelStreaming}>Cancel</button>}
            {status === 'done' && <button className="btn" onClick={() => alert('Open full document (stub)')}>Open Full Document</button>}
            {status === 'cancelled' && <button className="btn" onClick={retry}>Retry</button>}
            <label style={{ marginLeft: 12, fontSize: 13 }}>
              <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} style={{ marginRight: 6 }} />
              Use byte-range loading
            </label>
            <div style={{ display: 'inline-block', marginLeft: 12 }}>
              <label style={{ fontSize: 13 }}>Split: from
                <input id="split-from" type="number" defaultValue={1} style={{ width: 64, marginLeft: 6 }} />
                to <input id="split-to" type="number" defaultValue={3} style={{ width: 64, marginLeft: 6 }} />
                <button className="btn" onClick={() => handleSplit(Number(document.getElementById('split-from').value), Number(document.getElementById('split-to').value))} style={{ marginLeft: 6 }}>Run</button>
              </label>
            </div>

            <div style={{ display: 'inline-block', marginLeft: 12 }}>
              <label style={{ fontSize: 13 }}>Merge with ID:
                 <input id="merge-id" type="number" defaultValue={(activeRecord && activeRecord.id ? activeRecord.id + 1 : (recordId || 0) + 1)} style={{ width: 96, marginLeft: 6 }} />
                <button className="btn" onClick={() => handleMerge(document.getElementById('merge-id').value)} style={{ marginLeft: 6 }}>Merge</button>
              </label>
            </div>
          </div>

          <div className="viewer-progress">
            <div>Progress: {progress.received} / {progress.total}</div>
            <div className="progress-bar-outer">
              <div className="progress-bar-inner" style={{ width: progress.total ? `${(progress.received / progress.total) * 100}%` : '0%' }} />
            </div>
          </div>

          <div className="chunk-list">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>Selected page:
                <input type="number" value={selectedPage || ''} onChange={(e) => setSelectedPage(Number(e.target.value))} style={{ width: 72, marginLeft: 6 }} />
              </label>
              <button className="btn" onClick={() => { if (selectedPage) setPageComments((p) => ({ ...p })) }}>Refresh Comments</button>
            </div>

            <div style={{ marginBottom: 8 }}>
              <strong>Add comment to page:</strong>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Comment text" style={{ flex: 1 }} />
                <button className="btn" onClick={addComment}>Add</button>
              </div>
            </div>

            {chunks.length === 0 && <div className="chunk-item">No thumbnails yet</div>}
            {chunks.map((c) => (
              <div key={c.page} style={{ marginBottom: 8 }}>
                <Thumbnail page={c.page} bitmap={c.bitmap} />
                <div style={{ marginTop: 6 }}>
                  <strong>Comments</strong>
                  <div>
                    {(pageComments[c.page] || []).map(cm => (
                      <div key={cm.id} style={{ fontSize: 12, padding: '4px 0' }}>{cm.text} <span style={{ color: '#6b7280', fontSize: 11 }}>— {new Date(cm.createdAt).toLocaleString()}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function Thumbnail({ page, bitmap }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!bitmap || !ref.current) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    ctx.clearRect(0,0,canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap])

  return (
    <div className="chunk-item">
      <div>Page {page}</div>
      <canvas ref={ref} />
    </div>
  )
}

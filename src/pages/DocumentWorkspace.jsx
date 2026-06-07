import React, { useEffect, useState } from 'react'
import { useRole } from '../contexts/RoleContext'
import { fetchDocument, saveAnnotations, splitDocument, mergeDocument } from '../services/api'
import { pushToast as pushGlobalToast } from '../lib/toastService'

export default function DocumentWorkspace({ record, recordId, onClose, onDocChange }) {
  const { role } = useRole()
  const [recordState, setRecordState] = useState(record || null)
  const [fileUrl, setFileUrl] = useState('/files/sample.pdf')

  const getActiveId = () => (record && record.id) || (recordState && recordState.id) || recordId
  const getActiveName = () => (record && record.name) || (recordState && recordState.name) || (recordId ? `Document ${recordId}` : undefined)

  useEffect(() => {
    let idToFetch = record ? record.id : recordId
    if (!idToFetch) return
    let cancelled = false
    ;(async () => {
      try {
        const meta = await fetchDocument(idToFetch)
        if (cancelled) return
        setRecordState(meta)
        const url = (meta && meta.fileUrl) || '/files/sample.pdf'
        setFileUrl(url)
      } catch (e) {
        pushGlobalToast({ message: `Failed to load document: ${e.message}`, duration: 6000 })
      }
    })()
    return () => { cancelled = true }
  }, [record, recordId])

  // Comments/annotations UI (local-only for demo)
  const [commentText, setCommentText] = useState('')
  const [selectedPage, setSelectedPage] = useState(1)

  const addComment = async () => {
    if (!selectedPage) return
    if (role === 'viewer') {
      pushGlobalToast({ message: 'Insufficient permissions to add comments', duration: 4000 })
      return
    }
    const comment = { id: `c-${Date.now()}`, text: commentText, createdAt: new Date().toISOString() }
    setCommentText('')
    try { await saveAnnotations(getActiveId(), { comments: [comment], page: selectedPage }) } catch (e) { pushGlobalToast({ message: `Failed to save comment: ${e.message}` }) }
  }

  const handleSplit = async (fromPage, toPage) => {
    if (role === 'viewer') {
      pushGlobalToast({ message: 'Insufficient permissions to split documents', duration: 4000 })
      return
    }
    const activeId = getActiveId()
    if (!window.confirm(`Split document ${activeId} pages ${fromPage}-${toPage}?`)) return

    const tempId = -Date.now()
    const newTitle = `${getActiveName() || 'Document'} (split ${fromPage}-${toPage})`
    const temp = { id: tempId, name: newTitle, policyNumber: `POL-temp-${Math.abs(tempId)}`, status: 'Processing', date: new Date().toISOString().split('T')[0] }
    onDocChange && onDocChange('startCreate', { temp })

    try {
      const res = await splitDocument(activeId, fromPage, toPage)
      onDocChange && onDocChange('created', { newId: res.newId })
      pushGlobalToast({ message: `Split created new document id: ${res.newId}`, duration: 6000 })
    } catch (e) {
      onDocChange && onDocChange('failedCreate', { tempId })
      pushGlobalToast({ message: `Split failed: ${e.message}`, duration: 6000 })
    }
  }

  const handleMerge = async (otherId) => {
    if (role === 'viewer') {
      pushGlobalToast({ message: 'Insufficient permissions to merge documents', duration: 4000 })
      return
    }
    const activeId = getActiveId()
    if (!window.confirm(`Merge document ${activeId} with ${otherId}?`)) return

    const tempId = -Date.now()
    const newTitle = `${getActiveName() || 'Document'} + ${otherId}`
    const temp = { id: tempId, name: newTitle, policyNumber: `POL-temp-${Math.abs(tempId)}`, status: 'Merging', date: new Date().toISOString().split('T')[0] }
    onDocChange && onDocChange('startCreate', { temp })

    try {
      const res = await mergeDocument(activeId, Number(otherId))
      onDocChange && onDocChange('created', { newId: res.newId })
      pushGlobalToast({ message: `Merged to new document id: ${res.newId}`, duration: 6000 })
    } catch (e) {
      onDocChange && onDocChange('failedCreate', { tempId })
      pushGlobalToast({ message: `Merge failed: ${e.message}`, duration: 6000 })
    }
  }

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
            <label style={{ marginLeft: 12, fontSize: 13 }}>
              <span style={{ marginRight: 8 }}>Jump to page</span>
              <input type="number" value={selectedPage} min={1} onChange={(e) => setSelectedPage(Number(e.target.value) || 1)} style={{ width: 80 }} />
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

          <div style={{ marginTop: 12, height: 520, border: '1px solid #e6e6e6', borderRadius: 6, overflow: 'hidden' }}>
            <object data={fileUrl} type="application/pdf" width="100%" height="100%">
              <p>PDF preview not available. <a href={fileUrl} target="_blank" rel="noreferrer">Download</a></p>
            </object>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong>Add comment to page:</strong>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Comment text" style={{ flex: 1 }} />
              <button className="btn" onClick={addComment}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

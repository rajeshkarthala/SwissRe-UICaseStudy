import React, { useEffect, useState } from 'react'
import { subscribe as subscribeGlobal, removeToast as removeGlobalToast } from '../lib/toastService'

function ToastItem({ toast, onUndo, onDismiss }) {
  const duration = (toast.meta && toast.meta.duration) || 5000
  const [remaining, setRemaining] = useState(duration)

  useEffect(() => {
    const start = Date.now()
    const iv = setInterval(() => {
      const elapsed = Date.now() - start
      setRemaining(Math.max(0, duration - elapsed))
    }, 200)
    const to = setTimeout(() => {
      onDismiss && onDismiss(toast)
    }, duration)
    return () => { clearInterval(iv); clearTimeout(to) }
  }, [toast, duration, onDismiss])

  const pct = Math.max(0, Math.min(1, remaining / duration))

  return (
    <div className="toast">
      <div className="toast-message">{toast.message}</div>
      <div className="toast-actions">
        {toast.canUndo && <button className="btn-link" onClick={() => onUndo && onUndo(toast)}>Undo</button>}
        <button className="btn" onClick={() => onDismiss && onDismiss(toast)}>Dismiss</button>
      </div>
      <div className="toast-progress" style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

export default function Toasts({ toasts = [], onUndo, onDismiss }) {
  const [global, setGlobal] = useState([])

  useEffect(() => {
    const unsub = subscribeGlobal((items) => setGlobal(items))
    return unsub
  }, [])

  // merge provided toasts (from local containers) with global ones, dedupe by id
  const merged = [...(toasts || []), ...global].reduce((acc, t) => {
    if (!acc.find(x => x.id === t.id)) acc.push(t)
    return acc
  }, [])

  const handleDismiss = (t) => {
    // prefer container dismiss if provided
    if (onDismiss) onDismiss(t)
    removeGlobalToast(t.id)
  }

  return (
    <div className="toasts">
      {merged.map(t => (
        <ToastItem key={t.id} toast={t} onUndo={onUndo} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}

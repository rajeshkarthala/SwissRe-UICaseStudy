// Simple global toast/event service
let listeners = new Set()
let nextId = 1
const active = new Map()

export function subscribe(fn) {
  listeners.add(fn)
  // send current active to new subscriber
  fn(Array.from(active.values()))
  return () => listeners.delete(fn)
}

function notify() {
  const snapshot = Array.from(active.values())
  for (const fn of listeners) fn(snapshot)
}

export function pushToast(toast) {
  const id = toast.id || `g-${Date.now()}-${nextId++}`
  const t = { id, message: toast.message || '', canUndo: !!toast.canUndo, meta: toast.meta || {}, createdAt: Date.now(), duration: toast.duration || 5000 }
  active.set(id, t)
  notify()
  if (t.duration > 0) {
    setTimeout(() => {
      active.delete(id)
      notify()
    }, t.duration)
  }
  return id
}

export function removeToast(id) {
  if (active.delete(id)) notify()
}

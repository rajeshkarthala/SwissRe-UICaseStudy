import React, { useEffect, useMemo, useState, useRef, Suspense, lazy } from 'react'
import DataGrid from './components/DataGrid'
import { fetchRecords, getPermissionsForRole, availableRoles, performAction } from './api/mockApi'
import Toasts from './components/Toasts'
import { BrowserRouter, Routes, Route, Outlet, useNavigate, useParams } from 'react-router-dom'

const DocumentWorkspace = lazy(() => import('./components/DocumentWorkspace'))

function Layout({ children, leftPane }) {
  return (
    <div className="app">
      <header className="hero">
        <h1>SwissRe UI Case Study</h1>
        <p>React + Vite scaffold for the UI case study. The demo below shows a virtualized grid with 20,000 rows plus sorting, filtering, pagination and RBAC controls.</p>
      </header>

      <main className="content layout">
        <div className="left">{leftPane}</div>
        <div className="right">
          {children}
        </div>
      </main>
    </div>
  )
}

function AppContent() {
  const [role, setRole] = useState('viewer')
  const [permissions, setPermissions] = useState({ canView: true, canEdit: false, canDelete: false, canAssign: false })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState([])

  const [sortBy, setSortBy] = useState('id')
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter] = useState('')

  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  // store pending deletes: id -> { timeoutId, previousRows }
  const pendingDeletes = useRef({})
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function loadPerms() {
      try {
        const p = await getPermissionsForRole(role)
        if (!cancelled) setPermissions(p)
      } catch (err) {
        // fallback to conservative defaults
        if (!cancelled) setPermissions({ canView: true, canEdit: false, canDelete: false, canAssign: false })
      }
    }
    loadPerms()
    return () => { cancelled = true }
  }, [role])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      // if user cannot view, clear rows and skip fetch
      if (!permissions || !permissions.canView) {
        if (!cancelled) {
          setRows([])
          setTotal(0)
          setLoading(false)
        }
        return
      }

      const res = await fetchRecords({ page, pageSize, sortBy, sortDir, filter })
      if (!cancelled) {
        setRows(res.data)
        setTotal(res.total)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [page, pageSize, sortBy, sortDir, filter, permissions])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pushToast = (toast) => {
    setToasts((t) => [...t, toast])
  }

  const removeToast = (id) => {
    setToasts((t) => t.filter(x => x.id !== id))
  }

  const handleUndo = (toast) => {
    const { id, meta } = toast
    if (meta && meta.type === 'delete') {
      const pd = pendingDeletes.current[meta.target]
      if (pd) {
        clearTimeout(pd.timeoutId)
        setRows(pd.previousRows)
        delete pendingDeletes.current[meta.target]
      }
    }
    removeToast(id)
  }

  const handleDismissToast = (toast) => {
    removeToast(toast.id)
  }

  const handleAction = async (action, id) => {
    if (action === 'delete') {
      if (!window.confirm(`Delete record ${id}? This action can be undone for a short time.`)) return

      const previous = rows
      let updated = rows.filter(r => r.id !== id)
      setRows(updated)

      const toastId = `t-${Date.now()}-${id}`
      const toast = { id: toastId, message: `Deleted record ${id}`, canUndo: true, meta: { type: 'delete', target: id } }
      pushToast(toast)

      const timeoutId = setTimeout(async () => {
        try {
          await performAction('delete', id)
        } catch (err) {
          setRows(previous)
        }
        delete pendingDeletes.current[id]
        removeToast(toastId)
      }, 5000)

      pendingDeletes.current[id] = { timeoutId, previousRows: previous }
      return
    }

    const previous = rows
    let updated = rows
    if (action === 'assign') updated = rows.map(r => r.id === id ? { ...r, status: 'Assigned' } : r)
    else if (action === 'edit') updated = rows.map(r => r.id === id ? { ...r, status: 'In Review' } : r)

    setRows(updated)

    try {
      await performAction(action, id)
    } catch (err) {
      setRows(previous)
      pushToast({ id: `t-err-${Date.now()}`, message: `Action ${action} failed on ${id}`, canUndo: false })
    }
  }

  // Handler for document workspace operations that create new records
  const handleDocChange = (type, payload) => {
    if (type === 'startCreate') {
      const { temp } = payload
      setRows((r) => [temp, ...r])
      pushToast({ id: `t-temp-${temp.id}`, message: `Creating ${temp.name}...`, canUndo: false })
    }

    if (type === 'created') {
      const { newId } = payload
      ;(async () => {
        const res = await fetchRecords({ page: 1, pageSize, sortBy, sortDir, filter })
        setRows(res.data)
        setTotal(res.total)
        const lastPage = Math.max(1, Math.ceil(res.total / pageSize))
        setPage(lastPage)
        const res2 = await fetchRecords({ page: lastPage, pageSize, sortBy, sortDir, filter })
        setRows(res2.data)
        const found = res2.data.find(r => r.id === newId)
        if (found) navigate(`/documents/${found.id}`)
        pushToast({ id: `t-created-${newId}`, message: `Created document ${newId}`, canUndo: false })
      })()
    }

    if (type === 'failedCreate') {
      const { tempId } = payload
      setRows((r) => r.filter(x => x.id !== tempId))
      pushToast({ id: `t-failed-${tempId}`, message: `Creation failed`, canUndo: false })
    }
  }

  // navigate to document route when a row is clicked
  const handleRowClick = (r) => {
    // debug: log row clicks and permission state before navigating
    // eslint-disable-next-line no-console
    console.log('AppContent: handleRowClick', { id: r && r.id, permissions })
    if (permissions && permissions.canView) navigate(`/documents/${r.id}`)
  }

  const leftPane = (
    <>
      <div className="controls">
        <label>Role: 
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <label>Filter:
          <input placeholder="search name, policy, status" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1) }} />
        </label>

        <label>Sort:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="id">ID</option>
            <option value="name">Name</option>
            <option value="policyNumber">Policy #</option>
            <option value="status">Status</option>
            <option value="date">Date</option>
          </select>
          <button className="btn" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>{sortDir}</button>
        </label>

        <label>Page size:
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
        </label>
      </div>

      <div className="grid-area">
        {loading && <div className="loading">Loading...</div>}
        <DataGrid rows={rows} onRowClick={handleRowClick} onAction={handleAction} permissions={permissions} height={520}
          sortBy={sortBy} sortDir={sortDir} onSortChange={(key) => {
            if (key === sortBy) {
              setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
            } else {
              setSortBy(key)
              setSortDir('asc')
            }
            setPage(1)
          }}
        />
      </div>
      <Toasts toasts={toasts} onUndo={handleUndo} onDismiss={handleDismissToast} />

      <div className="pagination">
        <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
        <span>Page {page} / {totalPages} ({total} items)</span>
        <button className="btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
      </div>
    </>
  )

  return (
    <Layout leftPane={leftPane}>
      <Outlet />
    </Layout>
  )
}

function DocRouteWrapper({ onDocChange }) {
  const { id } = useParams()
  // pass recordId to lazy-loaded workspace
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading document...</div>}>
      <DocumentWorkspace recordId={Number(id)} onClose={() => window.history.back()} onDocChange={onDocChange} />
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />}>
          <Route index element={<div style={{ padding: 20 }}>Select a document to open the workspace.</div>} />
          <Route path="documents/:id" element={<DocRouteWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

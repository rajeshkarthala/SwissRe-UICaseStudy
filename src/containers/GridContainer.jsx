import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DataGrid from '../components/DataGrid'
import Toasts from '../components/Toasts'
import { fetchRecords, getPermissionsForRole, availableRoles, performAction } from '../services/api'
import { pushToast as pushGlobalToast } from '../lib/toastService'
import { useRole } from '../contexts/RoleContext'

export default function GridContainer({ onProvideHandlers, height = 520 }) {
  const { role, setRole } = useRole()
  const [permissions, setPermissions] = React.useState({ canView: true, canEdit: false, canDelete: false, canAssign: false })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState([])

  const [sortBy, setSortBy] = useState('id')
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter] = useState('')

  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const pendingDeletes = useRef({})
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function loadPerms() {
      try {
        const p = await getPermissionsForRole(role)
        // enforce role-derived overrides: editor gets edit+delete, admin gets all
        if (role === 'editor') {
          p.canDelete = true
          p.canEdit = true
        }
        if (role === 'admin') {
          p.canDelete = true
          p.canEdit = true
          p.canAssign = true
        }
        if (!cancelled) setPermissions(p)
      } catch (err) {
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
      if (!permissions || !permissions.canView) {
        if (!cancelled) {
          setRows([])
          setTotal(0)
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetchRecords({ page, pageSize, sortBy, sortDir, filter })
        if (!cancelled) {
          setRows(res.data)
          setTotal(res.total)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setRows([])
          setTotal(0)
          setLoading(false)
          pushGlobalToast({ message: `Failed to load records: ${err.message}`, duration: 6000 })
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [page, pageSize, sortBy, sortDir, filter, permissions])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pushToast = (toast) => setToasts((t) => [...t, toast])
  const removeToast = (id) => setToasts((t) => t.filter(x => x.id !== id))

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

  const handleDismissToast = (toast) => removeToast(toast.id)

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
    // edit action navigates to workspace instead of performing server edit
    if (action === 'edit') {
      navigate(`/documents/${id}`)
      return
    }

    const previous = rows
    let updated = rows
    if (action === 'assign') updated = rows.map(r => r.id === id ? { ...r, status: 'Assigned' } : r)

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
        try {
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
        } catch (err) {
          pushGlobalToast({ message: `Failed to refresh after create: ${err.message}`, duration: 6000 })
        }
      })()
    }

    if (type === 'failedCreate') {
      const { tempId } = payload
      setRows((r) => r.filter(x => x.id !== tempId))
      pushToast({ id: `t-failed-${tempId}`, message: `Creation failed`, canUndo: false })
    }
  }

  // expose document handlers upward so the DocumentWorkspace can call them
  useEffect(() => {
    if (typeof onProvideHandlers === 'function') onProvideHandlers({ onDocChange: handleDocChange })
  }, [onProvideHandlers, rows, page, pageSize, sortBy, sortDir, filter])

  const handleRowClick = (r) => {
    if (permissions && permissions.canView) navigate(`/documents/${r.id}`)
  }

  return (
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
          <select value={sortBy} onChange={(e) => {
            const key = e.target.value
            if (key === sortBy) {
              setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
            } else {
              setSortBy(key)
              setSortDir('asc')
            }
            setPage(1)
          }}>
            <option value="id">ID</option>
            <option value="name">Name</option>
            <option value="policyNumber">Policy #</option>
            <option value="status">Status</option>
            <option value="date">Date</option>
          </select>
          <button className="btn" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>{sortDir}</button>
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
        <DataGrid rows={rows} onRowClick={handleRowClick} onAction={handleAction} permissions={permissions} height={height}
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
}

import React from 'react'
import { FixedSizeList as List } from 'react-window'

function Row({ index, style, data }) {
  const { rows, onRowClick, onAction, permissions } = data
  const row = rows[index]

  const handleAction = (action, e) => {
    e.stopPropagation()
    onAction && onAction(action, row.id)
  }

  return (
    <div
      className={`grid-row ${index % 2 ? 'odd' : 'even'}`}
      style={{ ...style, cursor: permissions.canView ? 'pointer' : 'default' }}
      onClick={() => {
        // log for debugging click/navigation issues
        // eslint-disable-next-line no-console
        console.log('DataGrid: row clicked', { id: row && row.id, canView: permissions && permissions.canView })
        permissions.canView && onRowClick && onRowClick(row)
      }}
    >
      <div className="cell id">{row.id}</div>
      <div className="cell name">{row.name}</div>
      <div className="cell policy">{row.policyNumber}</div>
      <div className="cell status">{row.status}</div>
      <div className="cell date">{row.date}</div>
      <div className="cell actions">
        <button className={`btn-link ${!permissions.canEdit ? 'disabled' : ''}`} disabled={!permissions.canEdit} onClick={(e) => handleAction('edit', e)}>Edit</button>
        <button className={`btn-link ${!permissions.canDelete ? 'disabled' : ''}`} disabled={!permissions.canDelete} onClick={(e) => handleAction('delete', e)}>Delete</button>
        <button className={`btn-link ${!permissions.canAssign ? 'disabled' : ''}`} disabled={!permissions.canAssign} onClick={(e) => handleAction('assign', e)}>Assign</button>
      </div>
    </div>
  )
}

export default function DataGrid({ rows = [], height = 600, rowHeight = 48, onRowClick, onAction, permissions = {}, sortBy, sortDir, onSortChange }) {
  const itemData = { rows, onRowClick, onAction, permissions }

  const headerCell = (key, label) => {
    const active = sortBy === key
    const dir = active ? sortDir : undefined
    const handleKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSortChange && onSortChange(key)
      }
    }
    return (
      <div
        className={`cell ${key}`}
        role="button"
        tabIndex={0}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => onSortChange && onSortChange(key)}
        onKeyDown={handleKey}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span>{label}</span>
        <span className={`sort-indicator ${active ? 'active' : ''}`}>{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </div>
    )
  }

  return (
    <div className="data-grid">
      <div className="grid-header">
        {headerCell('id', '#')}
        {headerCell('name', 'Name')}
        {headerCell('policyNumber', 'Policy #')}
        {headerCell('status', 'Status')}
        {headerCell('date', 'Date')}
        <div className="cell actions">Actions</div>
      </div>

      <List
        height={height}
        itemCount={rows.length}
        itemSize={rowHeight}
        width="100%"
        itemData={itemData}
      >
        {Row}
      </List>
    </div>
  )
}

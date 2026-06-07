#!/usr/bin/env node
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateMockData } from '../src/data/mockData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4000

app.use(express.json())

// simple logger
app.use((req, res, next) => {
  // eslint-disable-next-line no-console
  console.log(`${req.method} ${req.url}`)
  next()
})

// CORS for easy testing from Vite dev server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
  next()
})

app.get('/files/:name', (req, res) => {
  const name = req.params.name
  const filePath = path.join(__dirname, '..', 'public', name)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Not found' })
  }

  const stat = fs.statSync(filePath)
  const total = stat.size
  const range = req.headers.range

  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/)
    if (!m) return res.status(416).json({ message: 'Invalid Range' })
    const start = Number(m[1])
    const end = m[2] ? Number(m[2]) : total - 1
    if (start >= total) {
      res.setHeader('Content-Range', `bytes */${total}`)
      return res.status(416).end()
    }
    const chunkEnd = Math.min(end, total - 1)
    const chunkSize = chunkEnd - start + 1
    const stream = fs.createReadStream(filePath, { start, end: chunkEnd })
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${chunkEnd}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'application/pdf'
    })
    stream.pipe(res)
    return
  }

  // full file
  res.writeHead(200, {
    'Content-Length': total,
    'Content-Type': 'application/pdf'
  })
  fs.createReadStream(filePath).pipe(res)
})

// --- Mock API endpoints (ported from MSW handlers) ---

let DATA = generateMockData(20000)

// health check
app.get('/__health', (req, res) => res.json({ ok: true }))

const DOCUMENTS = {}
for (const r of DATA) {
  DOCUMENTS[r.id] = {
    id: r.id,
    title: r.name,
    pages: 20 + (r.id % 50),
    annotations: {},
    comments: {},
    fileId: 'sample-pdf',
    fileUrl: `http://localhost:${PORT}/files/sample.pdf`
  }
}

const ROLE_PERMISSIONS = {
  viewer: { canView: true, canEdit: false, canDelete: false, canAssign: false },
  editor: { canView: true, canEdit: true, canDelete: false, canAssign: true },
  admin: { canView: true, canEdit: true, canDelete: true, canAssign: true },
}

function applyFilter(items, q) {
  if (!q) return items
  const s = q.toLowerCase()
  return items.filter((r) => r.name.toLowerCase().includes(s) || r.policyNumber.toLowerCase().includes(s) || (r.status && r.status.toLowerCase().includes(s)))
}

function applySort(items, sortBy, sortDir) {
  const copy = items.slice()
  copy.sort((a, b) => {
    let av = a[sortBy]
    let bv = b[sortBy]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })
  return copy
}

app.get('/api/records', (req, res) => {
  const page = Number(req.query.page || '1')
  const pageSize = Number(req.query.pageSize || '100')
  const sortBy = req.query.sortBy || 'id'
  const sortDir = req.query.sortDir || 'asc'
  const filter = req.query.filter || ''

  let items = applyFilter(DATA, filter)
  items = applySort(items, sortBy, sortDir)

  const total = items.length
  const start = (page - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)
  // simulate small delay
  setTimeout(() => res.json({ data: pageItems, total }), 80)
})

app.get('/api/permissions', (req, res) => {
  const role = req.query.role || 'viewer'
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer
  setTimeout(() => res.json(perms), 30)
})

app.get('/api/roles', (req, res) => {
  setTimeout(() => res.json(Object.keys(ROLE_PERMISSIONS)), 30)
})

app.post('/api/action', express.json(), (req, res) => {
  const { action, id } = req.body || {}
  setTimeout(() => {
    if (action === 'delete') {
      DATA = DATA.filter((r) => r.id !== id)
      return res.json({ success: true })
    }
    if (action === 'assign') {
      DATA = DATA.map((r) => r.id === id ? { ...r, status: 'Assigned' } : r)
      return res.json({ success: true })
    }
    if (action === 'edit') {
      DATA = DATA.map((r) => r.id === id ? { ...r, status: 'In Review' } : r)
      return res.json({ success: true })
    }
    return res.status(400).json({ success: false, message: 'Unknown action' })
  }, 80)
})

app.get('/api/documents/:id', (req, res) => {
  const id = Number(req.params.id)
  const doc = DOCUMENTS[id]
  if (!doc) return res.status(404).json({ message: 'Not found' })
  setTimeout(() => res.json(doc), 40)
})

app.post('/api/documents/:id/annotations', express.json(), (req, res) => {
  const id = Number(req.params.id)
  const body = req.body || {}
  const { page, annotations, comments } = body
  const doc = DOCUMENTS[id]
  if (!doc) return res.status(404).json({ message: 'Not found' })
  if (annotations) {
    doc.annotations[page] = doc.annotations[page] || []
    doc.annotations[page].push(...annotations)
  }
  if (comments) {
    doc.comments[page] = doc.comments[page] || []
    doc.comments[page].push(...comments)
  }
  res.json({ success: true })
})

app.post('/api/documents/:id/split', express.json(), (req, res) => {
  const id = Number(req.params.id)
  const body = req.body || {}
  const { fromPage = 1, toPage = 1 } = body
  const doc = DOCUMENTS[id]
  if (!doc) return res.status(404).json({ message: 'Not found' })
  const newId = DATA.length + 1
  const newTitle = `${doc.title} (split ${fromPage}-${toPage})`
  const newDoc = { id: newId, title: newTitle, pages: Math.max(1, toPage - fromPage + 1), annotations: {}, comments: {}, fileId: doc.fileId, fileUrl: doc.fileUrl }
  DOCUMENTS[newId] = newDoc
  DATA.push({ id: newId, name: newTitle, policyNumber: `POL-${100000 + newId}`, status: 'Open', date: new Date().toISOString().split('T')[0] })
  res.json({ success: true, newId })
})

app.post('/api/documents/:id/merge', express.json(), (req, res) => {
  const id = Number(req.params.id)
  const body = req.body || {}
  const { otherId } = body
  const doc = DOCUMENTS[id]
  const other = DOCUMENTS[otherId]
  if (!doc || !other) return res.status(404).json({ message: 'Not found' })
  const newId = DATA.length + 1
  const newTitle = `${doc.title} + ${other.title}`
  const newDoc = { id: newId, title: newTitle, pages: doc.pages + other.pages, annotations: {}, comments: {}, fileId: doc.fileId, fileUrl: doc.fileUrl }
  DOCUMENTS[newId] = newDoc
  DATA.push({ id: newId, name: newTitle, policyNumber: `POL-${100000 + newId}`, status: 'Open', date: new Date().toISOString().split('T')[0] })
  res.json({ success: true, newId })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Dev file server listening on http://localhost:${PORT}`)
})

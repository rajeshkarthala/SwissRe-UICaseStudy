import { rest } from 'msw'
import { generateMockData } from '../data/mockData'
import SAMPLE_PDF_BASE64 from './samplePdfBase64'

// Keep an in-memory dataset inside the mock handlers for persistence across requests
let DATA = generateMockData(20000)

// Documents metadata store keyed by document id
const DOCUMENTS = {}
// Initialize DOCUMENTS for each DATA item with a simulated page count
for (const r of DATA) {
  DOCUMENTS[r.id] = {
    id: r.id,
    title: r.name,
    pages: 20 + (r.id % 50), // simulate different page counts
    annotations: {}, // page -> [annotation objects]
    comments: {}, // page -> [comment objects]
    // stable demo file id (would be a server-side identifier in prod)
    fileId: 'sample-pdf',
    fileUrl: '/files/sample.pdf'
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
  return items.filter((r) => r.name.toLowerCase().includes(s) || r.policyNumber.toLowerCase().includes(s) || r.status.toLowerCase().includes(s))
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

export const handlers = [
  // fetch records with server-side filter/sort/pagination
  rest.get('/api/records', (req, res, ctx) => {
    const page = Number(req.url.searchParams.get('page') || '1')
    const pageSize = Number(req.url.searchParams.get('pageSize') || '100')
    const sortBy = req.url.searchParams.get('sortBy') || 'id'
    const sortDir = req.url.searchParams.get('sortDir') || 'asc'
    const filter = req.url.searchParams.get('filter') || ''

    let items = applyFilter(DATA, filter)
    items = applySort(items, sortBy, sortDir)

    const total = items.length
    const start = (page - 1) * pageSize
    const pageItems = items.slice(start, start + pageSize)

    return res(ctx.status(200), ctx.delay(120), ctx.json({ data: pageItems, total }))
  }),

  // serve sample PDF with Range support for in-repo testing
  rest.get('/files/:name', (req, res, ctx) => {
    const name = req.params.name
    if (!name || name !== 'sample.pdf') return res(ctx.status(404), ctx.json({ message: 'Not found' }))

    // decode base64 into Uint8Array
    function base64ToUint8Array(base64) {
      const binary = atob(base64)
      const len = binary.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    }

    const bytes = base64ToUint8Array(SAMPLE_PDF_BASE64)
    const total = bytes.length

    // handle Range header
    const rangeHeader = req.headers.get('range') || req.headers.get('Range')
    if (rangeHeader) {
      // expected format: bytes=start-end
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (!m) {
        return res(ctx.status(416), ctx.json({ message: 'Invalid Range' }))
      }
      const start = Number(m[1])
      const end = m[2] ? Number(m[2]) : Math.min(start + 64 * 1024 - 1, total - 1)
      if (start >= total) return res(ctx.status(416), ctx.json({ message: 'Range Not Satisfiable' }))
      const slice = bytes.slice(start, Math.min(end + 1, total))
      const contentRange = `bytes ${start}-${start + slice.length - 1}/${total}`
      return res(
        ctx.status(206),
        ctx.set('Accept-Ranges', 'bytes'),
        ctx.set('Content-Range', contentRange),
        ctx.set('Content-Length', String(slice.length)),
        ctx.body(slice.buffer)
      )
    }

    // full response
    return res(ctx.status(200), ctx.set('Content-Length', String(total)), ctx.body(bytes.buffer))
  }),

  // return permissions for role
  rest.get('/api/permissions', (req, res, ctx) => {
    const role = req.url.searchParams.get('role') || 'viewer'
    const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer
    return res(ctx.status(200), ctx.delay(30), ctx.json(perms))
  }),

  rest.get('/api/roles', (req, res, ctx) => {
    return res(ctx.status(200), ctx.delay(30), ctx.json(Object.keys(ROLE_PERMISSIONS)))
  }),

  // perform action (edit/assign/delete)
  rest.post('/api/action', async (req, res, ctx) => {
    const body = await req.json()
    const { action, id } = body || {}

    // simulate small delay
    await new Promise((r) => setTimeout(r, 80))

    if (action === 'delete') {
      DATA = DATA.filter((r) => r.id !== id)
      return res(ctx.status(200), ctx.json({ success: true }))
    }

    if (action === 'assign') {
      DATA = DATA.map((r) => r.id === id ? { ...r, status: 'Assigned' } : r)
      return res(ctx.status(200), ctx.json({ success: true }))
    }

    if (action === 'edit') {
      DATA = DATA.map((r) => r.id === id ? { ...r, status: 'In Review' } : r)
      return res(ctx.status(200), ctx.json({ success: true }))
    }

    return res(ctx.status(400), ctx.json({ success: false, message: 'Unknown action' }))
  }),

  // fetch document metadata
  rest.get('/api/documents/:id', (req, res, ctx) => {
    const id = Number(req.params.id)
    const doc = DOCUMENTS[id]
    if (!doc) return res(ctx.status(404), ctx.json({ message: 'Not found' }))
    return res(ctx.status(200), ctx.delay(40), ctx.json(doc))
  }),

  // save annotations/comments
  rest.post('/api/documents/:id/annotations', async (req, res, ctx) => {
    const id = Number(req.params.id)
    const body = await req.json()
    const { page, annotations, comments } = body || {}
    const doc = DOCUMENTS[id]
    if (!doc) return res(ctx.status(404), ctx.json({ message: 'Not found' }))

    if (annotations) {
      doc.annotations[page] = doc.annotations[page] || []
      doc.annotations[page].push(...annotations)
    }
    if (comments) {
      doc.comments[page] = doc.comments[page] || []
      doc.comments[page].push(...comments)
    }

    return res(ctx.status(200), ctx.json({ success: true }))
  }),

  // split document: create a new document entry for the selected page range
  rest.post('/api/documents/:id/split', async (req, res, ctx) => {
    const id = Number(req.params.id)
    const body = await req.json()
    const { fromPage = 1, toPage = 1 } = body || {}
    const doc = DOCUMENTS[id]
    if (!doc) return res(ctx.status(404), ctx.json({ message: 'Not found' }))

    const newId = DATA.length + 1
    const newTitle = `${doc.title} (split ${fromPage}-${toPage})`
    const newDoc = { id: newId, title: newTitle, pages: Math.max(1, toPage - fromPage + 1), annotations: {}, comments: {} }
    DOCUMENTS[newId] = newDoc
    // add to DATA as a new record so it appears in the grid
    DATA.push({ id: newId, name: newTitle, policyNumber: `POL-${100000 + newId}`, status: 'Open', date: new Date().toISOString().split('T')[0] })

    return res(ctx.status(200), ctx.json({ success: true, newId }))
  }),

  // merge: simple combine pages counts and create new doc
  rest.post('/api/documents/:id/merge', async (req, res, ctx) => {
    const id = Number(req.params.id)
    const body = await req.json()
    const { otherId } = body || {}
    const doc = DOCUMENTS[id]
    const other = DOCUMENTS[otherId]
    if (!doc || !other) return res(ctx.status(404), ctx.json({ message: 'Not found' }))

    const newId = DATA.length + 1
    const newTitle = `${doc.title} + ${other.title}`
    const newDoc = { id: newId, title: newTitle, pages: doc.pages + other.pages, annotations: {}, comments: {} }
    DOCUMENTS[newId] = newDoc
    DATA.push({ id: newId, name: newTitle, policyNumber: `POL-${100000 + newId}`, status: 'Open', date: new Date().toISOString().split('T')[0] })

    return res(ctx.status(200), ctx.json({ success: true, newId }))
  }),
]

// Formerly src/api/mockApi.js — moved to services for better structure
// Exports: fetchRecords, getPermissionsForRole, performAction, availableRoles,
// fetchDocument, saveAnnotations, splitDocument, mergeDocument, editDocument

// Switch to using fetch to talk to the dev server endpoints.
async function parseJsonOrThrow(res) {
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`Failed to parse JSON response (status ${res.status}): ${e.message}`)
    }
  }

  // If we received HTML (likely the dev server's index.html), surface a
  // helpful error instead of attempting to import a non-existent MSW file.
  const snippet = text.slice(0, 512)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && /<!doctype html/i.test(text)) {
    throw new Error(`Unexpected HTML response while fetching ${res.url} (status ${res.status}): ${snippet}\n` +
      `This usually means the dev API/file server did not handle the request. Ensure your Express dev server is running and Vite's proxy is configured.`)
  }

  // not JSON — surface the start of the body to help debugging (likely HTML index page)
  throw new Error(`Unexpected response type (status ${res.status}): ${snippet}`)
}

export async function fetchRecords(options = {}) {
  const { page = 1, pageSize = 100, sortBy = 'id', sortDir = 'asc', filter = '' } = options
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortDir, filter })
  const res = await fetch(`/api/records?${params.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch records (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

export async function getPermissionsForRole(role = 'viewer') {
  const res = await fetch(`/api/permissions?role=${encodeURIComponent(role)}`)
  if (!res.ok) return { canView: true }
  return await parseJsonOrThrow(res)
}

export async function performAction(action, id) {
  const res = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, id }) })
  if (!res.ok) throw new Error(`Action failed (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

export const availableRoles = ['viewer', 'editor', 'admin']

export async function fetchDocument(id) {
  const res = await fetch(`/api/documents/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch document (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

export async function saveAnnotations(id, payload) {
  const res = await fetch(`/api/documents/${id}/annotations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(`Failed to save annotations (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

export async function splitDocument(id, fromPage, toPage) {
  const res = await fetch(`/api/documents/${id}/split`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fromPage, toPage }) })
  if (!res.ok) throw new Error(`Split failed (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

export async function mergeDocument(id, otherId) {
  const res = await fetch(`/api/documents/${id}/merge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ otherId }) })
  if (!res.ok) throw new Error(`Merge failed (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

export async function editDocument(id, payload) {
  // naive: update metadata via annotations endpoint for demo
  const res = await fetch(`/api/documents/${id}/annotations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metadata: payload }) })
  if (!res.ok) throw new Error(`Edit failed (status ${res.status})`)
  return await parseJsonOrThrow(res)
}

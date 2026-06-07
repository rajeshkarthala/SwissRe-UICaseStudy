import React, { useState, Suspense, lazy } from 'react'
import GridContainer from './containers/GridContainer'
import { BrowserRouter, Routes, Route, Outlet, useNavigate, useParams, useLocation, useOutletContext } from 'react-router-dom'

const DocumentWorkspace = lazy(() => import('./pages/DocumentWorkspace'))

function Layout({ children, leftPane, fullLeft }) {
  return (
    <div className="app">
      <header className="hero">
        <h1>SwissRe UI Case Study</h1>
        <p>The demo below shows a virtualized grid with 20,000 rows plus sorting, filtering, pagination and RBAC controls.</p>
      </header>

      <main className={`content layout ${!leftPane ? 'single' : ''} ${fullLeft ? 'full-left' : ''}`}>
        <div className="left">{leftPane}</div>
        <div className="right">
          {children}
        </div>
      </main>
    </div>
  )
}

function AppContent() {
  const [docHandlers, setDocHandlers] = useState({})
  const location = useLocation()
  const isWorkspaceRoute = location.pathname && location.pathname.startsWith('/documents')
  const isRoot = location.pathname === '/'

  const leftPane = isWorkspaceRoute ? null : (
    <GridContainer onProvideHandlers={setDocHandlers} height={520} />
  )

  return (
    <Layout leftPane={leftPane} fullLeft={isRoot}>
      <Outlet context={{ onDocChange: (docHandlers && docHandlers.onDocChange) || (() => {}) }} />
    </Layout>
  )
}

function DocRouteWrapper() {
  const { id } = useParams()
  // pass recordId to lazy-loaded workspace
  const { onDocChange } = useOutletContext()
  const navigate = useNavigate()
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading document...</div>}>
      <DocumentWorkspace recordId={Number(id)} onClose={() => navigate('/')} onDocChange={onDocChange} />
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppContent />}>
          <Route index element={<></>} />
          <Route path="documents/:id" element={<DocRouteWrapper />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

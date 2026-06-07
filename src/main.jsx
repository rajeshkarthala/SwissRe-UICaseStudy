import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'
import ErrorBoundary from './components/ErrorBoundary'
import Toasts from './components/Toasts'
import { RoleProvider } from './contexts/RoleContext'

async function init() {
  // MSW startup removed: using Express dev server for API + file Range testing

  const root = createRoot(document.getElementById('root'))
  root.render(
    <React.StrictMode>
      <RoleProvider>
        <ErrorBoundary>
          <App />
          <Toasts />
        </ErrorBoundary>
      </RoleProvider>
    </React.StrictMode>
  )
}

init()

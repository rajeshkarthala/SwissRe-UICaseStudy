import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

async function init() {
  if (import.meta.env.DEV) {
    try {
      const { startWorker } = await import('./mocks/browser')
      await startWorker()
      // eslint-disable-next-line no-console
      console.log('MSW worker started')
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to start MSW worker', e)
    }
  }

  const root = createRoot(document.getElementById('root'))
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

init()

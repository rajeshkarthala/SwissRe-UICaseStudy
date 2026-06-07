import React from 'react'
import { pushToast } from '../lib/toastService'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // report error via global toast for visibility
    try { pushToast({ message: `Unexpected error: ${error.message}`, duration: 10000 }) } catch (e) { /* ignore */ }
    // eslint-disable-next-line no-console
    console.error('Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Something went wrong.</h2>
          <p>We logged the error — try refreshing the page or return to the list.</p>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

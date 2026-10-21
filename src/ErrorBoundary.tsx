import { Component } from 'react'
import type { ReactNode } from 'react'

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="menu" role="alert">
      <div className="menu-card">
        <h1 style={{ fontSize: 30 }}>{title}</h1>
        <div className="panel" style={{ textAlign: 'left', lineHeight: 1.5 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** Shows a readable message (instead of a blank page) if rendering crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('Game crashed:', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Notice title="Something went wrong">
        <p>The game hit an unexpected error: {this.state.error.message}</p>
        <p>Your saved progress is kept in this browser. Reload the page to continue.</p>
        <button className="primary" onClick={() => location.reload()}>Reload</button>
      </Notice>
    )
  }
}

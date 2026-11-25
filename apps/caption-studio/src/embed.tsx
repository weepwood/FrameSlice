import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './editor-layout.css'

/**
 * Standalone React island, mounted within the FrameSlice Vue workspace.
 * No iframe, navigation, or duplicated global navigation is needed.
 */
export function mountCaptionWorkspace(container: HTMLElement): () => void {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <App embedded />
    </React.StrictMode>,
  )
  return () => root.unmount()
}

import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Fullscreen overlays must be portaled to `document.body`. Otherwise `position: fixed`
 * + z-index stay trapped under ancestors like timeline blocks (`z-10`/`motion`) and
 * the “now” line (`z-20`). Keep below ColorPicker (`z-[9998]`).
 */
export const APP_OVERLAY_Z = 'z-[1000]'

export function portalToBody(children: ReactNode) {
  return createPortal(children, document.body)
}

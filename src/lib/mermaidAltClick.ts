/**
 * mermaidAltClick.ts
 *
 * CodeMirror extension that provides:
 * 1. A hover tooltip showing "⌥ click to open docs" when hovering
 *    over a token that has a reference entry.
 * 2. Alt+click handler that fires onAltClick(TokenRef) to open the
 *    docs panel scrolled to the right element.
 */

import { hoverTooltip, EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { lookupTokenAt, type TokenRef } from './mermaidTokenLookup'

export function mermaidAltClickExtension(
  onAltClick: (ref: TokenRef) => void,
  isDark: boolean,
): Extension {
  // 1. Hover tooltip — only shows the hint text, not a full docs preview
  const hover = hoverTooltip((view, pos) => {
    const ref = lookupTokenAt(view.state, pos)
    if (!ref) return null

    return {
      pos,
      above: true,
      strictSide: false,
      arrow: false,
      create() {
        const dom = document.createElement('div')
        // Styles live in index.css as .cm-mermaid-ref-tooltip[data-dark] / [data-light]
        dom.className = 'cm-mermaid-ref-tooltip'
        dom.dataset.theme = isDark ? 'dark' : 'light'

        const kbd = document.createElement('kbd')
        kbd.className = 'cm-mermaid-ref-kbd'
        kbd.textContent = '⌥ click'

        const label = document.createElement('span')
        label.textContent = `→ ${ref.elementName}`

        dom.appendChild(kbd)
        dom.appendChild(label)
        return { dom }
      },
    }
  }, { hoverTime: 300, hideOn: () => false })

  // 2. Alt+click handler
  const clickHandler = EditorView.domEventHandlers({
    click(event, view) {
      if (!event.altKey) return false

      const coords = { x: event.clientX, y: event.clientY }
      const pos = view.posAtCoords(coords)
      if (pos == null) return false

      const ref = lookupTokenAt(view.state, pos)
      if (!ref) return false

      event.preventDefault()
      event.stopPropagation()
      onAltClick(ref)
      return true
    },
  })

  // 3. Cursor style — show pointer+alt icon when alt is held
  const cursorStyle = EditorView.domEventHandlers({
    keydown(event, view) {
      if (event.key === 'Alt') {
        view.dom.style.cursor = 'alias'
      }
      return false
    },
    keyup(event, view) {
      if (event.key === 'Alt') {
        view.dom.style.cursor = ''
      }
      return false
    },
    blur(_event, view) {
      view.dom.style.cursor = ''
      return false
    },
  })

  return [hover, clickHandler, cursorStyle]
}

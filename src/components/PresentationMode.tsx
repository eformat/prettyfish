import { useEffect, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'

/**
 * Standalone presentation view — renders a base64-encoded SVG full-screen
 * with pinch-to-zoom. Opened in a new tab via window.open().
 * URL format: /present#<base64-encoded-svg>
 */
export function PresentationMode() {
  const [svg, setSvg] = useState<string | null>(null)
  const [bg, setBg] = useState('#ffffff')

  useEffect(() => {
    try {
      const hash = window.location.hash.slice(1)
      if (!hash) return
      const data = JSON.parse(atob(hash))
      setSvg(data.svg)
      if (data.bg) setBg(data.bg)
      // Set page title
      document.title = data.title ? `${data.title} — Pretty Fish` : 'Pretty Fish — Presentation'
    } catch {
      // fallback: treat hash as raw base64 SVG
      try {
        setSvg(atob(window.location.hash.slice(1)))
      } catch {
        /* ignore */
      }
    }
  }, [])

  if (!svg) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100vw', height: '100vh', fontFamily: 'system-ui',
        color: '#888', fontSize: '14px',
      }}>
        No diagram to display
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: bg, touchAction: 'none',
    }}>
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        centerOnInit
        wheel={{ step: 0.08 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: 'reset' }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            dangerouslySetInnerHTML={{ __html: svg }}
            style={{ padding: '10vh 10vw' }}
          />
        </TransformComponent>
      </TransformWrapper>

      {/* Exit hint — fades out after 3 seconds */}
      <ExitHint />
    </div>
  )
}

function ExitHint() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '8px 16px',
      borderRadius: '8px', fontSize: '12px', fontFamily: 'system-ui',
      opacity: visible ? 1 : 0, transition: 'opacity 0.5s',
      pointerEvents: 'none',
    }}>
      Double-click to reset zoom · Close tab to exit
    </div>
  )
}

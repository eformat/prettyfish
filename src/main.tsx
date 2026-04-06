import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import App from './App.tsx'
import { PresentationMode } from './components/PresentationMode.tsx'
import { ReloadPrompt } from './components/ReloadPrompt.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

posthog.init('phc_uJGijY8E6V8Wge3PddD2bs6zKkK89hegJAaYVxgMYGW9', {
  api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  defaults: '2026-01-30',
})

const isPresentation = window.location.pathname.endsWith('/present')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPresentation ? (
      <PresentationMode />
    ) : (
      <TooltipProvider>
        <App />
        <ReloadPrompt />
      </TooltipProvider>
    )}
  </StrictMode>,
)

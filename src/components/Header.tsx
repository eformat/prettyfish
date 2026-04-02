import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  SidebarSimple,
  CodeSimple,
  ShareNetwork,
  SunHorizon,
  Moon,
  Question,
  Check,
  X,
  CaretDown,
  Books,
  CaretUpDown,
  PencilSimple,
  TrashSimple,
  Plus,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { copyShareUrl } from '../lib/share'
import { ExportPopover } from './ExportPopover'
import type { AppMode, AppState, MermaidTheme, DiagramPage } from '../types'
import { MERMAID_THEMES } from '../types'
import { CUSTOM_THEME_PRESETS } from '@/lib/themePresets'
import { detectDiagramType, type DiagramType } from '@/lib/detectDiagram'

/** Color swatches for theme preview — [primary, secondary, accent/line] */
const THEME_SWATCHES: Record<string, [string, string, string]> = {
  default: ['#4f46e5', '#eef2ff', '#6b7280'],
  neutral: ['#6b7280', '#f3f4f6', '#9ca3af'],
  dark: ['#1f2937', '#374151', '#9ca3af'],
  forest: ['#228b22', '#e6f4e6', '#2d8f2d'],
  base: ['#4f46e5', '#ffffff', '#6b7280'],
}
// Derive custom theme swatches from their themeVariables
for (const [key, preset] of Object.entries(CUSTOM_THEME_PRESETS)) {
  const tv = preset.themeVariables
  // For themes like Blueprint where primaryColor is a light fill, use the border color as the swatch
  const primary = (tv.primaryBorderColor && tv.primaryBorderColor !== tv.primaryColor)
    ? tv.primaryBorderColor
    : (tv.primaryColor ?? '#4f46e5')
  const secondary = tv.secondaryBorderColor ?? tv.secondaryColor ?? tv.mainBkg ?? '#eee'
  const tertiary = tv.tertiaryBorderColor ?? tv.lineColor ?? '#888'
  THEME_SWATCHES[key] = [primary, secondary, tertiary]
}

interface HeaderProps {
  mode: AppMode
  mermaidTheme: MermaidTheme
  sidebarOpen: boolean
  docsOpen: boolean
  isMobile?: boolean
  svg: string
  code: string
  previewBg: string
  pageName: string
  getState: () => AppState
  pages: DiagramPage[]
  activePageId: string
  onSelectPage: (id: string) => void
  onAddPage: () => string
  onRenamePage: (id: string, name: string) => void
  onDeletePage: (id: string) => void
  onReorderPages: (from: number, to: number) => void
  onModeChange: (mode: AppMode) => void
  onMermaidThemeChange: (theme: MermaidTheme) => void
  onToggleSidebar: () => void
  onToggleDocs: () => void
  onOpenHelp: () => void
}

export function Header({ pageName,
  mode,
  mermaidTheme,
  sidebarOpen,
  docsOpen,
  isMobile = false,
  svg,
  code,
  previewBg,
  getState,
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
  onReorderPages,
  onModeChange,
  onMermaidThemeChange,
  onToggleSidebar,
  onToggleDocs,
  onOpenHelp,
}: HeaderProps) {
  const isDark = mode === 'dark'
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const handleShare = async () => {
    try {
      await copyShareUrl(getState())
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  const pillClass = cn(
    'pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-xl border',
    isDark
      ? 'bg-[oklch(0.16_0.015_260)]/95 border-white/8'
      : 'bg-white/95 border-black/6',
  )

  return (
    <div className={cn(
      'absolute top-0 left-0 right-0 z-30 flex items-start pointer-events-none',
      isMobile ? 'justify-between px-2 pt-2 gap-1' : 'justify-between px-4 pt-3',
    )}>

      {/* Left: Logo pill */}
      <div className={pillClass}>
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/15">
          <img src="/favicon.svg" alt="" className="w-4 h-4" />
        </div>
        <span className="text-sm tracking-tight pl-0.5">
          <span className="font-semibold">Pretty</span><span className="font-serif italic text-primary ml-0.5">Fish</span>
        </span>
        <span className={cn(
          'text-[10px] font-medium tracking-wider uppercase px-1.5 py-0.5 rounded-full ml-0.5 hidden sm:inline',
          isDark ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary',
        )}>
          Mermaid Diagram Editor
        </span>
      </div>

      {/* Pages dropdown — separate pill after logo */}
      <div className={pillClass}>
        <PagesDropdown
          pages={pages}
          activePageId={activePageId}
          onSelectPage={onSelectPage}
          onAddPage={onAddPage}
          onRenamePage={onRenamePage}
          onDeletePage={onDeletePage}
          onReorderPages={onReorderPages}
          isDark={isDark}
        />
      </div>

      {/* Center: Toolbar pill */}
      <div className={pillClass}>
        {/* Sidebar toggle */}
        <Tooltip>
          <TooltipTrigger>
            <Button
              onClick={onToggleSidebar}
              variant="ghost"
              size="icon-sm"
              className={cn('rounded-lg', sidebarOpen && (isDark ? 'bg-white/8' : 'bg-black/5'))}
            >
              {isMobile
                ? <CodeSimple className="w-3.5 h-3.5" />
                : <SidebarSimple className="w-3.5 h-3.5" />
              }
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{sidebarOpen ? 'Hide' : 'Show'} editor{!isMobile && ' (⌘\\)'}</TooltipContent>
        </Tooltip>

        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-white/8' : 'bg-black/6')} />

        {/* Theme selector — hidden on mobile */}
        <ThemeDropdown
          value={mermaidTheme}
          onChange={onMermaidThemeChange}
          isDark={isDark}
        />

        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-white/8' : 'bg-black/6')} />

        {/* Export — inline popover */}
        <ExportPopover svg={svg} code={code} previewBg={previewBg} isDark={isDark} pageName={pageName} />

        {/* Share */}
        <Tooltip>
          <TooltipTrigger>
            <Button
              onClick={handleShare}
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-2 text-xs gap-1 rounded-lg font-medium',
                copyState === 'copied' && 'text-emerald-500',
                copyState === 'error' && 'text-red-500',
              )}
            >
              {copyState === 'copied' ? <><Check className="w-3 h-3" /> Hooked!</> :
               copyState === 'error' ? <><X className="w-3 h-3" /> Failed</> :
               <><ShareNetwork className="w-3 h-3" /> Share</>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Copy shareable link</TooltipContent>
        </Tooltip>

        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-white/8' : 'bg-black/6')} />

        {/* Dark/light mode */}
        <Tooltip>
          <TooltipTrigger>
            <Button
              onClick={() => onModeChange(isDark ? 'light' : 'dark')}
              variant="ghost"
              size="icon-sm"
              className="rounded-lg"
            >
              {isDark ? <SunHorizon className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isDark ? 'Light mode' : 'Dark mode'} (⌘⇧D)</TooltipContent>
        </Tooltip>

        {/* Docs toggle */}
        <Tooltip>
          <TooltipTrigger>
            <Button
              onClick={onToggleDocs}
              variant="ghost"
              size="icon-sm"
              className={cn('rounded-lg', docsOpen && (isDark ? 'bg-white/8' : 'bg-black/5'))}
            >
              <Books className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reference docs (⌘⇧R)</TooltipContent>
        </Tooltip>

        {/* Help — hidden on mobile */}
        {!isMobile && <Tooltip>
          <TooltipTrigger>
            <Button
              onClick={onOpenHelp}
              variant="ghost"
              size="icon-sm"
              className="rounded-lg"
            >
              <Question className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Shortcuts (?)</TooltipContent>
        </Tooltip>}
      </div>

      {/* Right: spacer to balance logo — hidden on mobile */}
      {!isMobile && <div className="w-[100px]" />}
    </div>
  )
}

// ── Diagram Icon ──────────────────────────────────────────────────────────────

function DiagramIcon({ type, className }: { type: DiagramType; className?: string }) {
  const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  switch (type) {
    case 'flowchart': return (
      <svg viewBox="0 0 24 24" className={className} {...base}>
        <rect x="7" y="1.5" width="10" height="6" rx="1.5" strokeWidth="1.4"/>
        <line x1="12" y1="7.5" x2="12" y2="10.5" strokeWidth="1.4"/>
        <polygon points="12,10.5 7,16 17,16" strokeWidth="1.4" fill="none"/>
        <line x1="7" y1="16" x2="4" y2="16" strokeWidth="1.3"/>
        <line x1="17" y1="16" x2="20" y2="16" strokeWidth="1.3"/>
        <rect x="1" y="16" width="6" height="5.5" rx="1.2" strokeWidth="1.3"/>
        <rect x="17" y="16" width="6" height="5.5" rx="1.2" strokeWidth="1.3"/>
      </svg>
    )
    case 'sequence': return (
      <svg viewBox="0 0 24 24" className={className} {...base}>
        <rect x="2" y="1" width="5" height="4" rx="1" strokeWidth="1.4"/>
        <rect x="17" y="1" width="5" height="4" rx="1" strokeWidth="1.4"/>
        <line x1="4.5" y1="5" x2="4.5" y2="23" strokeWidth="1.1" strokeDasharray="2 1.5"/>
        <line x1="19.5" y1="5" x2="19.5" y2="23" strokeWidth="1.1" strokeDasharray="2 1.5"/>
        <line x1="4.5" y1="9" x2="19.5" y2="9" strokeWidth="1.4"/>
        <polyline points="16.5,7.5 19.5,9 16.5,10.5" strokeWidth="1.3"/>
        <line x1="19.5" y1="14" x2="4.5" y2="14" strokeWidth="1.3" strokeDasharray="2.5 1.5"/>
        <polyline points="7.5,12.5 4.5,14 7.5,15.5" strokeWidth="1.3"/>
      </svg>
    )
    default: return (
      <svg viewBox="0 0 24 24" className={className} {...base}>
        <rect x="4" y="2" width="16" height="20" rx="2" strokeWidth="1.4"/>
        <line x1="8" y1="8" x2="16" y2="8" strokeWidth="1.3"/>
        <line x1="8" y1="12" x2="16" y2="12" strokeWidth="1.3"/>
        <line x1="8" y1="16" x2="13" y2="16" strokeWidth="1.3"/>
      </svg>
    )
  }
}

// ── Pages Dropdown ────────────────────────────────────────────────────────────

function PagesDropdown({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
  onReorderPages,
  isDark,
}: {
  pages: DiagramPage[]
  activePageId: string
  onSelectPage: (id: string) => void
  onAddPage: () => string
  onRenamePage: (id: string, name: string) => void
  onDeletePage: (id: string) => void
  onReorderPages: (from: number, to: number) => void
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const activePage = pages.find(p => p.id === activePageId)

  const startRename = (page: DiagramPage) => {
    setRenamingId(page.id)
    setRenameValue(page.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenamePage(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const handleAddPage = () => {
    onAddPage()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-xs cursor-pointer transition-colors border',
          isDark
            ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/15 text-zinc-200'
            : 'bg-black/4 border-black/10 hover:bg-black/7 hover:border-black/15 text-zinc-700',
          open && (isDark ? 'bg-white/10 border-white/15' : 'bg-black/7 border-black/15'),
        )}
      >
        <DiagramIcon type={detectDiagramType(activePage?.code ?? '')} className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-medium truncate text-sm">{activePage?.name ?? 'Untitled'}</span>
        <CaretUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          'absolute left-0 top-full mt-1.5 z-50 rounded-lg border overflow-hidden animate-fade-up',
          isDark
            ? 'bg-[oklch(0.17_0.018_260)] border-white/12'
            : 'bg-white border-black/10',
        )}
        style={{ boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)' }}>
          <div className="max-h-48 overflow-y-auto custom-scrollbar py-1">
            {pages.map((page, index) => {
              const isActive = page.id === activePageId
              const isRenaming = renamingId === page.id
              const isConfirmDelete = confirmDeleteId === page.id
              const isDragOver = dragOverIndex === index && dragFromIndex !== index
              return (
                <div
                  key={page.id}
                  draggable={!isRenaming && !isConfirmDelete}
                  onDragStart={(e) => {
                    setDragFromIndex(index)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverIndex(index)
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragFromIndex !== null && dragFromIndex !== index) {
                      onReorderPages(dragFromIndex, index)
                    }
                    setDragFromIndex(null)
                    setDragOverIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragFromIndex(null)
                    setDragOverIndex(null)
                  }}
                  className={cn(
                    'group flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors select-none',
                    isRenaming || isConfirmDelete ? 'cursor-default' : 'cursor-grab',
                    isDragOver && (isDark ? 'border-t-2 border-primary/60' : 'border-t-2 border-primary/50'),
                    dragFromIndex === index && 'opacity-40',
                    isActive
                      ? cn('font-medium', isDark ? 'bg-white/10 text-white' : 'bg-primary/8 text-foreground')
                      : cn(isDark ? 'text-zinc-200 hover:bg-white/6 hover:text-white' : 'text-zinc-700 hover:bg-black/4 hover:text-foreground'),
                  )}
                  onClick={() => {
                    if (!isRenaming && !isConfirmDelete) {
                      onSelectPage(page.id)
                      setOpen(false)
                    }
                  }}
                >
                  <DiagramIcon type={detectDiagramType(page.code)} className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />

                  {isConfirmDelete ? (
                    <>
                      <span className={cn('flex-1 text-xs', isDark ? 'text-red-300' : 'text-red-600')}>Delete "{page.name}"?</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); setConfirmDeleteId(null); if (pages.length <= 1) setOpen(false) }}
                        className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors', isDark ? 'bg-red-500/20 hover:bg-red-500/35 text-red-300' : 'bg-red-100 hover:bg-red-200 text-red-600')}
                      >Yes</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                        className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors', isDark ? 'hover:bg-white/8 text-zinc-400' : 'hover:bg-black/5 text-zinc-500')}
                      >No</button>
                    </>
                  ) : isRenaming ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="flex-1 bg-transparent outline-none border-b border-primary text-xs text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate">{page.name}</span>
                  )}

                  {/* Actions — visible on hover */}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(page) }}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <PencilSimple className="w-2.5 h-2.5" />
                      </button>
                      {pages.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(page.id) }}
                          className="p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <TrashSimple className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* New diagram button inside dropdown */}
          <div className="border-t border-border/40 px-1 py-1">
            <button
              onClick={handleAddPage}
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors',
                isDark ? 'text-zinc-400 hover:bg-white/5 hover:text-white' : 'text-zinc-500 hover:bg-black/3 hover:text-foreground',
              )}
            >
              <Plus className="w-3 h-3" />
              <span>New diagram</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Theme Dropdown ────────────────────────────────────────────────────────────

function ThemeDropdown({
  value,
  onChange,
  isDark,
}: {
  value: MermaidTheme
  onChange: (t: MermaidTheme) => void
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = MERMAID_THEMES.find(t => t.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <span className={cn('text-xs font-medium', isDark ? 'text-zinc-500' : 'text-zinc-400')}>
        Theme
      </span>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium cursor-pointer transition-colors',
          isDark
            ? 'bg-white/5 hover:bg-white/10 text-zinc-200'
            : 'bg-black/4 hover:bg-black/7 text-zinc-700',
          open && (isDark ? 'bg-white/10' : 'bg-black/7'),
        )}
      >
        {(() => { const sw = THEME_SWATCHES[value]; return sw ? (
          <span className="flex gap-px shrink-0">
            <span className="w-2 h-2 rounded-full border border-black/10" style={{ background: sw[0] }} />
            <span className="w-2 h-2 rounded-full border border-black/10" style={{ background: sw[1] }} />
          </span>
        ) : null })()}
        {current?.label ?? value}
        <CaretDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {open && (
        <div className={cn(
          'absolute top-full left-0 mt-1.5 z-50 min-w-[120px] rounded-lg border overflow-hidden',
          isDark
            ? 'bg-[oklch(0.17_0.018_260)] border-white/12'
            : 'bg-white border-black/10',
        )}
        style={{ boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)' }}>
          <div className="py-1">
            {/* Built-in themes */}
            <div className={cn('px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-widest', isDark ? 'text-zinc-600' : 'text-zinc-400')}>Built-in</div>
            {MERMAID_THEMES.filter(t => t.group === 'builtin').map((t) => {
              const isActive = t.value === value
              const sw = THEME_SWATCHES[t.value]
              return (
                <button
                  key={t.value}
                  onClick={() => { onChange(t.value); setOpen(false) }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors text-left',
                    isActive
                      ? (isDark ? 'bg-primary/15 text-primary' : 'bg-primary/8 text-primary')
                      : (isDark ? 'text-zinc-100 hover:bg-white/6' : 'text-zinc-700 hover:bg-black/4'),
                  )}
                >
                  {sw && <span className="flex gap-0.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: sw[0] }} />
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: sw[1] }} />
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: sw[2] }} />
                  </span>}
                  <span className="flex-1">{t.label}</span>
                  {isActive && <Check className="w-3 h-3 shrink-0" />}
                </button>
              )
            })}
            {/* Separator */}
            <div className={cn('mx-2 my-1 h-px', isDark ? 'bg-white/8' : 'bg-black/6')} />
            {/* Custom themes */}
            <div className={cn('px-3 pt-0.5 pb-0.5 text-[9px] font-semibold uppercase tracking-widest', isDark ? 'text-zinc-600' : 'text-zinc-400')}>Custom</div>
            {MERMAID_THEMES.filter(t => t.group === 'custom').map((t) => {
              const isActive = t.value === value
              const sw = THEME_SWATCHES[t.value]
              return (
                <button
                  key={t.value}
                  onClick={() => { onChange(t.value); setOpen(false) }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors text-left',
                    isActive
                      ? (isDark ? 'bg-primary/15 text-primary' : 'bg-primary/8 text-primary')
                      : (isDark ? 'text-zinc-100 hover:bg-white/6' : 'text-zinc-700 hover:bg-black/4'),
                  )}
                >
                  {sw && <span className="flex gap-0.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: sw[0] }} />
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: sw[1] }} />
                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: sw[2] }} />
                  </span>}
                  <span className="flex-1">{t.label}</span>
                  {isActive && <Check className="w-3 h-3 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

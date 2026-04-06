import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Diagram, DiagramPage } from '../types'
import { findDiagramById } from '../state/appStore'

export interface UseClipboardOptions {
  pages: DiagramPage[]
  activeDiagram: Diagram | null
  duplicateDiagram: (source: Diagram) => string | undefined
}

export interface ClipboardActions {
  hasCopied: boolean
  setHasCopied: Dispatch<SetStateAction<boolean>>
  copyDiagram: (diagramId: string) => void
  copyActiveDiagram: () => void
  pasteDiagram: () => void
}

export function useClipboard({
  pages,
  activeDiagram,
  duplicateDiagram,
}: UseClipboardOptions): ClipboardActions {
  const [hasCopied, setHasCopied] = useState(false)
  const copiedDiagramRef = useRef<Diagram | null>(null)

  const copyDiagram = useCallback((diagramId: string) => {
    const target = findDiagramById(pages, diagramId)?.diagram
    if (!target) return
    copiedDiagramRef.current = structuredClone(target)
    setHasCopied(true)
  }, [pages])

  const copyActiveDiagram = useCallback(() => {
    if (!activeDiagram) return
    copyDiagram(activeDiagram.id)
  }, [activeDiagram, copyDiagram])

  const pasteDiagram = useCallback(() => {
    const copied = copiedDiagramRef.current
    if (!copied) return
    duplicateDiagram(copied)
  }, [duplicateDiagram])

  return { hasCopied, setHasCopied, copyDiagram, copyActiveDiagram, pasteDiagram }
}

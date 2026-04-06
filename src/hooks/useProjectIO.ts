import { useCallback } from 'react'
import type { Dispatch } from 'react'
import { clearPersistedDocumentState } from '../lib/storage'
import { loadProjectFile, saveProjectFile } from '../lib/file'
import { copyShareUrl } from '../lib/share'
import {
  stripRuntimePagesState,
  withRuntimePagesState,
  type AppState,
  type Diagram,
  type DiagramPage,
} from '../types'
import { findDiagramById, type AppAction } from '../state/appStore'
import type { UndoableDocumentState } from '../state/appStore'

// Strips runtime state from a single diagram for share payloads
function stripSingleDiagram(diagram: Diagram): Diagram {
  const [page] = stripRuntimePagesState([{
    id: 'shared',
    name: 'Shared',
    activeDiagramId: diagram.id,
    diagrams: [diagram],
  }])
  return page!.diagrams[0]!
}

export interface UseProjectIOOptions {
  state: {
    pages: DiagramPage[]
    activePageId: string
    mode: 'light' | 'dark'
    editorLigatures: boolean
    autoFormat: boolean
  }
  activeDiagram: Diagram | null
  dispatch: Dispatch<AppAction>
  clearHistory: () => void
  restoreSnapshot: (snapshot: UndoableDocumentState) => void
  getInitialDocumentState: () => UndoableDocumentState
}

export interface ProjectIOActions {
  getState: () => AppState
  getShareState: () => AppState
  getShareStateForDiagram: (diagramId: string) => AppState
  copyContextShare: (diagramId: string) => Promise<void>
  saveProject: () => void
  loadProject: () => Promise<void>
  resetWorkspace: () => Promise<void>
}

export function useProjectIO({
  state,
  activeDiagram,
  dispatch,
  clearHistory,
  restoreSnapshot,
  getInitialDocumentState,
}: UseProjectIOOptions): ProjectIOActions {
  const getState = useCallback((): AppState => ({
    version: 1,
    pages: stripRuntimePagesState(state.pages),
    activePageId: state.activePageId,
    mode: state.mode,
    editorLigatures: state.editorLigatures,
  }), [state.activePageId, state.editorLigatures, state.mode, state.pages])

  const getShareStateForDiagram = useCallback((diagramId: string): AppState => {
    const source = findDiagramById(state.pages, diagramId)
    if (!source) return getState()

    const sharedPage: DiagramPage = {
      id: source.page.id,
      name: source.page.name,
      diagrams: [stripSingleDiagram(source.diagram)],
      activeDiagramId: source.diagram.id,
    }

    return {
      version: 1,
      pages: [sharedPage],
      activePageId: sharedPage.id,
      mode: state.mode,
      editorLigatures: state.editorLigatures,
    }
  }, [getState, state.editorLigatures, state.mode, state.pages])

  const getShareState = useCallback((): AppState => {
    if (!activeDiagram) return getState()
    return getShareStateForDiagram(activeDiagram.id)
  }, [activeDiagram, getShareStateForDiagram, getState])

  const saveProject = useCallback(() => {
    saveProjectFile(getState())
  }, [getState])

  const loadProject = useCallback(async () => {
    const loaded = await loadProjectFile()
    if (!loaded) return
    clearHistory()
    dispatch({
      type: 'document/restore',
      snapshot: {
        pages: withRuntimePagesState(loaded.pages),
        activePageId: loaded.activePageId,
        mode: loaded.mode,
        editorLigatures: loaded.editorLigatures,
        autoFormat: state.autoFormat,
      },
    })
  }, [clearHistory, dispatch, state.autoFormat])

  const resetWorkspace = useCallback(async () => {
    clearHistory()
    await clearPersistedDocumentState()
    restoreSnapshot(getInitialDocumentState())
  }, [clearHistory, getInitialDocumentState, restoreSnapshot])

  const copyContextShare = useCallback(async (diagramId: string) => {
    await copyShareUrl(getShareStateForDiagram(diagramId))
  }, [getShareStateForDiagram])

  return {
    getState,
    getShareState,
    getShareStateForDiagram,
    copyContextShare,
    saveProject,
    loadProject,
    resetWorkspace,
  }
}

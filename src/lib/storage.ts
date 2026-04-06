import { createStore, del, get, set } from 'idb-keyval'

import type { AppMode, DiagramPage } from '../types'
import { normalizePersistedDocumentState } from './documentState'

const DB_NAME = 'prettyfish-db'
const STORE_NAME = 'app-state'
const SNAPSHOT_KEY = 'document-snapshot'
const CHANNEL_NAME = 'prettyfish-state'

const idbStore = createStore(DB_NAME, STORE_NAME)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null
const originId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `tab-${Math.random().toString(36).slice(2)}`

export interface PersistedDocumentState {
  pages: DiagramPage[]
  activePageId: string
  mode: AppMode
  editorLigatures: boolean
  autoFormat: boolean
}

export interface PersistedSnapshotMessage {
  type: 'document-snapshot'
  originId: string
  snapshot: PersistedDocumentState
}

export async function loadPersistedDocumentState(): Promise<PersistedDocumentState | null> {
  try {
    const snapshot = await get<unknown>(SNAPSHOT_KEY, idbStore)
    const normalized = normalizePersistedDocumentState(snapshot)
    if (!normalized && snapshot != null) {
      await del(SNAPSHOT_KEY, idbStore)
    }
    return normalized
  } catch {
    return null
  }
}

export async function savePersistedDocumentState(snapshot: PersistedDocumentState): Promise<void> {
  try {
    await set(SNAPSHOT_KEY, snapshot, idbStore)
  } catch {
    // Ignore IndexedDB persistence failures
  }
}

export async function clearPersistedDocumentState(): Promise<void> {
  try {
    await del(SNAPSHOT_KEY, idbStore)
  } catch {
    // Ignore IndexedDB persistence failures
  }
}

export function publishPersistedDocumentState(snapshot: PersistedDocumentState): void {
  channel?.postMessage({
    type: 'document-snapshot',
    originId,
    snapshot,
  } satisfies PersistedSnapshotMessage)
}

export function subscribeToPersistedDocumentState(
  onSnapshot: (snapshot: PersistedDocumentState) => void,
): () => void {
  if (!channel) return () => {}

  const handler = (event: MessageEvent<PersistedSnapshotMessage>) => {
    const message = event.data
    if (!message || message.type !== 'document-snapshot') return
    if (message.originId === originId) return
    onSnapshot(message.snapshot)
  }

  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}


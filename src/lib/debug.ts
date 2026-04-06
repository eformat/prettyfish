let pfDebugCounter = 0

function ts() {
  try {
    return new Date().toISOString().split('T')[1]?.replace('Z', '') ?? ''
  } catch {
    return ''
  }
}

export function pfDebug(scope: string, message: string, details?: unknown) {
  if (!import.meta.env.DEV) return
  pfDebugCounter += 1
  const prefix = `[PF_DEBUG #${pfDebugCounter} ${ts()}] [${scope}] ${message}`
  if (details === undefined) {
    console.log(prefix)
  } else {
    console.log(prefix, details)
  }
}

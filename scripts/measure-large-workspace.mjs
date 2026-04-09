import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174/'
const pageCount = Number(process.argv[3] ?? 8)
const diagramsPerPage = Number(process.argv[4] ?? 12)

const outputDir = path.resolve('perf-artifacts')
const tracePath = path.join(outputDir, 'large-workspace-mutate.trace.json')

function buildDiagramCode(pageIndex, diagramIndex) {
  const start = `P${pageIndex + 1}D${diagramIndex + 1}`
  return [
    'flowchart TD',
    `    ${start}Start[Start ${pageIndex + 1}-${diagramIndex + 1}] --> Input[Capture Input ${diagramIndex + 1}]`,
    `    Input --> Check{Valid ${pageIndex + 1}-${diagramIndex + 1}?}`,
    `    Check -->|Yes| Save[Persist ${pageIndex + 1}-${diagramIndex + 1}]`,
    `    Check -->|No| Retry[Retry ${pageIndex + 1}-${diagramIndex + 1}]`,
    '    Save --> Finish[Finish]',
    '    Retry --> Input',
  ].join('\n')
}

function buildSnapshot() {
  const pages = []
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const diagrams = []
    for (let diagramIndex = 0; diagramIndex < diagramsPerPage; diagramIndex += 1) {
      diagrams.push({
        id: `perf-diagram-${pageIndex + 1}-${diagramIndex + 1}`,
        name: `Diagram ${pageIndex + 1}-${diagramIndex + 1}`,
        description: `Synthetic perf diagram ${pageIndex + 1}-${diagramIndex + 1}`,
        code: buildDiagramCode(pageIndex, diagramIndex),
        x: (diagramIndex % 4) * 780,
        y: Math.floor(diagramIndex / 4) * 520,
        width: 640,
        mermaidTheme: 'blueprint',
        configOverrides: {},
      })
    }

    pages.push({
      id: `perf-page-${pageIndex + 1}`,
      name: `Page ${pageIndex + 1}`,
      diagrams,
      activeDiagramId: diagrams[0].id,
    })
  }

  return {
    pages,
    activePageId: pages[0].id,
    mode: 'light',
    editorLigatures: true,
    autoFormat: false,
  }
}

async function seedPersistedSnapshot(page, snapshot) {
  await page.evaluate(async (payload) => {
    localStorage.clear()
    sessionStorage.clear()

    await new Promise((resolve, reject) => {
      const request = indexedDB.open('prettyfish-db')
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('app-state')) {
          db.createObjectStore('app-state')
        }
      }
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('app-state')) {
          db.close()
          resolve()
          return
        }
        const tx = db.transaction('app-state', 'readwrite')
        tx.objectStore('app-state').put(payload, 'document-snapshot')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      }
    })
  }, snapshot)
}

async function installPerfObservers(page) {
  await page.addInitScript(() => {
    window.__workspacePerf = {
      longTasks: [],
      marks: {},
      measures: [],
    }

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__workspacePerf.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        })
      }
    }).observe({ type: 'longtask', buffered: true })
  })
}

async function getPerfState(page) {
  return page.evaluate(() => ({
    longTasks: window.__workspacePerf.longTasks.slice(),
    nav: performance.getEntriesByType('navigation')[0]
      ? {
          domContentLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
          load: performance.getEntriesByType('navigation')[0].loadEventEnd,
          transferSize: performance.getEntriesByType('navigation')[0].transferSize,
        }
      : null,
  }))
}

async function measureAction(page, label, action, settle) {
  const before = await getPerfState(page)
  const startedAt = Date.now()
  await action()
  await settle()
  const durationMs = Date.now() - startedAt
  const after = await getPerfState(page)
  const newLongTasks = after.longTasks.slice(before.longTasks.length)

  return {
    label,
    durationMs,
    longTaskCount: newLongTasks.length,
    longTaskTotalMs: newLongTasks.reduce((sum, task) => sum + task.duration, 0),
    maxLongTaskMs: newLongTasks.reduce((max, task) => Math.max(max, task.duration), 0),
  }
}

async function measureActionWithCdp(page, metricsSession, label, action, settle) {
  const beforeMetrics = normalizeCdpMetrics((await metricsSession.send('Performance.getMetrics')).metrics)
  const summary = await measureAction(page, label, action, settle)
  const afterMetrics = normalizeCdpMetrics((await metricsSession.send('Performance.getMetrics')).metrics)
  return {
    ...summary,
    cdp: summarizeCdpDelta(beforeMetrics, afterMetrics),
  }
}

function normalizeCdpMetrics(metrics) {
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]))
}

function summarizeCdpDelta(before, after) {
  const numericDelta = (name) => {
    const beforeValue = before[name] ?? 0
    const afterValue = after[name] ?? 0
    return Number((afterValue - beforeValue).toFixed(3))
  }

  return {
    scriptDuration: numericDelta('ScriptDuration'),
    layoutDuration: numericDelta('LayoutDuration'),
    recalcStyleDuration: numericDelta('RecalcStyleDuration'),
    taskDuration: numericDelta('TaskDuration'),
    jsHeapUsedSizeDelta: Math.round((after.JSHeapUsedSize ?? 0) - (before.JSHeapUsedSize ?? 0)),
    nodesDelta: Math.round((after.Nodes ?? 0) - (before.Nodes ?? 0)),
  }
}

async function startCdpTrace(page) {
  const cdp = await page.context().newCDPSession(page)
  const tracingComplete = new Promise((resolve) => {
    cdp.once('Tracing.tracingComplete', resolve)
  })

  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,v8.execute,blink.user_timing',
    transferMode: 'ReturnAsStream',
  })

  return {
    cdp,
    async stop() {
      await cdp.send('Tracing.end')
      const { stream } = await tracingComplete
      let trace = ''
      while (true) {
        const chunk = await cdp.send('IO.read', { handle: stream })
        trace += chunk.data
        if (chunk.eof) break
      }
      await cdp.send('IO.close', { handle: stream })
      await fs.mkdir(outputDir, { recursive: true })
      await fs.writeFile(tracePath, trace)
      return tracePath
    },
  }
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const metricsSession = await context.newCDPSession(page)
await metricsSession.send('Performance.enable')

await installPerfObservers(page)
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

const snapshot = buildSnapshot()
await seedPersistedSnapshot(page, snapshot)

const loadStartedAt = Date.now()
await page.reload({ waitUntil: 'load' })
await page.getByTestId('diagram-node').first().waitFor()
await page.waitForTimeout(4000)

const loadPerf = await getPerfState(page)
const loadCdpMetrics = normalizeCdpMetrics((await metricsSession.send('Performance.getMetrics')).metrics)
const initialLongTasks = loadPerf.longTasks

const loadSummary = {
  durationMs: Date.now() - loadStartedAt,
  domContentLoadedMs: loadPerf.nav?.domContentLoaded ?? null,
  loadEventMs: loadPerf.nav?.load ?? null,
  navTransferSize: loadPerf.nav?.transferSize ?? null,
  longTaskCount: initialLongTasks.length,
  longTaskTotalMs: initialLongTasks.reduce((sum, task) => sum + task.duration, 0),
  maxLongTaskMs: initialLongTasks.reduce((max, task) => Math.max(max, task.duration), 0),
  scriptDuration: Number((loadCdpMetrics.ScriptDuration ?? 0).toFixed(3)),
  layoutDuration: Number((loadCdpMetrics.LayoutDuration ?? 0).toFixed(3)),
  recalcStyleDuration: Number((loadCdpMetrics.RecalcStyleDuration ?? 0).toFixed(3)),
  taskDuration: Number((loadCdpMetrics.TaskDuration ?? 0).toFixed(3)),
  jsHeapUsedSize: Math.round(loadCdpMetrics.JSHeapUsedSize ?? 0),
  nodes: Math.round(loadCdpMetrics.Nodes ?? 0),
  pageCount,
  diagramsPerPage,
  totalDiagrams: pageCount * diagramsPerPage,
}

const switchPageSummary = await measureActionWithCdp(
  page,
  metricsSession,
  'switch-page',
  async () => {
    await page.getByTestId('pages-dropdown-trigger').click()
    await page.getByTestId('page-item').last().click()
  },
  async () => {
    await page.getByTestId('pages-dropdown-trigger').waitFor()
    await page.waitForTimeout(1500)
  },
)

const addDiagramSummary = await measureActionWithCdp(
  page,
  metricsSession,
  'add-diagram',
  async () => {
    await page.getByTestId('add-diagram-button').click()
    await page.locator('[data-testid="template-card"][data-template-id="flowchart"]').click()
  },
  async () => {
    await page.waitForFunction(
      (expectedCount) => document.querySelectorAll('[data-testid="diagram-node"]').length === expectedCount,
      pageCount * 0 + diagramsPerPage + 1,
    )
    await page.waitForTimeout(1500)
  },
)

const trace = await startCdpTrace(page)
const mutateDiagramSummary = await measureActionWithCdp(
  page,
  metricsSession,
  'mutate-diagram-code',
  async () => {
    const editor = page.locator('.cm-content').first()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('    Finish --> Archive[Archive]')
  },
  async () => {
    await page.waitForTimeout(2000)
  },
)
const traceFile = await trace.stop()

const summary = {
  baseUrl,
  loadSummary,
  switchPageSummary,
  addDiagramSummary,
  mutateDiagramSummary,
  traceFile,
}

console.log(JSON.stringify(summary, null, 2))

await browser.close()

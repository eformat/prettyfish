import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
const profile = process.argv[3] ?? 'desktop'

const profiles = {
  desktop: {
    cpuThrottlingRate: 1,
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  },
  throttled: {
    cpuThrottlingRate: 4,
    offline: false,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
    latency: 150,
  },
}

const selectedProfile = profiles[profile] ?? profiles.desktop

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const cdp = await page.context().newCDPSession(page)

await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', selectedProfile)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: selectedProfile.cpuThrottlingRate })

await page.addInitScript(() => {
  window.__perf = { lcp: null, cls: 0, longTasks: [], paints: {}, interactionEntries: [] }

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.paints[entry.name] = entry.startTime
    }
  }).observe({ type: 'paint', buffered: true })

  new PerformanceObserver((list) => {
    const entries = list.getEntries()
    const last = entries[entries.length - 1]
    if (last) window.__perf.lcp = last.startTime
  }).observe({ type: 'largest-contentful-paint', buffered: true })

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__perf.cls += entry.value
    }
  }).observe({ type: 'layout-shift', buffered: true })

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.longTasks.push({ start: entry.startTime, duration: entry.duration })
    }
  }).observe({ type: 'longtask', buffered: true })

  if (PerformanceObserver.supportedEntryTypes?.includes('event')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'click' || entry.name === 'keydown' || entry.name === 'pointerdown') {
          window.__perf.interactionEntries.push({
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
          })
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  }
})

const responses = []
page.on('response', async (response) => {
  try {
    const headers = await response.allHeaders()
    const length = Number(headers['content-length'] || 0)
    responses.push({
      url: response.url(),
      status: response.status(),
      resourceType: response.request().resourceType(),
      contentLength: Number.isFinite(length) ? length : 0,
    })
  } catch {
    // ignore response metadata errors
  }
})

const start = Date.now()
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(3000)

const data = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const fcp = window.__perf.paints['first-contentful-paint'] ?? Infinity
  const load = nav?.loadEventEnd ?? Infinity
  const resources = performance.getEntriesByType('resource').map((r) => ({
    name: r.name,
    initiatorType: r.initiatorType,
    transferSize: r.transferSize,
    encodedBodySize: r.encodedBodySize,
    decodedBodySize: r.decodedBodySize,
    duration: r.duration,
    startTime: r.startTime,
    responseEnd: r.responseEnd,
  }))

  const totalBlockingTime = window.__perf.longTasks.reduce((sum, task) => {
    if (task.start < fcp || task.start > load) return sum
    return sum + Math.max(0, task.duration - 50)
  }, 0)

  const criticalResources = resources.filter((r) => r.responseEnd <= fcp)
  const earlyResources = resources.filter((r) => r.responseEnd <= load)

  return {
    perf: window.__perf,
    nav: nav ? {
      responseStart: nav.responseStart,
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      responseEnd: nav.responseEnd,
      transferSize: nav.transferSize,
      encodedBodySize: nav.encodedBodySize,
      decodedBodySize: nav.decodedBodySize,
    } : null,
    resources,
    totalBlockingTime,
    criticalResources,
    earlyResources,
    title: document.title,
  }
})

const topResources = (entries, count = 10) =>
  entries
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, count)

const summary = {
  url,
  profile,
  wallTimeMs: Date.now() - start,
  title: data.title,
  ttfb: data.nav?.responseStart ?? null,
  fp: data.perf.paints['first-paint'] ?? null,
  fcp: data.perf.paints['first-contentful-paint'] ?? null,
  lcp: data.perf.lcp,
  cls: data.perf.cls,
  inpApprox: data.perf.interactionEntries.reduce(
    (max, entry) => Math.max(max, entry.duration),
    0,
  ) || null,
  domContentLoaded: data.nav?.domContentLoaded ?? null,
  load: data.nav?.load ?? null,
  responseEnd: data.nav?.responseEnd ?? null,
  longTaskCount: data.perf.longTasks.length,
  longTaskTotal: data.perf.longTasks.reduce((a, b) => a + b.duration, 0),
  tbt: data.totalBlockingTime,
  transferBeforeFcp: data.criticalResources.reduce((sum, resource) => sum + resource.transferSize, 0),
  jsTransferBeforeFcp: data.criticalResources
    .filter((resource) => resource.initiatorType === 'script')
    .reduce((sum, resource) => sum + resource.transferSize, 0),
  cssTransferBeforeFcp: data.criticalResources
    .filter((resource) => resource.initiatorType === 'link')
    .reduce((sum, resource) => sum + resource.transferSize, 0),
  transferBeforeLoad: data.earlyResources.reduce((sum, resource) => sum + resource.transferSize, 0),
  criticalRequestCount: data.criticalResources.length,
  earlyRequestCount: data.earlyResources.length,
  criticalResources: topResources(data.criticalResources, 12),
  jsResources: topResources(
    data.resources.filter((r) => r.initiatorType === 'script'),
    12,
  ),
  cssResources: topResources(
    data.resources.filter((r) => r.initiatorType === 'link'),
    12,
  ),
  responses: responses
    .filter((r) => ['script', 'stylesheet', 'document'].includes(r.resourceType))
    .sort((a, b) => b.contentLength - a.contentLength)
    .slice(0, 15),
}

console.log(JSON.stringify(summary, null, 2))
await browser.close()

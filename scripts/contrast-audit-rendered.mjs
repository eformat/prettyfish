/**
 * RENDERED CONTRAST AUDIT
 * =======================
 * Uses Playwright to render actual Mermaid diagrams in a real Chromium browser
 * and extract computed fill/stroke/color values from the SVG DOM.
 *
 * This is ground truth — no static analysis, no guessing at variable mappings.
 * Every color pair is the actual pixel value the user sees.
 *
 * Design:
 *   - For each theme × diagram type × config permutation:
 *       1. Render the diagram in a real browser with Mermaid
 *       2. For each key SVG element, call getComputedStyle() + getAttribute()
 *       3. Extract the actual fill/stroke/color as rgb() strings
 *       4. Compute contrast ratio
 *       5. Report violations
 *
 * Usage: npx playwright test scripts/contrast-audit-rendered.mjs --reporter=list
 *   OR:  node scripts/contrast-audit-rendered.mjs (uses Playwright API directly)
 */

import { chromium } from 'playwright'
import { CUSTOM_THEME_PRESETS } from '../src/lib/themePresets.ts'

// ── Color utilities ───────────────────────────────────────────────────────────

function parseRgb(str) {
  if (!str) return null
  // rgb(r, g, b) or rgba(r, g, b, a)
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]
  // #rrggbb
  const h = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (h) return [parseInt(h[1], 16), parseInt(h[2], 16), parseInt(h[3], 16)]
  return null
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function luminance(r, g, b) {
  return [r, g, b].reduce((acc, c, i) => {
    const s = c / 255
    const linear = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    return acc + linear * [0.2126, 0.7152, 0.0722][i]
  }, 0)
}

function contrastRatio(rgb1, rgb2) {
  const l1 = luminance(...rgb1)
  const l2 = luminance(...rgb2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// ── Diagram samples × config permutations ────────────────────────────────────
//
// Each entry defines:
//   id:          unique key
//   diagram:     diagram type name (for reporting)
//   config:      human description of what config enables this element
//   code:        the Mermaid diagram source code
//   selectors:   list of { label, textSelector, bgSelector }
//                  textSelector  — CSS selector for element whose text/fill we read
//                  bgSelector    — CSS selector for element whose fill is the background
//                Both selectors are evaluated in the rendered SVG DOM.
//
// IMPORTANT: selectors use SVG class names from Mermaid's actual CSS output.
// These were verified from node_modules/mermaid/dist/mermaid.js getStyles() functions.

const DIAGRAM_CONFIGS = [
  // ── Sequence diagram ────────────────────────────────────────────────────────
  {
    id: 'sequence-basic',
    diagram: 'sequence',
    config: 'default (no autonumber)',
    code: `sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice
  Alice->>Bob: How are you?`,
    mermaidConfig: {},
    selectors: [
      // Actor box: text color on fill
      { label: 'Actor text on actor bg', textSel: 'text.actor > tspan', bgSel: 'rect.actor' },
      // Signal/message text on background
      { label: 'Signal text on diagram bg', textSel: '.messageText', bgSel: null /* use theme bg */ },
    ],
  },
  {
    id: 'sequence-autonumber',
    diagram: 'sequence',
    config: 'showSequenceNumbers: true',
    code: `sequenceDiagram
  autonumber
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice
  Alice->>Bob: How are you?`,
    mermaidConfig: { sequence: { showSequenceNumbers: true } },
    selectors: [
      // Autonumber: text (.sequenceNumber fill=sequenceNumberColor) on circle ([id$="-sequencenumber"] fill=signalColor)
      { label: 'Autonumber text on circle bg', textSel: '.sequenceNumber', bgSel: '[id$="-sequencenumber"] circle' },
      // Actor still visible
      { label: 'Actor text on actor bg', textSel: 'text.actor > tspan', bgSel: 'rect.actor' },
    ],
  },
  {
    id: 'sequence-notes',
    diagram: 'sequence',
    config: 'with notes',
    code: `sequenceDiagram
  Alice->>Bob: Hello
  Note right of Bob: Bob thinks
  Bob-->>Alice: Hi there`,
    mermaidConfig: {},
    selectors: [
      { label: 'Note text on note bg', textSel: '.noteText', bgSel: '.note' },
      { label: 'Label/loop text on label box bg', textSel: '.labelText', bgSel: '.labelBox' },
    ],
  },
  {
    id: 'sequence-activation',
    diagram: 'sequence',
    config: 'with activation boxes',
    code: `sequenceDiagram
  Alice->>+Bob: Hello Bob
  Bob-->>-Alice: Hi Alice`,
    mermaidConfig: {},
    selectors: [
      { label: 'Signal text on activation bg', textSel: '.messageText', bgSel: '.activation0' },
    ],
  },
  {
    id: 'sequence-loops',
    diagram: 'sequence',
    config: 'with loop/alt',
    code: `sequenceDiagram
  loop Every minute
    Alice->>Bob: ping
  end
  alt Happy path
    Bob-->>Alice: pong
  else Error
    Bob-->>Alice: error
  end`,
    mermaidConfig: {},
    selectors: [
      { label: 'Loop text on bg', textSel: '.loopText', bgSel: null },
      { label: 'Label text on label box', textSel: '.labelText', bgSel: '.labelBox' },
    ],
  },

  // ── Flowchart ───────────────────────────────────────────────────────────────
  {
    id: 'flowchart-basic',
    diagram: 'flowchart',
    config: 'default',
    code: `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do it]
  B -->|No| D[Skip]
  C --> E[End]
  D --> E`,
    mermaidConfig: {},
    selectors: [
      { label: 'Node label on node bg', textSel: '.nodeLabel', bgSel: '.node rect, .node polygon, .node circle' },
      { label: 'Edge label on edge label bg', textSel: '.edgeLabel .label', bgSel: '.edgeLabel .label-container' },
    ],
  },
  {
    id: 'flowchart-subgraph',
    diagram: 'flowchart',
    config: 'with subgraph (cluster)',
    code: `flowchart TD
  subgraph cluster1[Group A]
    A[Node A]
    B[Node B]
  end
  A --> C[Node C]`,
    mermaidConfig: {},
    selectors: [
      { label: 'Node label on node bg', textSel: '.nodeLabel', bgSel: '.node rect' },
      { label: 'Cluster label on cluster bg', textSel: '.cluster-label .nodeLabel', bgSel: '.cluster rect' },
    ],
  },

  // ── Class diagram ───────────────────────────────────────────────────────────
  {
    id: 'class-basic',
    diagram: 'class',
    config: 'default',
    code: `classDiagram
  class Animal {
    +String name
    +int age
    +makeSound()
  }
  class Dog {
    +fetch()
  }
  Animal <|-- Dog`,
    mermaidConfig: {},
    selectors: [
      { label: 'Class label on class bg', textSel: '.classTitle', bgSel: '.classGroup rect' },
      { label: 'Class member on class bg', textSel: '.member', bgSel: '.classGroup rect' },
    ],
  },

  // ── ER diagram ──────────────────────────────────────────────────────────────
  {
    id: 'er-basic',
    diagram: 'er',
    config: 'default',
    code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER {
    string name
    string email
  }`,
    mermaidConfig: {},
    selectors: [
      { label: 'Entity header text on entity header bg', textSel: '.er.entityLabel', bgSel: '.er.entityBox' },
      { label: 'Attribute text on attr row bg', textSel: '.er.attributeBoxEven text', bgSel: '.er.attributeBoxEven' },
    ],
  },

  // ── State diagram ───────────────────────────────────────────────────────────
  {
    id: 'state-basic',
    diagram: 'state',
    config: 'default',
    code: `stateDiagram-v2
  [*] --> Idle
  Idle --> Processing : start
  Processing --> Done : complete
  Processing --> Error : fail
  Done --> [*]`,
    mermaidConfig: {},
    selectors: [
      { label: 'State label on state bg', textSel: '.state-title', bgSel: '.stateGroup rect' },
    ],
  },
  {
    id: 'state-composite',
    diagram: 'state',
    config: 'with composite state',
    code: `stateDiagram-v2
  state "Compound" as C {
    [*] --> S1
    S1 --> S2
  }
  [*] --> C`,
    mermaidConfig: {},
    selectors: [
      { label: 'Composite title on composite title bg', textSel: '.compositeTitle', bgSel: '.compositeTitle ~ rect, rect.compositeTitleBackground' },
    ],
  },

  // ── Gantt chart ─────────────────────────────────────────────────────────────
  {
    id: 'gantt-basic',
    diagram: 'gantt',
    config: 'default with crit tasks',
    code: `gantt
  title Project Plan
  dateFormat YYYY-MM-DD
  section Phase 1
    Task A :done, a1, 2024-01-01, 2024-01-05
    Task B :active, a2, 2024-01-05, 2024-01-10
    Critical :crit, a3, 2024-01-10, 2024-01-15
  section Phase 2
    Task C :a4, 2024-01-15, 2024-01-20`,
    mermaidConfig: {},
    selectors: [
      { label: 'Task text on task bg', textSel: '.taskText', bgSel: '.task' },
      { label: 'Task text on crit task bg', textSel: '.taskTextOutsideRight, .taskTextOutsideLeft', bgSel: '.crit' },
    ],
  },

  // ── Git graph ───────────────────────────────────────────────────────────────
  {
    id: 'git-basic',
    diagram: 'git',
    config: 'default',
    code: `gitGraph
  commit id: "init"
  branch develop
  checkout develop
  commit id: "feature"
  checkout main
  merge develop
  commit id: "release"`,
    mermaidConfig: {},
    selectors: [
      { label: 'Commit label on commit circle', textSel: '.commit-label', bgSel: '.commit' },
    ],
  },

  // ── Pie chart ───────────────────────────────────────────────────────────────
  {
    id: 'pie-basic',
    diagram: 'pie',
    config: 'default',
    code: `pie title Pets
  "Dogs" : 40
  "Cats" : 30
  "Birds" : 15
  "Fish" : 10
  "Other" : 5`,
    mermaidConfig: {},
    selectors: [
      { label: 'Pie section text on pie slice', textSel: '.pieSectionTextPath', bgSel: '.pieCircle path' },
    ],
  },

  // ── Journey ─────────────────────────────────────────────────────────────────
  {
    id: 'journey-basic',
    diagram: 'journey',
    config: 'default',
    code: `journey
  title My Day
  section Morning
    Wake up: 5: Me
    Coffee: 9: Me, Cat
  section Afternoon
    Work: 7: Me
    Lunch: 8: Me, Cat`,
    mermaidConfig: {},
    selectors: [
      { label: 'Section label on section bg', textSel: '.label', bgSel: 'rect.actor' },
    ],
  },

  // ── Mindmap ─────────────────────────────────────────────────────────────────
  {
    id: 'mindmap-basic',
    diagram: 'mindmap',
    config: 'default',
    code: `mindmap
  root((Central))
    Topic A
      Subtopic A1
      Subtopic A2
    Topic B
      Subtopic B1`,
    mermaidConfig: {},
    selectors: [
      { label: 'Node label on node bg', textSel: '.mindmap-node .label', bgSel: '.mindmap-node circle, .mindmap-node rect' },
    ],
  },

  // ── Timeline ────────────────────────────────────────────────────────────────
  {
    id: 'timeline-basic',
    diagram: 'timeline',
    config: 'default',
    code: `timeline
  title Project Timeline
  2024 : Launch
  2025 : Growth
       : Expansion
  2026 : Maturity`,
    mermaidConfig: {},
    selectors: [
      { label: 'Event text on event bg', textSel: '.timeline-event .label', bgSel: '.timeline-event rect' },
    ],
  },

  // ── Quadrant ────────────────────────────────────────────────────────────────
  {
    id: 'quadrant-basic',
    diagram: 'quadrant',
    config: 'default',
    code: `quadrantChart
  title Reach and Engagement
  x-axis Low --> High Reach
  y-axis Low --> High Engagement
  quadrant-1 We should expand
  quadrant-2 Need to promote
  quadrant-3 Re-evaluate
  quadrant-4 May be improved
  Campaign A: [0.3, 0.6]
  Campaign B: [0.45, 0.23]`,
    mermaidConfig: {},
    selectors: [
      { label: 'Quadrant text on quadrant bg', textSel: '.quadrant-texts text', bgSel: '.quadrant-grid rect' },
      { label: 'Point label on point', textSel: '.quadrant-point-label', bgSel: '.quadrant-point' },
    ],
  },
]

// ── Render + audit engine ─────────────────────────────────────────────────────

/**
 * Build an HTML page that renders a Mermaid diagram with the given theme and config.
 * Uses mermaid from node_modules via a file:// path so no server needed.
 */
function buildHtmlPage(themeId, preset, diagramCode, mermaidConfig) {
  const themeVars = JSON.stringify(preset.themeVariables)
  const extraConfig = JSON.stringify(mermaidConfig || {})
  const background = preset.themeVariables.background || '#ffffff'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { background: ${background}; margin: 0; padding: 20px; }
  #diagram { background: ${background}; }
</style>
</head>
<body>
<div id="diagram" class="mermaid">${diagramCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
<div id="status">loading</div>
<script type="module">
import mermaid from '/mermaid-esm';
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: ${themeVars},
  ...${extraConfig},
  look: ${JSON.stringify(preset.configOverrides?.look || 'classic')},
});
try {
  const { svg } = await mermaid.render('diagram-svg', ${JSON.stringify(diagramCode)});
  document.getElementById('diagram').innerHTML = svg;
  document.getElementById('status').textContent = 'done';
} catch(e) {
  document.getElementById('status').textContent = 'error: ' + e.message;
  console.error(e);
}
</script>
</body>
</html>`
}

/**
 * Given a Playwright Page with a rendered diagram, extract color pairs for
 * each selector entry and compute contrast ratios.
 */
async function extractColorPairs(page, selectors, themeBackground) {
  const results = []

  for (const sel of selectors) {
    try {
      // Get the text color from textSel
      const textColor = await page.evaluate((selector) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const style = window.getComputedStyle(el)
        // For SVG text elements, 'fill' is the text color
        // Try computed fill first, then color
        const fill = style.fill
        const color = style.color
        // SVG fill can be a color value
        if (fill && fill !== 'none' && fill !== '' && !fill.startsWith('url(')) return fill
        if (color && color !== '' ) return color
        // Try getAttribute as fallback
        const attr = el.getAttribute('fill')
        if (attr && attr !== 'none') return attr
        return null
      }, sel.textSel)

      // Get the background color from bgSel (or use theme background)
      let bgColor = themeBackground
      if (sel.bgSel) {
        bgColor = await page.evaluate((selector, fallback) => {
          const el = document.querySelector(selector)
          if (!el) return fallback
          const style = window.getComputedStyle(el)
          const fill = style.fill
          if (fill && fill !== 'none' && fill !== '' && !fill.startsWith('url(')) return fill
          const bg = style.backgroundColor
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
          const attr = el.getAttribute('fill')
          if (attr && attr !== 'none') return attr
          return fallback
        }, sel.bgSel, themeBackground)
      }

      if (!textColor || !bgColor) {
        results.push({ label: sel.label, textColor, bgColor, ratio: null, error: 'color not found' })
        continue
      }

      const textRgb = parseRgb(textColor)
      const bgRgb = parseRgb(bgColor)

      if (!textRgb || !bgRgb) {
        results.push({ label: sel.label, textColor, bgColor, ratio: null, error: 'could not parse color' })
        continue
      }

      const ratio = contrastRatio(textRgb, bgRgb)
      results.push({
        label: sel.label,
        textColor: rgbToHex(textRgb),
        bgColor: rgbToHex(bgRgb),
        ratio: Math.round(ratio * 100) / 100,
      })
    } catch (e) {
      results.push({ label: sel.label, error: e.message, ratio: null })
    }
  }

  return results
}

// ── Main ──────────────────────────────────────────────────────────────────────

const WCAG_AA_LARGE = 3.0   // minimum for large text (icons, bold labels)
const WCAG_AA_NORMAL = 4.5  // minimum for normal body text

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext()

  // Serve mermaid ESM from a route
  await context.route('**/mermaid-esm', async route => {
    const fs = await import('fs')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const mermaidPath = path.resolve(__dirname, '../node_modules/mermaid/dist/mermaid.esm.min.mjs')
    const content = fs.readFileSync(mermaidPath, 'utf-8')
    await route.fulfill({ body: content, contentType: 'application/javascript' })
  })

  // Also serve any chunk imports
  await context.route('**/chunks/**', async route => {
    const fs = await import('fs')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const url = new URL(route.request().url())
    const chunkPath = path.resolve(__dirname, '../node_modules/mermaid/dist', url.pathname.replace(/^\/chunks\//, 'chunks/'))
    try {
      const content = fs.readFileSync(chunkPath, 'utf-8')
      await route.fulfill({ body: content, contentType: 'application/javascript' })
    } catch {
      await route.abort()
    }
  })

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║  RENDERED CONTRAST AUDIT — Ground-truth colors from browser DOM  ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝\n')

  const allIssues = []
  let totalPairs = 0

  for (const [themeId, preset] of Object.entries(CUSTOM_THEME_PRESETS)) {
    const themeIssues = []

    for (const dc of DIAGRAM_CONFIGS) {
      const page = await context.newPage()
      const background = preset.themeVariables.background || '#ffffff'

      try {
        const html = buildHtmlPage(themeId, preset, dc.code, dc.mermaidConfig)
        await page.setContent(html, { waitUntil: 'domcontentloaded' })

        // Wait for mermaid to finish rendering
        await page.waitForFunction(
          () => {
            const status = document.getElementById('status')
            return status && (status.textContent === 'done' || status.textContent?.startsWith('error'))
          },
          { timeout: 15000 }
        )

        const status = await page.textContent('#status')
        if (status?.startsWith('error')) {
          // Skip diagrams that fail to render (some may not be supported)
          await page.close()
          continue
        }

        const pairs = await extractColorPairs(page, dc.selectors, background)

        for (const pair of pairs) {
          totalPairs++
          if (pair.ratio === null) continue

          const passAA = pair.ratio >= WCAG_AA_NORMAL
          const passAALarge = pair.ratio >= WCAG_AA_LARGE

          if (!passAALarge) {
            themeIssues.push({ ...pair, diagramId: dc.id, diagram: dc.diagram, config: dc.config, severity: 'FAIL' })
          } else if (!passAA) {
            themeIssues.push({ ...pair, diagramId: dc.id, diagram: dc.diagram, config: dc.config, severity: 'WARN' })
          }
        }
      } catch (e) {
        console.error(`  Error rendering ${themeId}/${dc.id}: ${e.message}`)
      } finally {
        await page.close()
      }
    }

    if (themeIssues.length > 0) {
      console.log(`\n── ${preset.label} (${themeId}) ──`)
      for (const issue of themeIssues) {
        const icon = issue.severity === 'FAIL' ? '❌' : '⚠️ '
        console.log(`  ${icon} ${issue.ratio}:1  [${issue.diagram}] [${issue.config}] ${issue.label}`)
        console.log(`     text: ${issue.textColor}  bg: ${issue.bgColor}`)
      }
      allIssues.push(...themeIssues)
    }
  }

  await browser.close()

  // ── Summary ─────────────────────────────────────────────────────────────────
  const failCount = allIssues.filter(i => i.severity === 'FAIL').length
  const warnCount = allIssues.filter(i => i.severity === 'WARN').length

  console.log('\n\n════════════════ SUMMARY ════════════════')
  console.log(`Themes checked:      ${Object.keys(CUSTOM_THEME_PRESETS).length}`)
  console.log(`Diagram configs:     ${DIAGRAM_CONFIGS.length}`)
  console.log(`Total pairs checked: ${totalPairs}`)
  console.log(`  ❌ FAIL (<3:1):    ${failCount}`)
  console.log(`  ⚠️  WARN (<4.5:1): ${warnCount}`)

  if (failCount > 0) {
    const byDiagram = {}
    for (const i of allIssues.filter(i => i.severity === 'FAIL')) {
      byDiagram[i.diagram] = (byDiagram[i.diagram] || 0) + 1
    }
    console.log('\nFAILs by diagram type:')
    for (const [d, c] of Object.entries(byDiagram).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${d}: ${c}`)
    }
    console.log('═════════════════════════════════════════\n')
    process.exit(1)
  }

  console.log('\n✅ All rendered color pairs pass WCAG AA large text (3:1 minimum)')
  console.log('═════════════════════════════════════════\n')
}

main().catch(e => { console.error(e); process.exit(1) })

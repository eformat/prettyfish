/**
 * Exhaustive contrast audit for all theme presets × all diagram types × all config permutations.
 *
 * Design principles:
 *  1. GENERIC — color pairs are declared as data, not hand-coded per theme.
 *  2. EXHAUSTIVE — every indexed variable group (cScale, git, pie, fillType) is
 *     expanded generically via loops, not selective per-index.
 *  3. CONFIG-AWARE — pairs that only appear under specific config options are
 *     tagged with the config that enables them, so the audit covers all
 *     permutations (e.g. showSequenceNumbers, mirrorActors, Gantt crit tasks).
 *  4. SOURCE-ACCURATE — text/bg pairings are derived from Mermaid's actual
 *     rendering logic (theme-base.d.ts + diagram renderers), not guessed.
 *
 * Usage: npx tsx scripts/contrast-audit.mjs
 */

import { CUSTOM_THEME_PRESETS } from '../src/lib/themePresets.ts'

// ── Color parsing ─────────────────────────────────────────────────────────────

function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function luminance(r, g, b) {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hex1, hex2) {
  const c1 = parseHex(hex1)
  const c2 = parseHex(hex2)
  if (!c1 || !c2) return null
  const l1 = luminance(...c1)
  const l2 = luminance(...c2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// ── Color pair schema ─────────────────────────────────────────────────────────
//
// Each entry in COLOR_PAIR_SCHEMA is:
//   {
//     diagram: string           — diagram type name (for reporting)
//     label:   string           — human description of the pair
//     text:    (v) => string    — function returning the text color from flat vars
//     bg:      (v) => string    — function returning the bg color from flat vars
//     config?: string           — optional: the config key that enables this element
//                                 (e.g. 'showSequenceNumbers'). Used for documentation.
//   }
//
// Variables `v` is the flat themeVariables object for the theme.
// `v.background` is always the canvas color (fallback '#ffffff').

const BG = v => v.background || '#ffffff'

// Helper: expand an indexed variable group generically
// e.g. expandIndexed('pie', 1, 12, text, bg) → 12 pairs for pie1..pie12
function expandIndexed(diagram, prefix, start, end, textFn, bgFn, labelFn, config) {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const idx = start + i
    return {
      diagram,
      label: labelFn ? labelFn(idx) : `${prefix}${idx} text`,
      text: v => textFn(v, idx),
      bg: v => bgFn(v, idx),
      ...(config ? { config } : {}),
    }
  })
}

const COLOR_PAIR_SCHEMA = [

  // ── Flowchart / Graph / Block / Kanban / Mindmap ──────────────────────────
  // All use the same node/edge variables. Mindmap and block share mainBkg/nodeTextColor.
  {
    diagram: 'flowchart',
    label: 'Node text on node bg',
    // nodeTextColor is explicitly set per theme for node labels; falls back to primaryTextColor
    text: v => v.nodeTextColor || v.primaryTextColor,
    bg: v => v.mainBkg || v.primaryColor,
  },
  {
    diagram: 'flowchart',
    label: 'Secondary node text on secondary bg',
    text: v => v.secondaryTextColor,
    bg: v => v.secondaryColor,
  },
  {
    diagram: 'flowchart',
    label: 'Tertiary node text on tertiary bg',
    text: v => v.tertiaryTextColor,
    bg: v => v.tertiaryColor,
  },
  {
    diagram: 'flowchart',
    label: 'Edge label text on edge label bg',
    text: v => v.primaryTextColor,
    bg: v => v.edgeLabelBackground,
  },
  {
    diagram: 'flowchart',
    label: 'Cluster label on cluster bg',
    // Cluster labels use tertiaryTextColor on clusterBkg
    text: v => v.tertiaryTextColor || v.primaryTextColor,
    bg: v => v.clusterBkg || v.secondaryColor,
  },
  {
    diagram: 'flowchart',
    label: 'Title text on background',
    text: v => v.titleColor || v.primaryTextColor,
    bg: BG,
  },

  // ── Sequence diagram ───────────────────────────────────────────────────────
  // Always-visible elements
  {
    diagram: 'sequence',
    label: 'Actor text on actor bg',
    text: v => v.actorTextColor,
    bg: v => v.actorBkg,
  },
  {
    diagram: 'sequence',
    label: 'Signal/message text on background',
    text: v => v.signalTextColor,
    bg: BG,
  },
  {
    diagram: 'sequence',
    label: 'Note text on note bg',
    text: v => v.noteTextColor,
    bg: v => v.noteBkgColor,
  },
  {
    diagram: 'sequence',
    label: 'Loop/alt/opt label text on background',
    text: v => v.loopTextColor,
    bg: BG,
  },
  {
    diagram: 'sequence',
    label: 'Signal text on activation bar bg',
    // Activation bars appear when participants call each other
    text: v => v.signalTextColor,
    bg: v => v.activationBkgColor,
    config: 'activations (default on)',
  },
  // Elements that appear with specific configs
  {
    diagram: 'sequence',
    label: 'Autonumber number text on circle bg (sequenceNumberColor on signalColor)',
    // .sequenceNumber { fill: sequenceNumberColor } = the number text color
    // [id$="-sequencenumber"] { fill: signalColor } = the circle SVG marker fill
    text: v => v.sequenceNumberColor,
    bg: v => v.signalColor,
    config: 'showSequenceNumbers: true',
  },
  {
    diagram: 'sequence',
    label: 'Label box text on label box bg (alt/loop/opt frames)',
    text: v => v.labelTextColor,
    bg: v => v.labelBoxBkgColor,
    config: 'alt/loop/opt/par frames',
  },

  // ── ER Diagram ────────────────────────────────────────────────────────────
  {
    diagram: 'er',
    label: 'Entity header text on primary color bg',
    // ER entity headers: Mermaid uses nodeTextColor (same as flowchart) on primaryColor
    text: v => v.nodeTextColor || v.primaryTextColor,
    bg: v => v.primaryColor,
  },
  {
    diagram: 'er',
    label: 'Attribute text on odd row bg',
    text: v => v.primaryTextColor,
    bg: v => v.attributeBackgroundColorOdd,
  },
  {
    diagram: 'er',
    label: 'Attribute text on even row bg',
    text: v => v.primaryTextColor,
    bg: v => v.attributeBackgroundColorEven,
  },

  // ── State diagram ─────────────────────────────────────────────────────────
  {
    diagram: 'state',
    label: 'State label on state bg',
    text: v => v.stateLabelColor,
    bg: v => v.stateBkg,
  },
  {
    diagram: 'state',
    label: 'Transition label on background',
    text: v => v.transitionLabelColor,
    bg: BG,
  },
  {
    diagram: 'state',
    label: 'Error text on error bg',
    text: v => v.errorTextColor,
    bg: v => v.errorBkgColor,
    config: 'error states',
  },
  {
    diagram: 'state',
    label: 'Composite state title on composite title bg',
    text: v => v.stateLabelColor || v.primaryTextColor,
    bg: v => v.compositeTitleBackground,
    config: 'composite states',
  },
  {
    diagram: 'state',
    label: 'State label on composite background',
    text: v => v.stateLabelColor,
    bg: v => v.compositeBackground,
    config: 'composite states',
  },

  // ── Class diagram ─────────────────────────────────────────────────────────
  // classText is used for all text inside class boxes
  // fillType0-7 are used for class node backgrounds (cycling through classes)
  ...expandIndexed(
    'class', 'fillType', 0, 7,
    (v, i) => v.classText,
    (v, i) => v[`fillType${i}`],
    i => `Class text on fillType${i} bg`,
  ),

  // ── Gantt chart ───────────────────────────────────────────────────────────
  {
    diagram: 'gantt',
    label: 'Section title on section bg',
    text: v => v.titleColor || v.primaryTextColor,
    bg: v => v.sectionBkgColor,
  },
  {
    diagram: 'gantt',
    label: 'Section title on alt section bg',
    text: v => v.titleColor || v.primaryTextColor,
    bg: v => v.altSectionBkgColor,
  },
  {
    diagram: 'gantt',
    label: 'Task text on task bg',
    text: v => v.taskTextColor,
    bg: v => v.taskBkgColor,
  },
  {
    diagram: 'gantt',
    label: 'Task light text on task bg',
    text: v => v.taskTextLightColor,
    bg: v => v.taskBkgColor,
  },
  {
    diagram: 'gantt',
    label: 'Task text on active task bg',
    text: v => v.taskTextColor,
    bg: v => v.activeTaskBkgColor,
    config: 'active tasks',
  },
  {
    diagram: 'gantt',
    label: 'Task dark text on done task bg',
    text: v => v.taskTextDarkColor,
    bg: v => v.doneTaskBkgColor,
    config: 'done tasks',
  },
  {
    diagram: 'gantt',
    label: 'Task text on crit task bg',
    text: v => v.taskTextColor,
    bg: v => v.critBkgColor,
    config: 'crit tasks',
  },

  // ── Git graph ─────────────────────────────────────────────────────────────
  // Branch labels (gitBranchLabel0-7) appear on top of branch commit circles (git0-7)
  ...expandIndexed(
    'git', 'git', 0, 7,
    (v, i) => v[`gitBranchLabel${i}`],
    (v, i) => v[`git${i}`],
    i => `Branch label ${i} on git branch ${i} color`,
  ),

  // ── Pie chart ─────────────────────────────────────────────────────────────
  // pieSectionTextColor is placed on top of each pie slice (pie1-pie12)
  // We check pie1-pie8 (themes define up to pie8; pie9-12 fall back to Mermaid defaults)
  ...expandIndexed(
    'pie', 'pie', 1, 8,
    (v, i) => v.pieSectionTextColor,
    (v, i) => v[`pie${i}`],
    i => `Pie section text on pie slice ${i} bg`,
  ),
  {
    diagram: 'pie',
    label: 'Pie title text on background',
    text: v => v.pieTitleTextColor,
    bg: BG,
  },

  // ── Journey / Timeline / Mindmap ──────────────────────────────────────────
  // These diagram types use cScale0-11 as section/node backgrounds.
  // Mermaid generates cScaleLabel0-11 per slot (falling back to scaleLabelColor).
  // Our themes define per-slot label colors to ensure contrast on every background.
  ...expandIndexed(
    'journey', 'cScale', 0, 11,
    // Use per-slot cScaleLabelN; fall back to scaleLabelColor, then primaryTextColor
    (v, i) => v[`cScaleLabel${i}`] || v.scaleLabelColor || v.primaryTextColor,
    (v, i) => v[`cScale${i}`],
    i => `Section/node label on cScale${i} bg`,
  ),

  // ── Requirement diagram ───────────────────────────────────────────────────
  {
    diagram: 'requirement',
    label: 'Requirement text on requirement bg',
    text: v => v.requirementTextColor,
    bg: v => v.requirementBackground,
  },
  {
    diagram: 'requirement',
    label: 'Relation label on relation label bg',
    text: v => v.relationLabelColor,
    bg: v => v.relationLabelBackground,
  },

  // ── Quadrant chart ────────────────────────────────────────────────────────
  ...([1, 2, 3, 4].map(q => ({
    diagram: 'quadrant',
    label: `Quadrant ${q} text on quadrant ${q} fill`,
    text: v => v[`quadrant${q}TextFill`],
    bg: v => v[`quadrant${q}Fill`],
  }))),
  {
    diagram: 'quadrant',
    label: 'Data point text on point fill',
    text: v => v.quadrantPointTextFill,
    bg: v => v.quadrantPointFill,
  },
  {
    diagram: 'quadrant',
    label: 'X-axis label on background',
    text: v => v.quadrantXAxisTextFill,
    bg: BG,
  },
  {
    diagram: 'quadrant',
    label: 'Y-axis label on background',
    text: v => v.quadrantYAxisTextFill,
    bg: BG,
  },
  {
    diagram: 'quadrant',
    label: 'Chart title on background',
    text: v => v.quadrantTitleFill,
    bg: BG,
  },

  // ── Architecture diagram ──────────────────────────────────────────────────
  {
    diagram: 'architecture',
    label: 'Diagram title on background',
    text: v => v.titleColor || v.primaryTextColor,
    bg: BG,
  },
  // Architecture group labels use titleColor (same as diagram title) on background
  {
    diagram: 'architecture',
    label: 'Group label on background',
    text: v => v.titleColor || v.primaryTextColor,
    bg: BG,
  },

]
// Note: C4 diagrams use personBkg which Mermaid derives internally from primaryColor
// and is not exposed as a themeable variable in our ThemeVariablesByDiagram schema,
// so it is not audited here.

// ── Run audit ─────────────────────────────────────────────────────────────────

const WCAG_AA_NORMAL = 4.5   // required for normal text
const WCAG_AA_LARGE  = 3.0   // required for large text (≥18pt or ≥14pt bold)

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║  CONTRAST AUDIT: All Themes × All Diagrams × All Configs ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')

let totalIssues = 0
let totalPairs  = 0
const issuesByTheme = {}

for (const [themeId, preset] of Object.entries(CUSTOM_THEME_PRESETS)) {
  const vars   = preset.themeVariables
  const issues = []

  for (const pair of COLOR_PAIR_SCHEMA) {
    const textColor = pair.text(vars)
    const bgColor   = pair.bg(vars)

    // Skip if either value is missing/non-hex (e.g. theme doesn't define that var)
    if (!textColor || !bgColor) continue
    if (!parseHex(textColor) || !parseHex(bgColor)) continue

    totalPairs++
    const ratio = contrastRatio(textColor, bgColor)
    if (ratio === null) continue

    const roundedRatio = Math.round(ratio * 100) / 100
    const passAA      = ratio >= WCAG_AA_NORMAL
    const passAALarge = ratio >= WCAG_AA_LARGE

    if (!passAALarge) {
      issues.push({ ...pair, textColor, bgColor, ratio: roundedRatio, severity: 'FAIL' })
    } else if (!passAA) {
      issues.push({ ...pair, textColor, bgColor, ratio: roundedRatio, severity: 'WARN' })
    }
  }

  if (issues.length > 0) {
    issuesByTheme[themeId] = issues
    totalIssues += issues.length

    console.log(`\n── ${preset.label} (${themeId}) ──`)
    for (const issue of issues) {
      const icon       = issue.severity === 'FAIL' ? '❌' : '⚠️ '
      const configNote = issue.config ? `  [config: ${issue.config}]` : ''
      console.log(`  ${icon} ${issue.ratio}:1  [${issue.diagram}] ${issue.label}`)
      console.log(`     text: ${issue.textColor}  bg: ${issue.bgColor}${configNote}`)
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const allIssues = Object.values(issuesByTheme).flat()
const failCount = allIssues.filter(i => i.severity === 'FAIL').length
const warnCount = allIssues.filter(i => i.severity === 'WARN').length

console.log('\n\n════════════════ SUMMARY ════════════════')
console.log(`Themes checked:      ${Object.keys(CUSTOM_THEME_PRESETS).length}`)
console.log(`Pair schemas:        ${COLOR_PAIR_SCHEMA.length}`)
console.log(`Total pairs checked: ${totalPairs}`)
console.log(`Issues found:        ${totalIssues}`)
console.log(`  ❌ FAIL (<3:1):    ${failCount}`)
console.log(`  ⚠️  WARN (<4.5:1): ${warnCount}`)

const clean = Object.keys(CUSTOM_THEME_PRESETS).filter(id => !issuesByTheme[id])
if (clean.length > 0) {
  console.log(`\n✅ Clean themes: ${clean.join(', ')}`)
}

// Break down FAILs by diagram type for actionability
if (failCount > 0) {
  const failsByDiagram = {}
  for (const issue of allIssues.filter(i => i.severity === 'FAIL')) {
    failsByDiagram[issue.diagram] = (failsByDiagram[issue.diagram] || 0) + 1
  }
  console.log('\nFAILs by diagram type:')
  for (const [diag, count] of Object.entries(failsByDiagram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${diag}: ${count}`)
  }
}

console.log('═════════════════════════════════════════\n')

if (failCount > 0) {
  process.exit(1)
}

/**
 * N × M diagram-type matrix integration test.
 *
 * For every diagram type that has both a template *and* reference documentation,
 * this suite verifies the two core operations that must work end-to-end:
 *
 *   1. Adding a new diagram of that type from the template gallery renders a
 *      diagram node on the canvas (not an error state).
 *   2. The reference-docs panel has a tab for that diagram type, shows at
 *      least one expandable element, and an example can be inserted into
 *      the active diagram's editor.
 */

import { test, expect } from '@playwright/test'
import { createApp } from '../support/pretty-fish-app'

// ── diagram types present in BOTH templates and reference docs ───────────────
// `templateId`  — matches `data-template-id` in the template gallery
// `refKey`      — matches `data-reference-type` on the docs tab button
//                 (keys from DIAGRAM_REFS in referenceData.ts)
interface DiagramTypeEntry {
  templateId: string
  refKey: string
}

const DIAGRAM_TYPES: DiagramTypeEntry[] = [
  { templateId: 'flowchart',     refKey: 'flowchart'       },
  { templateId: 'sequence',      refKey: 'sequenceDiagram' },
  { templateId: 'classDiagram',  refKey: 'classDiagram'    },
  { templateId: 'erDiagram',     refKey: 'erDiagram'       },
  { templateId: 'stateDiagram',  refKey: 'stateDiagram'    },
  { templateId: 'gantt',         refKey: 'gantt'           },
  { templateId: 'pie',           refKey: 'pie'             },
  { templateId: 'gitgraph',      refKey: 'gitGraph'        },
  { templateId: 'mindmap',       refKey: 'mindmap'         },
  { templateId: 'timeline',      refKey: 'timeline'        },
  { templateId: 'quadrantChart', refKey: 'quadrantChart'   },
  { templateId: 'xychart',       refKey: 'xychart'         },
  { templateId: 'sankey',        refKey: 'sankey'          },
  { templateId: 'journey',       refKey: 'journey'         },
]

// ── test matrix ──────────────────────────────────────────────────────────────

test.describe('Diagram type matrix', () => {
  // ── Group 1: template gallery → canvas ────────────────────────────────────
  test.describe('Adding a new diagram from the template gallery', () => {
    for (const { templateId } of DIAGRAM_TYPES) {
      test(`${templateId} — creates a rendered diagram node`, async ({ page }) => {
        const app = createApp(page)
        await app.openFresh()

        // Template gallery is visible for the initial empty diagram slot
        await app.templates.shouldBeVisible()
        await page.locator(`[data-testid="template-card"][data-template-id="${templateId}"]`).click()
        await page.waitForTimeout(700)

        // One diagram node must now exist on the canvas
        await expect(page.getByTestId('diagram-node')).toHaveCount(1)

        // That node must not be in an error state
        const hasError = await page.getByTestId('diagram-error-badge').isVisible().catch(() => false)
        expect(hasError, `"${templateId}" rendered with an error`).toBe(false)
      })
    }
  })

  // ── Group 2: reference docs panel ─────────────────────────────────────────
  test.describe('Reference documentation exists for diagram type', () => {
    for (const { templateId, refKey } of DIAGRAM_TYPES) {
      test(`${refKey} — has a docs tab with at least one insertable example`, async ({ page }) => {
        const app = createApp(page)
        await app.openFresh()

        // Create a diagram so the insert-into-editor action has a target
        await app.templates.choose(templateId)
        await expect(page.getByTestId('diagram-node')).toHaveCount(1)

        // Open reference docs
        await app.header.toggleDocs()
        await app.docs.shouldBeVisible()

        // Switch to this diagram type's tab using data-reference-type attribute
        await app.docs.switchTo(refKey)

        // Expand the first reference element to reveal its examples
        await app.docs.expandFirstElement()

        // At least one insert button should now be visible
        const insertButton = page.getByTestId('reference-insert-button').first()
        await expect(insertButton).toBeVisible({ timeout: 5000 })

        // Insert the example — editor should update without crashing
        await app.docs.insertFirstVisibleExample()

        // App root must still be visible (no crash)
        await expect(page.getByTestId('app-root')).toBeVisible()
      })
    }
  })
})

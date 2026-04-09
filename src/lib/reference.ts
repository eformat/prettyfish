import { DIAGRAM_REFS } from './referenceData'
export { DIAGRAM_REFS } from './referenceData'

export interface RefElement {
  name: string
  syntax: string
  description: string
  examples: {
    label: string
    code: string
  }[]
}

export interface DiagramRef {
  id: string
  label: string
  elements: RefElement[]
}

export const GENERIC_REF: DiagramRef = {
  id: 'generic',
  label: 'Diagram',
  elements: [
    {
      name: '%%',
      syntax: '%% comment text',
      description: 'Single-line comment ignored by the parser',
      examples: [
        { label: 'Comment', code: 'flowchart TD\n  %% This is a comment\n  A --> B' },
      ],
    },
  ],
}

export function getRef(diagramType: string): DiagramRef {
  return DIAGRAM_REFS[diagramType] ?? GENERIC_REF
}

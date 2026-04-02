export type DiagramType =
  | 'flowchart'
  | 'sequence'
  | 'gantt'
  | 'classDiagram'
  | 'erDiagram'
  | 'stateDiagram'
  | 'pie'
  | 'gitgraph'
  | 'mindmap'
  | 'timeline'
  | 'quadrant'
  | 'xychart'
  | 'architecture'
  | 'kanban'
  | 'sankey'
  | 'block'
  | 'packet'
  | 'journey'
  | 'requirement'
  | 'radar'
  | 'other'

const PATTERNS: [RegExp, DiagramType][] = [
  [/^\s*(graph|flowchart)\b/i, 'flowchart'],
  [/^\s*sequenceDiagram\b/i, 'sequence'],
  [/^\s*gantt\b/i, 'gantt'],
  [/^\s*classDiagram\b/i, 'classDiagram'],
  [/^\s*erDiagram\b/i, 'erDiagram'],
  [/^\s*stateDiagram/i, 'stateDiagram'],
  [/^\s*pie\b/i, 'pie'],
  [/^\s*gitGraph\b/i, 'gitgraph'],
  [/^\s*mindmap\b/i, 'mindmap'],
  [/^\s*timeline\b/i, 'timeline'],
  [/^\s*quadrantChart\b/i, 'quadrant'],
  [/^\s*xychart/i, 'xychart'],
  [/^\s*architecture/i, 'architecture'],
  [/^\s*kanban\b/i, 'kanban'],
  [/^\s*sankey/i, 'sankey'],
  [/^\s*block/i, 'block'],
  [/^\s*packet/i, 'packet'],
  [/^\s*journey\b/i, 'journey'],
  [/^\s*requirementDiagram\b/i, 'requirement'],
  [/^\s*radar/i, 'radar'],
]

export function detectDiagramType(code: string): DiagramType {
  for (const [pattern, type] of PATTERNS) {
    if (pattern.test(code)) return type
  }
  return 'other'
}

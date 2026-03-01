export type TaskCategory = 'creative' | 'analytical' | 'administrative' | 'learning' | 'technical' | 'generic'

export type TaskSize = 'micro' | 'small' | 'medium' | 'large' | 'project'

export interface ComplexityScore {
  wordCount: number
  verbScore: number
  connectorCount: number
  categoryHint: TaskCategory
  estimatedMinutes: number
  size: TaskSize
}

export interface ExpansionContext {
  taskText: string
  date: string
  siblingTasks: string[]
  existingSubtasks: string[]
  blockDuration?: number
  category: TaskCategory
  complexity: ComplexityScore
  userProfile?: UserProfile
}

export interface SubtaskResult {
  text: string
  estimatedMinutes?: number
}

export interface ExpansionDecision {
  shouldExpand: boolean
  reason?: string
  suggestedCount: [min: number, max: number]
}

export interface UserProfile {
  totalExpansions: number
  avgSubtasksAccepted: number
  avgSubtasksPerExpansion: number
  preferredCategories: Record<TaskCategory, number>
  lastUpdated: number
}

export interface ExpansionEvent {
  id: string
  taskText: string
  category: TaskCategory
  complexitySize: TaskSize
  subtasksGenerated: number
  subtasksAccepted?: number
  timestamp: number
}

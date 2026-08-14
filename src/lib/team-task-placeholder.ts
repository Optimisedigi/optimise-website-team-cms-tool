type TeamTaskPlaceholderCandidate = {
  title?: unknown
  client?: unknown
  taskType?: unknown
  status?: unknown
  priority?: unknown
  assignedTo?: unknown
  instructions?: unknown
  staffNotes?: unknown
  reviewNotes?: unknown
}

function isEmptyRelationship(value: unknown): boolean {
  return value == null || value === ''
}

function isBlankText(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

/**
 * Add Week persists one untouched placeholder row because weeks have no
 * standalone collection. Only that exact placeholder may represent an empty week.
 */
export function isEmptyTeamTaskPlaceholder(task: TeamTaskPlaceholderCandidate): boolean {
  return task.title === 'New task'
    && isEmptyRelationship(task.client)
    && (task.taskType == null || task.taskType === 'blog_post')
    && (task.status == null || task.status === 'in_progress')
    && (task.priority == null || task.priority === 'normal')
    && isEmptyRelationship(task.assignedTo)
    && isBlankText(task.instructions)
    && isBlankText(task.staffNotes)
    && isBlankText(task.reviewNotes)
}

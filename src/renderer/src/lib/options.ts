// Wiederkehrende Auswahllisten für <Select>.
import type { Project } from '@shared/types'
import type { SelectOption } from '@/components/ui'

/** „Kein Projekt“ + alle Projekte */
export function projectOptions(projects: Project[], none = 'Kein Projekt'): SelectOption[] {
  return [{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name }))]
}

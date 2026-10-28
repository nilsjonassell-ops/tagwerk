import { useMemo, useRef, useState } from 'react'
import { Archive, Check, CheckCircle2, Mail, NotebookPen, Plus, Repeat, Sparkles, Trash2, Pencil, CalendarClock } from 'lucide-react'
import { addDays, isActive, isDueToday, isOverdue, sortTasks, ymd } from '@shared/analysis'
import type { Task } from '@shared/types'
import { useStore } from '@/lib/store'
import { dueLabel, fDayLong, parseQuickAdd, PRIORITY_LABEL, projectName, RECURRENCE_LABEL } from '@/lib/format'
import { addTask, archiveCompleted, deleteTask, newTask, toggleTask } from '@/lib/actions'
import { Empty, PriorityMark, Segmented, ViewHeader } from '@/components/ui'

type Tab = 'today' | 'week' | 'all' | 'done'

export function TasksView() {
  const data = useStore((s) => s.data)
  const [tab, setTab] = useState<Tab>('today')
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const now = new Date()
  const parsed = input.trim() ? parseQuickAdd(input, data, now) : null

  const add = () => {
    if (!parsed?.title) return
    const due = parsed.due ?? (tab === 'today' ? ymd(now) : undefined)
    addTask(newTask({ title: parsed.title, due, priority: parsed.priority ?? 'medium', projectId: parsed.projectId, recurrence: parsed.recurrence ?? 'none' }))
    setInput('')
  }

  const groups = useMemo(() => buildGroups(data.tasks, tab, now), [data.tasks, tab, now.toDateString()]) // eslint-disable-line react-hooks/exhaustive-deps
  const doneCount = data.tasks.filter((t) => t.status === 'done' && !t.archived).length
  const total = groups.reduce((n, g) => n + g.tasks.length, 0)

  return (
    <>
      <ViewHeader title="Aufgaben">
        {doneCount > 0 && tab !== 'done' && (
          <button className="btn small ghost" onClick={archiveCompleted}>
            <Archive /> {doneCount} Erledigte archivieren
          </button>
        )}
        <Segmented
          label="Ansicht"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'today', label: 'Heute' },
            { id: 'week', label: 'Woche' },
            { id: 'all', label: 'Alle' },
            { id: 'done', label: 'Erledigt' }
          ]}
        />
      </ViewHeader>
      <div className="view-body">
        <div className="tasks-view">
          {tab !== 'done' && (
            <>
              <div className="quick-add">
                <Plus aria-hidden="true" />
                <input
                  ref={inputRef}
                  id="quick-add-task"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') add()
                    if (e.key === 'Escape') setInput('')
                  }}
                  placeholder="Neue Aufgabe – z. B. „Angebot prüfen morgen !! #Relaunch“"
                  aria-label="Neue Aufgabe"
                  aria-describedby="quick-add-help"
                />
                {parsed?.title && (
                  <button className="btn small primary" onClick={add}>
                    Hinzufügen
                  </button>
                )}
              </div>
              <div className="quick-add-preview" id="quick-add-help" aria-live="polite">
                {parsed ? (
                  <>
                    {parsed.due && <span className="tag accent">{fDayLong.format(new Date(parsed.due + 'T12:00'))}</span>}
                    {!parsed.due && tab === 'today' && <span className="tag">heute</span>}
                    {parsed.priority && <span className={`tag ${parsed.priority === 'high' ? 'alert' : ''}`}>Priorität {PRIORITY_LABEL[parsed.priority]}</span>}
                    {parsed.projectId && <span className="tag">{projectName(data, parsed.projectId)}</span>}
                    {parsed.recurrence && <span className="tag"><Repeat /> {RECURRENCE_LABEL[parsed.recurrence]}</span>}
                  </>
                ) : (
                  <span>Datum: heute, morgen, Freitag, 12.11. · Priorität: ! oder !! · Projekt: #Name · Wiederholung: täglich, werktags …</span>
                )}
              </div>
            </>
          )}

          {total === 0 && <EmptyFor tab={tab} onAdd={() => inputRef.current?.focus()} />}

          {groups.map((g) =>
            g.tasks.length === 0 ? null : (
              <section key={g.key} className="task-group" aria-label={g.label}>
                <div className={`task-group-head ${g.tone === 'alert' ? 'alert' : ''}`}>
                  <h3>{g.label}</h3>
                  <span className="n">{g.tasks.length}</span>
                </div>
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </section>
            )
          )}
        </div>
      </div>
    </>
  )
}

function EmptyFor({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  if (tab === 'done') return <Empty icon={<CheckCircle2 />} title="Noch nichts erledigt">Abgehakte Aufgaben erscheinen hier, bis du sie archivierst.</Empty>
  return (
    <Empty icon={<CheckCircle2 />} title={tab === 'today' ? 'Nichts mehr für heute' : 'Keine offenen Aufgaben'}>
      <button className="link" onClick={onAdd}>
        Neue Aufgabe anlegen
      </button>
    </Empty>
  )
}

interface Group {
  key: string
  label: string
  tasks: Task[]
  tone?: 'alert'
}

function buildGroups(tasks: Task[], tab: Tab, now: Date): Group[] {
  const active = sortTasks(tasks.filter(isActive))
  if (tab === 'today') {
    return [
      { key: 'overdue', label: 'Überfällig', tasks: active.filter((t) => isOverdue(t, now)), tone: 'alert' },
      { key: 'today', label: 'Heute', tasks: active.filter((t) => isDueToday(t, now)) },
      { key: 'doneToday', label: 'Heute erledigt', tasks: tasks.filter((t) => t.status === 'done' && !t.archived && t.completedAt && ymd(new Date(t.completedAt)) === ymd(now)) }
    ]
  }
  if (tab === 'week') {
    const groups: Group[] = [{ key: 'overdue', label: 'Überfällig', tasks: active.filter((t) => isOverdue(t, now)), tone: 'alert' }]
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, i)
      const key = ymd(d)
      groups.push({ key, label: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fDayLong.format(d), tasks: active.filter((t) => t.due === key) })
    }
    return groups
  }
  if (tab === 'all') {
    const byProject = new Map<string, Task[]>()
    for (const t of active) {
      const k = t.projectId ?? ''
      byProject.set(k, [...(byProject.get(k) ?? []), t])
    }
    const data = useStore.getState().data
    return [...byProject.entries()]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : (projectName(data, a) ?? '').localeCompare(projectName(data, b) ?? '')))
      .map(([k, ts]) => ({ key: k || 'none', label: k ? (projectName(data, k) ?? 'Projekt') : 'Ohne Projekt', tasks: ts }))
  }
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  return [
    { key: 'done', label: 'Erledigt', tasks: done.filter((t) => !t.archived) },
    { key: 'archived', label: 'Archiv', tasks: done.filter((t) => t.archived) }
  ]
}

function TaskRow({ t }: { t: Task }) {
  const data = useStore((s) => s.data)
  const openDialog = useStore((s) => s.openDialog)
  const go = useStore((s) => s.go)
  const done = t.status === 'done'
  const dl = t.due ? dueLabel(t.due) : null
  const proj = projectName(data, t.projectId)
  const OriginIcon = t.origin?.kind === 'email' ? Mail : t.origin?.kind === 'assistant' ? Sparkles : NotebookPen

  return (
    <div className="task-row">
      <button
        className={`check ${done ? 'done' : ''} ${t.priority === 'high' && !done ? 'prio-high' : ''}`}
        onClick={() => toggleTask(t.id)}
        aria-label={done ? `„${t.title}“ wieder öffnen` : `„${t.title}“ erledigen`}
        aria-pressed={done}
      >
        <Check />
      </button>
      <button className="title-btn" onClick={() => openDialog({ kind: 'task', id: t.id })}>
        <span className={`title ${done ? 'done-title' : ''}`}>{t.title}</span>
        <span className="meta">
          {dl && !done && (
            <span className={dl.tone === 'overdue' ? 'overdue-text' : dl.tone === 'today' ? 'today-text' : ''}>
              <CalendarClock /> {dl.tone === 'overdue' ? `überfällig, ${dl.text}` : dl.text}
            </span>
          )}
          {done && t.completedAt && <span>erledigt {new Date(t.completedAt).toLocaleDateString('de-DE')}</span>}
          {t.status === 'doing' && <span className="today-text">in Arbeit</span>}
          {proj && <span>{proj}</span>}
          {t.recurrence !== 'none' && (
            <span title="Wiederkehrend">
              <Repeat /> {RECURRENCE_LABEL[t.recurrence]}
            </span>
          )}
          {t.origin && (
            <span
              role="link"
              onClick={(e) => {
                e.stopPropagation()
                if (t.origin?.kind === 'email') go('inbox', t.origin.refId)
                if (t.origin?.kind === 'note' || t.origin?.kind === 'meeting') go('notes', t.origin.refId)
              }}
              style={{ textDecoration: t.origin.kind === 'email' || t.origin.kind === 'note' ? 'underline dotted' : undefined }}
            >
              <OriginIcon /> {t.origin.label}
            </span>
          )}
        </span>
      </button>
      <div className="row-actions">
        <button className="btn ghost small icon-btn" onClick={() => openDialog({ kind: 'task', id: t.id })} aria-label="Bearbeiten">
          <Pencil />
        </button>
        <button className="btn ghost small icon-btn" onClick={() => deleteTask(t.id)} aria-label="Löschen">
          <Trash2 />
        </button>
      </div>
      {!done && <PriorityMark p={t.priority} />}
    </div>
  )
}

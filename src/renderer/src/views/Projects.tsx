import { useMemo, useState } from 'react'
import { CalendarDays, FileText, FolderKanban, Mail, NotebookPen, Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { groupThreads, isActive, sortTasks } from '@shared/analysis'
import type { Project, ProjectStatus } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { dueLabel, fDayMed, fTime, mailDate } from '@/lib/format'
import { toggleTask } from '@/lib/actions'
import { Empty, PriorityMark, SourceTag, ViewHeader } from '@/components/ui'

export const STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  'on-track': { label: 'Im Plan', tone: 'ok' },
  'at-risk': { label: 'Gefährdet', tone: 'alert' },
  paused: { label: 'Pausiert', tone: '' },
  done: { label: 'Abgeschlossen', tone: 'accent' }
}

export function ProjectsView() {
  const data = useStore((s) => s.data)
  const selectedId = useStore((s) => s.selection.projects)
  const select = useStore((s) => s.select)
  const openDialog = useStore((s) => s.openDialog)
  const selected = data.projects.find((p) => p.id === selectedId) ?? data.projects[0]

  const stats = useMemo(() => {
    const m = new Map<string, { open: number; done: number }>()
    for (const t of data.tasks) {
      if (!t.projectId) continue
      const s = m.get(t.projectId) ?? { open: 0, done: 0 }
      if (t.status === 'done') s.done++
      else if (!t.archived) s.open++
      m.set(t.projectId, s)
    }
    return m
  }, [data.tasks])

  return (
    <>
      <ViewHeader title="Projekte">
        <button className="btn small" onClick={() => openDialog({ kind: 'project' })}>
          <Plus /> Projekt
        </button>
      </ViewHeader>
      <div className="view-body" style={{ overflow: 'hidden' }}>
        {data.projects.length === 0 ? (
          <Empty icon={<FolderKanban />} title="Noch keine Projekte">
            Projekte bündeln Aufgaben, Termine, E-Mails und Notizen.{' '}
            <button className="link" onClick={() => openDialog({ kind: 'project' })}>
              Erstes Projekt anlegen
            </button>
          </Empty>
        ) : (
          <div className="split two">
            <div className="list-pane">
              {data.projects.map((p) => {
                const s = stats.get(p.id) ?? { open: 0, done: 0 }
                const pct = s.open + s.done ? Math.round((s.done / (s.open + s.done)) * 100) : 0
                return (
                  <button key={p.id} className={`project-row ${selected?.id === p.id ? 'selected' : ''}`} onClick={() => select('projects', p.id)}>
                    <span className="project-dot" style={{ background: `hsl(${p.hue} 40% 50%)` }} />
                    <span className="grow">
                      <b>{p.name}</b>
                      <small>
                        {s.open} offen · {STATUS[p.status].label}
                      </small>
                      <span className="progress" aria-label={`${pct} % erledigt`}>
                        <i style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {selected && <ProjectDetail key={selected.id} p={selected} />}
          </div>
        )}
      </div>
    </>
  )
}

function ProjectDetail({ p }: { p: Project }) {
  const data = useStore((s) => s.data)
  const mutate = useStore((s) => s.mutate)
  const go = useStore((s) => s.go)
  const openDialog = useStore((s) => s.openDialog)
  const [newStep, setNewStep] = useState('')
  const now = new Date()
  const tasks = sortTasks(data.tasks.filter((t) => t.projectId === p.id && isActive(t)))
  const events = data.events.filter((e) => e.projectId === p.id && new Date(e.end) >= now).sort((a, b) => a.start.localeCompare(b.start))
  const threads = groupThreads(data.emails.filter((m) => m.projectId === p.id)).slice(0, 6)
  const notes = data.notes.filter((n) => n.projectId === p.id)
  const docs = data.docs.filter((d) => d.projectId === p.id)

  const updateSteps = (steps: string[]) => mutate((d) => ({ ...d, projects: d.projects.map((x) => (x.id === p.id ? { ...x, nextSteps: steps } : x)) }))
  const setStatus = (status: ProjectStatus) => mutate((d) => ({ ...d, projects: d.projects.map((x) => (x.id === p.id ? { ...x, status } : x)) }))
  const remove = async () => {
    const ok = await confirm({
      title: 'Projekt löschen?',
      body: `„${p.name}“ wird gelöscht. Aufgaben, Termine und Notizen bleiben erhalten, verlieren aber die Zuordnung.`,
      confirmLabel: 'Löschen',
      danger: true
    })
    if (!ok) return
    const strip = <T extends { projectId?: string }>(x: T) => (x.projectId === p.id ? { ...x, projectId: undefined } : x)
    mutate(
      (d) => ({ ...d, projects: d.projects.filter((x) => x.id !== p.id), tasks: d.tasks.map(strip), events: d.events.map(strip), notes: d.notes.map(strip), emails: d.emails.map(strip) }),
      { toast: 'Projekt gelöscht', undoable: true }
    )
  }

  return (
    <div className="project-detail">
      <div className="inner">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <h2 className="selectable" style={{ flex: 1 }}>
            {p.name}
          </h2>
          <button className="btn small ghost" onClick={() => openDialog({ kind: 'project', id: p.id })}>
            <Pencil /> Bearbeiten
          </button>
          <button className="btn small ghost icon-btn" onClick={remove} aria-label="Projekt löschen">
            <Trash2 />
          </button>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          <select className="select" style={{ width: 'auto', height: 28, fontSize: 'var(--fs-sm)' }} value={p.status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} aria-label="Projektstatus">
            {(Object.keys(STATUS) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
          <SourceTag source={p.source} />
        </div>
        {p.summary && (
          <p className="selectable" style={{ color: 'var(--ink-2)', maxWidth: '68ch', lineHeight: 1.6, marginTop: 14 }}>
            {p.summary}
          </p>
        )}

        <div className="project-cols">
          <section>
            <h3>Nächste Schritte</h3>
            <ol className="steps">
              {p.nextSteps.map((s, i) => (
                <li key={i}>
                  <span>{s}</span>
                  <button className="btn ghost small icon-btn" aria-label="Als erledigt entfernen" title="Erledigt" onClick={() => updateSteps(p.nextSteps.filter((_, j) => j !== i))}>
                    <Check />
                  </button>
                </li>
              ))}
            </ol>
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="Nächsten Schritt hinzufügen und Enter drücken"
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStep.trim()) {
                  updateSteps([...p.nextSteps, newStep.trim()])
                  setNewStep('')
                }
              }}
            />
          </section>

          <section>
            <h3>
              Offene Aufgaben <span className="n">{tasks.length}</span>
              <button className="link" style={{ marginLeft: 'auto' }} onClick={() => openDialog({ kind: 'task', preset: { projectId: p.id } })}>
                Hinzufügen
              </button>
            </h3>
            {tasks.length === 0 && <div className="hint">Keine offenen Aufgaben.</div>}
            {tasks.slice(0, 8).map((t) => {
              const dl = t.due ? dueLabel(t.due) : null
              return (
                <div key={t.id} className="mini-row">
                  <button className={`check ${t.priority === 'high' ? 'prio-high' : ''}`} onClick={() => toggleTask(t.id)} aria-label={`„${t.title}“ erledigen`}>
                    <Check />
                  </button>
                  <button className="grow" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => openDialog({ kind: 'task', id: t.id })}>
                    {t.title}
                  </button>
                  {dl && <span className={`side ${dl.tone === 'overdue' ? 'overdue-text' : ''}`}>{dl.text}</span>}
                  <PriorityMark p={t.priority} />
                </div>
              )
            })}
          </section>

          <section>
            <h3>
              Termine <span className="n">{events.length}</span>
            </h3>
            {events.length === 0 && <div className="hint">Keine anstehenden Termine.</div>}
            {events.slice(0, 5).map((e) => (
              <button key={e.id} className="mini-row" onClick={() => go('calendar', e.id)}>
                <CalendarDays />
                <span className="grow">{e.title}</span>
                <span className="side">
                  {fDayMed.format(new Date(e.start))}
                  {!e.allDay && `, ${fTime.format(new Date(e.start))}`}
                </span>
              </button>
            ))}
          </section>

          <section>
            <h3>
              E-Mails <span className="n">{threads.length}</span>
            </h3>
            {threads.length === 0 && <div className="hint">Keine zugeordneten E-Mails.</div>}
            {threads.map((t) => (
              <button key={t.id} className="mini-row" onClick={() => go('inbox', t.id)}>
                <Mail />
                <span className="grow" style={{ fontWeight: t.unread ? 600 : 400 }}>
                  {t.subject}
                </span>
                <span className="side">{mailDate(t.latest.date)}</span>
              </button>
            ))}
          </section>

          <section>
            <h3>
              Notizen <span className="n">{notes.length}</span>
            </h3>
            {notes.length === 0 && <div className="hint">Keine Notizen.</div>}
            {notes.map((n) => (
              <button key={n.id} className="mini-row" onClick={() => go('notes', n.id)}>
                <NotebookPen />
                <span className="grow">{n.title || 'Ohne Titel'}</span>
              </button>
            ))}
          </section>

          <section>
            <h3>
              Dokumente <span className="n">{docs.length}</span>
            </h3>
            {docs.length === 0 && <div className="hint">Keine Dokumentablage verbunden.</div>}
            {docs.map((d) => (
              <div key={d.id} className="mini-row" title="Nur Titel – Dokumentablage nicht verbunden">
                <FileText />
                <span className="grow">{d.title}</span>
                <span className="side">{d.kind}</span>
              </div>
            ))}
            {docs.length > 0 && (
              <div className="hint" style={{ marginTop: 4 }}>
                <X size={11} style={{ verticalAlign: -1 }} /> Öffnen nicht möglich – keine Dokumentablage verbunden.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

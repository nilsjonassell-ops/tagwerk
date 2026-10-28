// Demo-Datenquelle. Alle Datensätze tragen source: 'demo' und werden in der
// Oberfläche als Beispieldaten gekennzeichnet. Daten werden relativ zum
// aktuellen Datum erzeugt, damit Tagesansicht und Fristen plausibel sind.

import { addDays, startOfDay, ymd } from './analysis.ts'
import type { AppData, CalEvent, DocRef, Email, Note, Person, Project, Task } from './types.ts'

const P = {
  lea: { name: 'Lea Hoffmann', email: 'lea.hoffmann@nordlicht-studio.de' },
  jonas: { name: 'Jonas Weber', email: 'jonas.weber@nordlicht-studio.de' },
  mira: { name: 'Mira Kaya', email: 'mira.kaya@nordlicht-studio.de' },
  tobias: { name: 'Tobias Brandt', email: 't.brandt@brandt-partner.de' },
  sarah: { name: 'Sarah Lindner', email: 'sarah.lindner@posteo.de' },
  finanz: { name: 'Petra Schulz', email: 'petra.schulz@nordlicht-studio.de' },
  hv: { name: 'Hausverwaltung Kranz', email: 'service@hv-kranz.de' },
  me: { name: 'Ich', email: 'ich@beispiel.de' }
} satisfies Record<string, Person>

let seq = 0
const id = (p: string) => `demo-${p}-${++seq}`

export function createDemoData(now = new Date()): AppData {
  seq = 0
  const today = startOfDay(now)
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = addDays(today, dayOffset)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  const day = (offset: number) => ymd(addDays(today, offset))

  const projects: Project[] = [
    {
      id: 'demo-p-relaunch',
      name: 'Website-Relaunch',
      status: 'at-risk',
      summary: 'Neue Website für Brandt & Partner. Startseite und Leistungsseiten im Design-Review, Go-live geplant in drei Wochen.',
      nextSteps: ['Startseite final freigeben lassen', 'Texte für Leistungsseiten einsammeln', 'Staging-Umgebung für Kundentest einrichten'],
      hue: 200,
      source: 'demo'
    },
    {
      id: 'demo-p-q4',
      name: 'Q4-Planung',
      status: 'on-track',
      summary: 'Budget und Kapazitäten für das vierte Quartal abstimmen.',
      nextSteps: ['Budgetentwurf an Petra schicken', 'Kapazitätsplanung mit Lea abgleichen'],
      hue: 145,
      source: 'demo'
    },
    {
      id: 'demo-p-onboarding',
      name: 'Onboarding Mira',
      status: 'on-track',
      summary: 'Einarbeitung der neuen Kollegin Mira in Prozesse und Tools.',
      nextSteps: ['Zugänge prüfen', 'Pairing-Termine für Woche 2 planen'],
      hue: 280,
      source: 'demo'
    },
    {
      id: 'demo-p-wohnung',
      name: 'Wohnung',
      status: 'paused',
      summary: 'Privat: Nebenkostenabrechnung klären, Handwerkertermin.',
      nextSteps: ['Rückfrage zur Nebenkostenabrechnung stellen'],
      hue: 30,
      source: 'demo'
    }
  ]

  const team = [P.lea, P.jonas, P.mira]
  const events: CalEvent[] = [
    // Heute – bewusst mit einem knappen Übergang und einer Überschneidung
    ev('Daily Stand-up', at(0, 9), at(0, 9, 20), 'Online (Teams)', team, undefined, 'demo-p-relaunch'),
    ev('Design-Review Startseite', at(0, 10), at(0, 11), 'Raum Main, 3. OG', [P.lea, P.jonas],
      'Varianten A und B der Startseite gegenüberstellen. Entscheidung zur Bildsprache treffen.', 'demo-p-relaunch'),
    ev('Kundentermin Brandt & Partner', at(0, 11), at(0, 11, 45), 'Bockenheimer Landstraße 51, Frankfurt', [P.tobias, P.lea],
      'Stand Relaunch vorstellen, Termin für Go-live bestätigen.', 'demo-p-relaunch'),
    ev('Mittagessen mit Sarah', at(0, 13), at(0, 14), 'Kleinmarkthalle', [P.sarah]),
    ev('Q4-Budgetrunde', at(0, 14, 30), at(0, 15, 30), 'Raum Main, 3. OG', [P.finanz, P.lea], 'Entwurf Folie 3 bis 5 besprechen.', 'demo-p-q4'),
    ev('1:1 mit Lea', at(0, 15), at(0, 15, 45), 'Online (Teams)', [P.lea]),
    // Morgen
    ev('Daily Stand-up', at(1, 9), at(1, 9, 20), 'Online (Teams)', team, undefined, 'demo-p-relaunch'),
    ev('Pairing mit Mira: Deployment', at(1, 10), at(1, 11, 30), 'Raum Taunus', [P.mira], undefined, 'demo-p-onboarding'),
    ev('Zahnarzt', at(1, 16), at(1, 17), 'Praxis Dr. Henkel, Berger Str. 12', []),
    // Weitere Tage
    ev('Daily Stand-up', at(2, 9), at(2, 9, 20), 'Online (Teams)', team),
    ev('Texte Leistungsseiten – Workshop', at(2, 13), at(2, 15), 'Bockenheimer Landstraße 51, Frankfurt', [P.tobias, P.jonas], undefined, 'demo-p-relaunch'),
    ev('Team-Retro', at(5, 15), at(5, 16), 'Raum Main, 3. OG', team),
    ev('Daily Stand-up', at(5, 9), at(5, 9, 20), 'Online (Teams)', team),
    ev('Q4-Planung: Kapazitäten', at(6, 11), at(6, 12), 'Online (Teams)', [P.lea, P.finanz], undefined, 'demo-p-q4'),
    ev('Handwerker Heizung', at(7, 8), at(7, 10), 'Zuhause', [P.hv], undefined, 'demo-p-wohnung'),
    ev('Kunden-Abnahme Staging', at(9, 14), at(9, 15, 30), 'Online (Teams)', [P.tobias, P.lea, P.jonas], undefined, 'demo-p-relaunch'),
    ev('Geburtstag Sarah', at(12, 0), at(13, 0), undefined, [], undefined, undefined, true),
    ev('Go-live Website', at(20, 9), at(20, 10), 'Online (Teams)', [P.tobias, P.lea, P.jonas], undefined, 'demo-p-relaunch'),
    // Vergangenheit
    ev('Kick-off Onboarding', at(-2, 10), at(-2, 11), 'Raum Taunus', [P.mira, P.lea], undefined, 'demo-p-onboarding'),
    ev('Design-Review Navigation', at(-5, 14), at(-5, 15), 'Raum Main, 3. OG', [P.lea, P.jonas], undefined, 'demo-p-relaunch')
  ]

  const tasks: Task[] = [
    task('Startseite: Feedback aus Design-Review einarbeiten', 'high', day(0), 'demo-p-relaunch'),
    task('Budgetentwurf Q4 an Petra schicken', 'high', day(-1), 'demo-p-q4'),
    task('Angebot für Wartungsvertrag prüfen', 'medium', day(-3), 'demo-p-relaunch'),
    task('Zugänge für Mira prüfen (GitHub, Figma, Slack)', 'medium', day(0), 'demo-p-onboarding'),
    task('Wochenbericht schreiben', 'medium', day(2), undefined, 'weekly'),
    task('Texte Leistungsseiten bei Tobias anfragen', 'high', day(1), 'demo-p-relaunch'),
    task('Rückfrage Nebenkostenabrechnung', 'low', day(4), 'demo-p-wohnung'),
    task('Staging-Umgebung einrichten', 'medium', day(6), 'demo-p-relaunch'),
    task('Pairing-Termine für Woche 2 planen', 'low', day(3), 'demo-p-onboarding'),
    task('Inbox auf null bringen', 'low', day(0), undefined, 'weekdays'),
    task('Geschenk für Sarah besorgen', 'medium', day(9)),
    task('Reisekosten September einreichen', 'low', undefined),
    { ...task('Navigation: Mobile-Menü testen', 'medium', day(-4), 'demo-p-relaunch'), status: 'done', completedAt: at(-3, 16) },
    { ...task('Kick-off Onboarding vorbereiten', 'medium', day(-2), 'demo-p-onboarding'), status: 'done', completedAt: at(-2, 9), archived: true }
  ]
  tasks[2].status = 'doing'

  const emails: Email[] = [
    ...thread('Relaunch: Freigabe der Startseite', 'demo-p-relaunch', [
      [P.tobias, -3, 9, 12, 'Hallo zusammen,\n\nwir haben uns die beiden Varianten der Startseite intern angesehen. Grundsätzlich gefällt uns Variante B besser, vor allem wegen der ruhigeren Bildsprache. Uns fehlt aber noch ein klarer Einstieg für Bestandskunden.\n\nKönnt ihr dafür einen Vorschlag machen?\n\nViele Grüße\nTobias'],
      [P.lea, -3, 11, 40, 'Hi Tobias,\n\ndanke für das Feedback! Wir bauen in Variante B einen zweiten Einstieg „Für Bestandskunden“ unterhalb des Hero-Bereichs ein. Bis Ende der Woche schicken wir einen Entwurf.\n\nLiebe Grüße\nLea'],
      [P.tobias, -1, 17, 5, 'Hallo Lea,\n\nsuper, danke. Eine Sache noch: Unsere Geschäftsführung möchte, dass die Telefonnummer prominent im Kopfbereich steht. Ist das mit dem neuen Design vereinbar?\n\nAußerdem bräuchten wir die finale Freigabe spätestens bis Freitag, damit unsere Rechtsabteilung die Texte noch prüfen kann.\n\nGruß\nTobias'],
      [P.jonas, -1, 18, 20, 'Kurze technische Einschätzung: Telefonnummer im Header geht, auf Mobil würde ich sie als Icon-Button umsetzen, sonst wird es zu eng. Aufwand ca. einen halben Tag.\n\nJonas'],
      [P.tobias, 0, 8, 2, 'Guten Morgen,\n\nkurze Erinnerung an die Freigabe bis Freitag. Können Sie mir heute noch bestätigen, ob der Termin hält? Dann plane ich die Rechtsprüfung für Montag ein.\n\nDanke und Gruß\nTobias Brandt', true, true]
    ]),
    ...thread('Budget Q4 – Entwurf bitte bis Mittwoch', 'demo-p-q4', [
      [P.finanz, -2, 14, 30, 'Hallo,\n\nfür die Budgetrunde brauche ich euren Entwurf für Q4 bis spätestens Mittwoch. Bitte die Positionen Personal, Tools und externe Dienstleister getrennt aufführen.\n\nDanke!\nPetra', true, true]
    ]),
    ...thread('Willkommen im Team!', 'demo-p-onboarding', [
      [P.mira, -1, 9, 15, 'Hallo,\n\nvielen Dank für den herzlichen Empfang gestern! Ich habe noch keinen Zugang zu Figma und dem Deployment-Repository. Könntest du das freischalten lassen?\n\nViele Grüße\nMira', false, true]
    ]),
    ...thread('Nebenkostenabrechnung 2025', 'demo-p-wohnung', [
      [P.hv, -6, 10, 0, 'Sehr geehrte Mieterinnen und Mieter,\n\nanbei erhalten Sie die Nebenkostenabrechnung für das Jahr 2025. Eine eventuelle Nachzahlung ist bis zum Monatsende fällig. Bei Rückfragen erreichen Sie uns unter dieser Adresse.\n\nMit freundlichen Grüßen\nIhre Hausverwaltung Kranz', false, true]
    ]),
    ...thread('Samstag?', undefined, [
      [P.sarah, 0, 7, 45, 'Hey! Hast du Samstag Lust auf eine Runde am Main und danach Kaffee? Sag mir einfach Bescheid :)\nSarah', false, true]
    ]),
    ...thread('Agenda Team-Retro', undefined, [
      [P.lea, 0, 9, 40, 'Hi,\n\nich habe die Agenda für die Retro vorbereitet und im Team-Ordner abgelegt. Wenn du noch Punkte hast, ergänze sie gerne bis Montag.\n\nLea', false, false]
    ]),
    ...thread('Deployment-Pipeline: Staging ist wieder grün', 'demo-p-relaunch', [
      [P.jonas, -1, 15, 10, 'Info: Die Staging-Pipeline läuft wieder. Ursache war ein abgelaufenes Zertifikat. Keine Aktion nötig.\n\nJonas', false, false]
    ]),
    ...thread('Ihre Rechnung Oktober', undefined, [
      [{ name: 'Mobilfunk Service', email: 'rechnung@mobilfunk-beispiel.de' }, -2, 6, 0, 'Ihre Rechnung für Oktober steht im Kundenportal bereit. Der Betrag wird wie gewohnt abgebucht.', false, false]
    ])
  ]
  // ältere Nachrichten sind gelesen
  for (const e of emails) if (new Date(e.date) < addDays(today, -1)) e.read = true
  const retroMail = emails.find((e) => e.subject === 'Agenda Team-Retro')
  if (retroMail) retroMail.read = true

  const notes: Note[] = [
    {
      id: 'demo-n-1',
      title: 'Design-Review Navigation',
      kind: 'meeting',
      eventId: events.find((e) => e.title === 'Design-Review Navigation')!.id,
      projectId: 'demo-p-relaunch',
      body: 'Teilnehmende: Lea, Jonas\n\nMobile-Menü wirkt überladen, Untermenüs nur bei Bedarf aufklappen.\nSuche bleibt im Header.\n\nNächste Schritte:\n- Mobile-Menü vereinfachen\n- [ ] Suchfeld auf Tablet testen\n- Barrierefreiheit der Navigation prüfen lassen',
      decisions: 'Suche bleibt im Header.\nUntermenüs klappen erst bei Tippen auf.',
      nextSteps: '',
      createdAt: at(-5, 15),
      updatedAt: at(-5, 15, 20)
    },
    {
      id: 'demo-n-2',
      title: 'Ideen Q4',
      kind: 'note',
      projectId: 'demo-p-q4',
      body: 'Tool-Kosten konsolidieren: zwei Design-Tools parallel ist zu teuer.\nWeiterbildungsbudget pro Person festlegen.\nTODO: Angebote für Schulungen einholen',
      createdAt: at(-4, 18),
      updatedAt: at(-4, 18, 10)
    },
    {
      id: 'demo-n-3',
      title: 'Onboarding-Checkliste',
      kind: 'note',
      projectId: 'demo-p-onboarding',
      body: 'Woche 1: Zugänge, Kennenlernen, erstes kleines Ticket.\nWoche 2: Pairing, erster eigener Deploy.\nWoche 3: Eigenes Feature.',
      createdAt: at(-8, 11),
      updatedAt: at(-3, 12)
    }
  ]

  const docs: DocRef[] = [
    { id: 'demo-d-1', title: 'Startseite – Varianten A/B', kind: 'Präsentation', projectId: 'demo-p-relaunch', updatedAt: at(-1, 17), source: 'demo' },
    { id: 'demo-d-2', title: 'Sitemap und Seitentexte', kind: 'Dokument', projectId: 'demo-p-relaunch', updatedAt: at(-3, 10), source: 'demo' },
    { id: 'demo-d-3', title: 'Angebot Wartungsvertrag', kind: 'PDF', projectId: 'demo-p-relaunch', updatedAt: at(-6, 9), source: 'demo' },
    { id: 'demo-d-4', title: 'Budget Q4 – Entwurf', kind: 'Tabelle', projectId: 'demo-p-q4', updatedAt: at(-1, 12), source: 'demo' },
    { id: 'demo-d-5', title: 'Onboarding-Handbuch', kind: 'Dokument', projectId: 'demo-p-onboarding', updatedAt: at(-10, 9), source: 'demo' }
  ]

  return {
    version: 1,
    tasks,
    events,
    emails,
    notes,
    projects,
    docs,
    chat: [],
    sources: { demo: true, icsImports: [] }
  }

  function ev(
    title: string,
    start: string,
    end: string,
    location: string | undefined,
    attendees: Person[],
    notes?: string,
    projectId?: string,
    allDay?: boolean
  ): CalEvent {
    return { id: id('e'), title, start, end, location, attendees, notes, projectId, allDay, source: 'demo' }
  }

  function task(title: string, priority: Task['priority'], due?: string, projectId?: string, recurrence: Task['recurrence'] = 'none'): Task {
    return { id: id('t'), title, priority, due, projectId, status: 'open', recurrence, createdAt: at(-7, 9), source: 'demo' }
  }

  function thread(
    subject: string,
    projectId: string | undefined,
    msgs: [Person, number, number, number, string, boolean?, boolean?][]
  ): Email[] {
    const tid = id('th')
    return msgs.map(([from, d, h, m, body, important, needsReply], i) => ({
      id: id('m'),
      threadId: tid,
      from,
      to: [P.me],
      subject: i === 0 ? subject : `Re: ${subject}`,
      date: at(d, h, m),
      body,
      read: false,
      important: important ?? false,
      needsReply: needsReply ?? false,
      replied: false,
      folder: 'inbox',
      projectId,
      source: 'demo'
    }))
  }
}

export function emptyData(): AppData {
  return { version: 1, tasks: [], events: [], emails: [], notes: [], projects: [], docs: [], chat: [], sources: { demo: false, icsImports: [] } }
}

/** Entfernt alle Demo-Datensätze, behält eigene und importierte Einträge. */
export function removeDemo(data: AppData): AppData {
  const notDemo = <T extends { source?: string; id: string }>(x: T) => x.source !== 'demo' && !x.id.startsWith('demo-')
  return {
    ...data,
    tasks: data.tasks.filter(notDemo).map((t) => (t.projectId?.startsWith('demo-') ? { ...t, projectId: undefined } : t)),
    events: data.events.filter(notDemo),
    emails: data.emails.filter(notDemo),
    notes: data.notes.filter((n) => !n.id.startsWith('demo-')),
    projects: data.projects.filter(notDemo),
    docs: data.docs.filter(notDemo),
    sources: { ...data.sources, demo: false }
  }
}

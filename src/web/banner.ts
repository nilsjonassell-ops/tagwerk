// Dezenter Hinweis: Das ist die Web-Vorschau, keine echte App. Klein, damit nichts verdeckt wird.
declare const __BUILD__: string
const b = document.createElement('button')
b.type = 'button'
b.title = 'Web-Vorschau: Beispieldaten liegen nur in diesem Browser, Outlook und Apple sind simulierte Testkonten – nichts wird verschickt. Klicken, um alles zurückzusetzen.'
b.setAttribute('aria-label', b.title)
b.style.cssText =
  'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:9998;padding:3px 10px;border:0;border-radius:999px;background:rgba(18,22,46,.72);color:#fff;font:11.5px/1.6 system-ui,sans-serif;cursor:pointer;opacity:.85'
b.textContent = `Web-Vorschau ${__BUILD__}`
b.onclick = () => {
  if (confirm('Web-Vorschau zurücksetzen? Alle hier angelegten Beispieldaten werden gelöscht.')) {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tagwerk-web:')) localStorage.removeItem(k)
    location.reload()
  }
}
document.body.appendChild(b)
export {}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import './styles/glass.css'
import './styles/motion.css'
import './styles/liquid.css'
import './styles/focus.css'
import './styles/intro.css'
import './styles/mail.css'
import './styles/popup.css'
import { App } from './App'
import { QuickNote } from './QuickNote'
import { Intro } from './components/Intro'
import { Popup } from './Popup'

const isQuickNote = location.hash === '#quicknote'
const isPopup = location.hash === '#popup'
if (isQuickNote || isPopup) document.body.style.background = 'transparent'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPopup ? (
      <Popup />
    ) : isQuickNote ? (
      <QuickNote />
    ) : (
      <>
        <App />
        <Intro />
      </>
    )}
  </StrictMode>
)

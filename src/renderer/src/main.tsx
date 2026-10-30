import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import './styles/glass.css'
import './styles/motion.css'
import './styles/liquid.css'
import './styles/focus.css'
import './styles/intro.css'
import { App } from './App'
import { QuickNote } from './QuickNote'
import { Intro } from './components/Intro'

const isQuickNote = location.hash === '#quicknote'
if (isQuickNote) document.body.style.background = 'transparent'

createRoot(document.getElementById('root')!).render(<StrictMode>{isQuickNote ? <QuickNote /> : (
      <>
        <App />
        <Intro />
      </>
    )}</StrictMode>)

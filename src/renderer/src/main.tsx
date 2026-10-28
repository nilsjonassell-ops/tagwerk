import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { App } from './App'
import { QuickNote } from './QuickNote'

const isQuickNote = location.hash === '#quicknote'
if (isQuickNote) document.body.style.background = 'transparent'

createRoot(document.getElementById('root')!).render(<StrictMode>{isQuickNote ? <QuickNote /> : <App />}</StrictMode>)

import './style.css'
import { register, push, currentScreen } from './router.js'
import { store } from './store.js'
import { HomeScreen }        from './screens/home.js'
import { ProjectScreen }      from './screens/project.js'
import { ConversationScreen } from './screens/conversation.js'
import { ActorEditorScreen }  from './screens/actor-editor.js'
import { PlayScreen }         from './screens/play.js'
import { TitleEditorScreen }  from './screens/title-editor.js'
import { QuoteEditorScreen }  from './screens/quote-editor.js'
import { initScrollbarPolicy } from './scrollbar-policy.js'

// ── Accent color ── apply on boot and on change
function hexToRgb(hex) {
  const clean = String(hex || '').trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '246,183,79'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}

function applyAccent(hex) {
  const color = String(hex || '').trim() || '#F6B74F'
  const rgb = hexToRgb(color)
  const root = document.documentElement
  root.style.setProperty('--accent', color)
  root.style.setProperty('--accent-rgb', rgb)
  root.style.setProperty('--accent-g', `linear-gradient(135deg, rgba(${rgb},0.95), rgba(${rgb},0.78))`)
}
applyAccent(store.getAppAccent())
store.on('app-settings-changed', s => { if (s.accent) applyAccent(s.accent) })

// Register all screens
register('home',         HomeScreen)
register('project',      ProjectScreen)
register('conversation', ConversationScreen)
register('actor-editor', ActorEditorScreen)
register('play',         PlayScreen)
register('title-editor', TitleEditorScreen)
register('quote-editor', QuoteEditorScreen)

initScrollbarPolicy()

// Boot into the last opened project when available; otherwise go to home.
if (!currentScreen()) {
  push('home')
  const lastProjectId = store.getLastOpenedProjectId()
  if (lastProjectId) push('project', { projectId: lastProjectId })
}

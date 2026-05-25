import './style.css'
import { register, push, currentScreen } from './router.js'
import { store } from './store.js'
import { HomeScreen }        from './screens/home.js'
import { ProjectScreen }      from './screens/project.js'
import { ConversationScreen } from './screens/conversation.js'
import { ActorEditorScreen }  from './screens/actor-editor.js'
import { PlayScreen }         from './screens/play.js'

// Register all screens
register('home',         HomeScreen)
register('project',      ProjectScreen)
register('conversation', ConversationScreen)
register('actor-editor', ActorEditorScreen)
register('play',         PlayScreen)

// Boot into the last opened project when available; otherwise go to home.
if (!currentScreen()) {
  push('home')
  const lastProjectId = store.getLastOpenedProjectId()
  if (lastProjectId) push('project', { projectId: lastProjectId })
}

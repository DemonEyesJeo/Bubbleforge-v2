import './style.css'
import { register, push, currentScreen } from './router.js'
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

// Boot into home once, even if module is re-evaluated during dev reloads.
if (!currentScreen()) push('home')

import { store } from '../store.js'
import { push, pop } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'

export class ProjectScreen {
  constructor({ projectId }) {
    this.projectId = projectId
    this._onProjectChange = (id) => {
      if (!id || id === this.projectId) this._refresh()
    }
    this._onProjectsChange = () => this._refresh()
  }

  render() {
    const el = document.createElement('div')
    el.className = 'project-screen'
    el.innerHTML = `
      <div class="status-bar">
        <span class="time">9:41</span>
        ${statusIcons()}
      </div>
      <div class="nav-bar">
        <div class="nav-back" id="projectBackBtn">${icons.back} Stories</div>
        <div class="nav-center">
          <div class="nav-title" id="projectNavTitle">Project</div>
          <div class="nav-sub" id="projectNavSub"></div>
        </div>
        <div style="width:72px;"></div>
      </div>
      <div class="project-body">
        <div class="project-hero">
          <div class="project-kicker">Story Builder</div>
          <h2 id="projectStoryName">Untitled Story</h2>
          <div class="project-meta" id="projectMeta"></div>
        </div>

        <div class="project-actions">
          <button class="project-action-card primary" id="projectConversationBtn" type="button">
            <div class="project-action-title">Conversation</div>
            <div class="project-action-sub">Open chat timeline and write messages</div>
          </button>
          <button class="project-action-card" id="projectTitleBtn" type="button">
            <div class="project-action-title">Title</div>
            <div class="project-action-sub" id="projectTitleValue">Scene 1</div>
          </button>
          <button class="project-action-card" id="projectQuoteBtn" type="button">
            <div class="project-action-title">Quote</div>
            <div class="project-action-sub" id="projectQuoteValue">Add a scene quote</div>
          </button>
        </div>
      </div>
    `
    return el
  }

  bind() {
    store.setLastOpenedProjectId(this.projectId)
    this._el.querySelector('#projectBackBtn')?.addEventListener('click', () => pop())
    this._el.querySelector('#projectConversationBtn')?.addEventListener('click', () => {
      push('conversation', { projectId: this.projectId })
    })
    this._el.querySelector('#projectTitleBtn')?.addEventListener('click', () => this._editSceneTitle())
    this._el.querySelector('#projectQuoteBtn')?.addEventListener('click', () => this._editSceneQuote())

    store.on('project-changed', this._onProjectChange)
    store.on('projects-changed', this._onProjectsChange)
    this._refresh()
  }

  resume() {
    this._refresh()
  }

  destroy() {
    store.off('project-changed', this._onProjectChange)
    store.off('projects-changed', this._onProjectsChange)
  }

  _refresh() {
    const project = store.getProject(this.projectId)
    if (!project) {
      pop()
      return
    }
    const scene = store.getActiveScene(this.projectId)
    const sceneCount = project.scenes?.length || 0
    const messageCount = (project.scenes || []).reduce((n, s) => n + ((s.messages || []).length), 0)

    this._el.querySelector('#projectNavTitle').textContent = project.name || 'Project'
    this._el.querySelector('#projectNavSub').textContent = `${sceneCount} scene${sceneCount === 1 ? '' : 's'} · ${messageCount} messages`
    this._el.querySelector('#projectStoryName').textContent = project.name || 'Untitled Story'
    this._el.querySelector('#projectMeta').textContent = scene ? `Active scene: ${scene.name || 'Scene'}` : 'No active scene'

    this._el.querySelector('#projectTitleValue').textContent = scene?.name || 'Set scene title'
    this._el.querySelector('#projectQuoteValue').textContent = scene?.quote?.trim() ? scene.quote : 'Add a scene quote'
  }

  _editSceneTitle() {
    const scene = store.getActiveScene(this.projectId)
    if (!scene) return
    const next = window.prompt('Scene title', scene.name || '')
    if (next == null) return
    const title = next.trim()
    if (!title) return
    store.updateScene(this.projectId, scene.id, { name: title })
    this._refresh()
  }

  _editSceneQuote() {
    const scene = store.getActiveScene(this.projectId)
    if (!scene) return
    const next = window.prompt('Scene quote', scene.quote || '')
    if (next == null) return
    store.updateScene(this.projectId, scene.id, { quote: next.trim() })
    this._refresh()
  }
}

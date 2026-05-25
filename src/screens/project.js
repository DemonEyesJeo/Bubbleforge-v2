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
        <div class="project-actions">
          <button class="project-action-card primary" id="projectConversationBtn" type="button">
            <div class="project-action-icon">${icons.scene}</div>
            <div class="project-action-title">Conversation</div>
            <div class="project-action-sub">Create blank conversation scene</div>
          </button>
          <button class="project-action-card" id="projectTitleBtn" type="button">
            <div class="project-action-icon">T</div>
            <div class="project-action-title">Title</div>
            <div class="project-action-sub">Create blank title scene</div>
          </button>
          <button class="project-action-card" id="projectQuoteBtn" type="button">
            <div class="project-action-icon">❝</div>
            <div class="project-action-title">Quote</div>
            <div class="project-action-sub">Create blank quote scene</div>
          </button>
        </div>

        <div class="project-section-title">Scenes</div>
        <div class="project-scene-list" id="projectSceneList"></div>
      </div>
    `
    return el
  }

  bind() {
    store.setLastOpenedProjectId(this.projectId)
    this._el.querySelector('#projectBackBtn')?.addEventListener('click', () => pop())
    this._el.querySelector('#projectConversationBtn')?.addEventListener('click', () => {
      this._createBlankScene('conversation')
    })
    this._el.querySelector('#projectTitleBtn')?.addEventListener('click', () => this._createBlankScene('title'))
    this._el.querySelector('#projectQuoteBtn')?.addEventListener('click', () => this._createBlankScene('quote'))

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
    this._renderSceneList(project)
  }

  _createBlankScene(kind) {
    const defaults = {
      conversation: { name: 'Scene', quote: '' },
      title: { name: 'Untitled', quote: '' },
      quote: { name: 'Quote', quote: '' },
    }
    const draft = defaults[kind] || defaults.conversation
    const scene = store.addScene(this.projectId, draft.name)
    if (!scene) return

    store.updateScene(this.projectId, scene.id, { kind, quote: draft.quote })
    store.setActiveScene(this.projectId, scene.id)

    if (kind === 'conversation') {
      push('conversation', { projectId: this.projectId })
      return
    }
    this._refresh()
  }

  _sceneKind(scene) {
    const kind = String(scene?.kind || '').toLowerCase()
    if (kind === 'conversation' || kind === 'title' || kind === 'quote') return kind
    if (scene?.quote?.trim()) return 'quote'
    return 'conversation'
  }

  _renderSceneList(project) {
    const list = this._el.querySelector('#projectSceneList')
    if (!list) return
    const scenes = project?.scenes || []
    if (!scenes.length) {
      list.innerHTML = '<div class="recent-exports-empty">No scenes yet. Use the cards above to create one.</div>'
      return
    }

    list.innerHTML = scenes.map((scene, i) => {
      const kind = this._sceneKind(scene)
      const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1)
      const icon = kind === 'title' ? 'T' : kind === 'quote' ? '❝' : '💬'
      const name = scene?.name?.trim() || (kind === 'title' ? 'Untitled' : kind === 'quote' ? 'Quote' : 'Scene')
      return `
        <button class="project-scene-row" data-scene-id="${scene.id}" type="button">
          <div class="project-scene-icon">${icon}</div>
          <div class="project-scene-copy">
            <div class="project-scene-name">${i + 1}. ${name}</div>
            <div class="project-scene-kind">${kindLabel}</div>
          </div>
          <div class="project-scene-menu">•••</div>
        </button>
      `
    }).join('')

    list.querySelectorAll('.project-scene-row').forEach(row => {
      row.addEventListener('click', () => {
        const sceneId = row.dataset.sceneId
        if (!sceneId) return
        store.setActiveScene(this.projectId, sceneId)
        const scene = store.getScene(this.projectId, sceneId)
        if (this._sceneKind(scene) === 'conversation') {
          push('conversation', { projectId: this.projectId })
          return
        }
        this._refresh()
      })
    })
  }
}

import { store } from '../store.js'
import { push, pop } from '../router.js'
import { icons } from '../components/icons.js'
import { renderStatusBar } from '../components/status-bar.js'

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
        <div id="statusBarHost">${renderStatusBar()}</div>
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
    this._closeSceneMenu()
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
    const status = store.getSceneStatusBar(this.projectId, scene?.id)
    const host = this._el.querySelector('#statusBarHost')
    if (host) host.innerHTML = renderStatusBar(status)
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
      const name = scene?.name?.trim() || (kind === 'title' ? 'Untitled' : kind === 'quote' ? 'Quote' : 'Scene')
      const messageCount = (scene.messages || []).length
      const coverRows = this._sceneCoverBubbles(scene, project)
      return `
        <button class="project-card project-scene-card" data-scene-id="${scene.id}" type="button">
          <div class="project-cover" style="background:${this._coverGradientFromScene(scene, project)};">
            <div class="project-cover-overlay"></div>
            <div style="position:absolute;top:8px;right:8px;display:flex;gap:6px;z-index:2;">
              <button class="project-scene-menu-btn" data-scene-id="${scene.id}" type="button" style="border:0;background:rgba(0,0,0,0.38);color:#fff;border-radius:10px;padding:5px 8px;font-size:11px;cursor:pointer;">•••</button>
            </div>
            ${coverRows ? `<div class="project-cover-bubbles">${coverRows}</div>` : '<div class="project-cover-empty">No messages yet</div>'}
          </div>
          <div class="project-info">
            <div>
              <div class="project-name">${i + 1}. ${name}</div>
              <div class="project-meta">${kindLabel} · ${messageCount} message${messageCount === 1 ? '' : 's'}</div>
            </div>
            <div class="project-kind-pill">${kindLabel}</div>
          </div>
        </button>
      `
    }).join('')

    list.querySelectorAll('.project-scene-card').forEach(row => {
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

    list.querySelectorAll('.project-scene-menu-btn').forEach(menuBtn => {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const row = menuBtn.closest('.project-scene-card')
        const sceneId = row?.dataset.sceneId
        if (!sceneId) return
        this._showSceneMenu(sceneId)
      })
    })
  }

  _coverGradientFromScene(scene, project) {
    const firstMsg = (scene.messages || [])[0]
    const actor = (project.actors || []).find(a => a.id === firstMsg?.actor_id)
    const color = actor?.color || '#1a2436'
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `linear-gradient(135deg,rgba(${r},${g},${b},0.16),rgba(${r},${g},${b},0.06))`
  }

  _sceneCoverBubbles(scene, project) {
    const messages = (scene.messages || []).slice(0, 5)
    if (!messages.length) return ''
    const widths = ['58%', '42%', '65%', '48%', '56%']
    return messages.map((msg, i) => {
      const actor = (project.actors || []).find(a => a.id === msg.actor_id)
      const color = actor?.color || '#5f6678'
      const side = actor?.side === 'right' ? 'margin-left:auto;' : ''
      const width = widths[i % widths.length]
      return `<div class="mini-bub" style="width:${width};background:${color};${side}"></div>`
    }).join('')
  }

  _showSceneMenu(sceneId) {
    if (this._sceneMenuOverlay || this._sceneMenuSheet) return

    const project = store.getProject(this.projectId)
    const scene = store.getScene(this.projectId, sceneId)
    if (!project || !scene) return

    const overlay = document.createElement('div')
    overlay.className = 'new-project-overlay'

    const sheet = document.createElement('div')
    sheet.className = 'new-project-sheet'
    sheet.innerHTML = `
      <div class="new-project-handle"></div>
      <div class="new-project-title">Scene actions</div>
      <div class="new-project-sub">${scene.name || 'Scene'}</div>
      <div class="new-project-actions" style="flex-direction:column; margin-top:14px;">
        <button id="sceneRenameBtn" class="new-project-btn ghost">Rename</button>
        <button id="sceneDuplicateBtn" class="new-project-btn ghost">Duplicate</button>
        <button id="sceneDeleteBtn" class="new-project-btn ghost" style="color:var(--danger);">Delete</button>
        <button id="sceneCloseBtn" class="new-project-btn primary">Done</button>
      </div>
    `

    this._sceneMenuOverlay = overlay
    this._sceneMenuSheet = sheet
    this._el.appendChild(overlay)
    this._el.appendChild(sheet)

    const close = () => this._closeSceneMenu()
    overlay.addEventListener('click', close)
    sheet.querySelector('#sceneCloseBtn')?.addEventListener('click', close)

    sheet.querySelector('#sceneRenameBtn')?.addEventListener('click', () => {
      const next = window.prompt('Rename scene', scene.name || '')
      if (next == null) return
      const name = next.trim()
      if (!name) return
      store.updateScene(this.projectId, sceneId, { name })
      close()
    })

    sheet.querySelector('#sceneDuplicateBtn')?.addEventListener('click', () => {
      const copy = store.duplicateScene(this.projectId, sceneId)
      if (copy) {
        store.setActiveScene(this.projectId, copy.id)
      }
      close()
    })

    sheet.querySelector('#sceneDeleteBtn')?.addEventListener('click', () => {
      const ok = window.confirm(`Delete "${scene.name || 'Scene'}"?`)
      if (!ok) return
      const deleted = store.deleteScene(this.projectId, sceneId)
      if (!deleted) {
        close()
        return
      }
      close()
    })

    requestAnimationFrame(() => {
      overlay.classList.add('visible')
      sheet.classList.add('visible')
    })
  }

  _closeSceneMenu() {
    if (!this._sceneMenuOverlay || !this._sceneMenuSheet) return
    const overlay = this._sceneMenuOverlay
    const sheet = this._sceneMenuSheet
    overlay.classList.remove('visible')
    sheet.classList.remove('visible')
    this._sceneMenuOverlay = null
    this._sceneMenuSheet = null
    setTimeout(() => {
      overlay.remove()
      sheet.remove()
    }, 220)
  }
}

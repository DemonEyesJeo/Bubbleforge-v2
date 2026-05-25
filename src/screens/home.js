import { store } from '../store.js'
import { push } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'

export class HomeScreen {
  constructor() {
    this._onChange = () => this._refreshList()
  }

  render() {
    const el = document.createElement('div')
    el.innerHTML = `
      <div class="status-bar">
        <span class="time">9:41</span>
        ${statusIcons()}
      </div>
      <div class="home-header">
        <h1>My Stories</h1>
        <div class="fab" id="newProjectBtn">${icons.add}</div>
      </div>
      <div class="search-bar">
        ${icons.search}
        <span style="color:var(--t3);font-size:14px;">Search stories…</span>
      </div>
      <div class="scroll-body" id="projectList" style="padding-bottom:32px;"></div>`
    return el
  }

  bind() {
    this._el.querySelector('#newProjectBtn').addEventListener('click', () => {
      this._openCreateProjectSheet()
    })
    store.on('projects-changed', this._onChange)
    this._refreshList()
  }

  resume() {
    this._refreshList()
  }

  destroy() {
    this._closeCreateProjectSheet()
    store.off('projects-changed', this._onChange)
  }

  _openCreateProjectSheet() {
    if (this._createOverlay) return

    const overlay = document.createElement('div')
    overlay.className = 'new-project-overlay'

    const sheet = document.createElement('div')
    sheet.className = 'new-project-sheet'
    sheet.innerHTML = `
      <div class="new-project-handle"></div>
      <div class="new-project-title">New Story</div>
      <div class="new-project-sub">Give your story a name before opening it.</div>
      <input id="newProjectName" class="new-project-input" type="text" maxlength="80" placeholder="My Story" />
      <div class="new-project-actions">
        <button id="cancelNewProject" class="new-project-btn ghost">Cancel</button>
        <button id="createNewProject" class="new-project-btn primary">Create</button>
      </div>
    `

    this._createOverlay = overlay
    this._createSheet = sheet
    this._el.appendChild(overlay)
    this._el.appendChild(sheet)

    const close = () => this._closeCreateProjectSheet()
    const create = () => {
      const input = sheet.querySelector('#newProjectName')
      const name = (input?.value || '').trim() || 'New Story'
      const project = store.createProject(name)
      this._closeCreateProjectSheet()
      push('conversation', { projectId: project.id })
    }

    overlay.addEventListener('click', close)
    sheet.querySelector('#cancelNewProject').addEventListener('click', close)
    sheet.querySelector('#createNewProject').addEventListener('click', create)
    sheet.querySelector('#newProjectName').addEventListener('keydown', e => {
      if (e.key === 'Enter') create()
      if (e.key === 'Escape') close()
    })

    requestAnimationFrame(() => {
      overlay.classList.add('visible')
      sheet.classList.add('visible')
      sheet.querySelector('#newProjectName')?.focus()
    })
  }

  _closeCreateProjectSheet() {
    if (!this._createOverlay || !this._createSheet) return
    const overlay = this._createOverlay
    const sheet = this._createSheet
    overlay.classList.remove('visible')
    sheet.classList.remove('visible')
    this._createOverlay = null
    this._createSheet = null
    setTimeout(() => {
      overlay.remove()
      sheet.remove()
    }, 220)
  }

  _refreshList() {
    const list = this._el.querySelector('#projectList')
    const projects = store.getProjects()

    if (!projects.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>No stories yet.<br>Tap + to create your first one.</p>
        </div>`
      return
    }

    list.innerHTML = `<div class="section-label">Recent</div>`
    list.innerHTML += projects.map(p => this._cardHTML(p)).join('')

    list.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        push('conversation', { projectId: card.dataset.projectId })
      })
    })
  }

  _cardHTML(p) {
    const colors = p.actors.map(a => a.color)
    const bubbleRows = this._coverBubbles(p, colors)
    const pips = p.actors.slice(0, 4).map((a, i) =>
      `<div class="actor-pip" style="background:${a.color};z-index:${10-i};">${a.name[0]}</div>`
    ).join('')

    const totalMessages = p.scenes.reduce((n, s) => n + s.messages.length, 0)
    const edited = this._relativeTime(p.updated_at)

    return `
      <div class="project-card" data-project-id="${p.id}">
        <div class="project-cover" style="background:${this._coverGradient(colors)};">
          <div class="project-cover-overlay"></div>
          <div class="project-cover-bubbles">${bubbleRows}</div>
        </div>
        <div class="project-info">
          <div>
            <div class="project-name">${p.name}</div>
            <div class="project-meta">${p.scenes.length} scene${p.scenes.length !== 1 ? 's' : ''} · ${totalMessages} messages · ${edited}</div>
          </div>
          <div class="actor-pips">${pips}</div>
        </div>
      </div>`
  }

  _coverBubbles(p, colors) {
    if (!colors.length) return ''
    const widths = ['55%','42%','60%','38%','50%']
    const sides  = ['right','left','right','left','right']
    return p.actors.slice(0,3).flatMap((a, i) => [
      `<div class="mini-bub" style="width:${widths[i]};background:${a.color};${a.side === 'right' ? 'margin-left:auto;' : ''}"></div>`,
    ]).slice(0, 3).join('')
  }

  _coverGradient(colors) {
    if (!colors.length) return 'linear-gradient(135deg,#0d1a2e,#0a2040)'
    const c = colors[0]
    const r = parseInt(c.slice(1,3),16)
    const g = parseInt(c.slice(3,5),16)
    const b = parseInt(c.slice(5,7),16)
    return `linear-gradient(135deg,rgba(${r},${g},${b},0.15),rgba(${r},${g},${b},0.06))`
  }

  _relativeTime(ts) {
    const diff = Date.now() - ts
    if (diff < 60000)        return 'Just now'
    if (diff < 3600000)      return `${Math.floor(diff/60000)}m ago`
    if (diff < 86400000)     return 'Today'
    if (diff < 172800000)    return 'Yesterday'
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

import { store } from '../store.js'
import { push } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'

export class HomeScreen {
  constructor() {
    this._onChange = () => this._refreshList()
    this._activeTab = 'projects'
    this._characterSort = 'name'
  }

  render() {
    const el = document.createElement('div')
    el.innerHTML = `
      <div class="status-bar">
        <span class="time">9:41</span>
        ${statusIcons()}
      </div>
      <div class="home-body" id="homeBody">
        <div class="home-header" id="homeHeader">
          <h1>My Stories</h1>
          <div class="fab" id="newProjectBtn">${icons.add}</div>
        </div>
        <div class="home-pane-wrap">
          <div class="home-pane active" data-pane="projects">
            <div class="search-bar">
              ${icons.search}
              <span style="color:var(--t3);font-size:14px;">Search stories…</span>
            </div>
            <div class="scroll-body" id="projectList" style="padding-bottom:24px;"></div>
          </div>
          <div class="home-pane" data-pane="characters">
            <div class="home-pane-actions">
              <div class="home-pane-action ghost" id="groupsBtn">Groups</div>
              <div class="home-pane-action" id="sortActorsBtn">${this._characterSort === 'name' ? 'Sort: Name' : 'Sort: Story'}</div>
              <div class="home-pane-action add" id="addActorBtn">${icons.add}</div>
            </div>
            <div class="home-pane-title">Actors</div>
            <div class="home-pane-sub">All actors across your stories</div>
            <div class="scroll-body" id="characterList" style="padding-bottom:24px;"></div>
          </div>
          <div class="home-pane" data-pane="settings">
            <div class="home-pane-title">Settings</div>
            <div class="home-pane-sub">App preferences and support</div>
            <div class="home-settings-list">
              <div class="home-setting-row">
                <div>
                  <div class="home-setting-title">Email</div>
                  <div class="home-setting-sub">Contact support</div>
                </div>
                <div class="home-setting-pill">Open</div>
              </div>
              <div class="home-setting-row muted">
                <div>
                  <div class="home-setting-title">TikTok</div>
                  <div class="home-setting-sub">Coming soon</div>
                </div>
                <div class="home-setting-pill ghost">Soon</div>
              </div>
              <div class="home-setting-row muted">
                <div>
                  <div class="home-setting-title">X / Twitter</div>
                  <div class="home-setting-sub">Coming soon</div>
                </div>
                <div class="home-setting-pill ghost">Soon</div>
              </div>
              <div class="home-setting-row">
                <div>
                  <div class="home-setting-title">Credits & licenses</div>
                  <div class="home-setting-sub">Assets and third-party notices</div>
                </div>
                <div class="home-setting-pill">Open</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="home-bottom-nav">
        <div class="home-nav-item active" data-tab="projects">
          <div class="home-nav-icon">${icons.folder}</div>
          <div class="home-nav-label">Projects</div>
        </div>
        <div class="home-nav-item" data-tab="characters">
          <div class="home-nav-icon">${icons.actors}</div>
          <div class="home-nav-label">Actors</div>
        </div>
        <div class="home-nav-item" data-tab="settings">
          <div class="home-nav-icon">${icons.settings}</div>
          <div class="home-nav-label">Settings</div>
        </div>
      </div>`
    return el
  }

  bind() {
    this._el.querySelector('#newProjectBtn').addEventListener('click', () => {
      this._openCreateProjectSheet()
    })
    this._el.querySelectorAll('.home-nav-item').forEach(item => {
      item.addEventListener('click', () => this._switchTab(item.dataset.tab))
    })
    this._el.querySelector('#groupsBtn')?.addEventListener('click', () => this._snack('Groups is not wired yet in v2.'))
    this._el.querySelector('#sortActorsBtn')?.addEventListener('click', () => {
      this._characterSort = this._characterSort === 'name' ? 'project' : 'name'
      const btn = this._el.querySelector('#sortActorsBtn')
      if (btn) btn.textContent = this._characterSort === 'name' ? 'Sort: Name' : 'Sort: Story'
      this._refreshCharacterList()
    })
    this._el.querySelector('#addActorBtn')?.addEventListener('click', () => {
      const project = store.getProjects()[0]
      if (!project) return this._snack('Create a story first.')
      push('actor-editor', { projectId: project.id, actorId: null })
    })
    store.on('projects-changed', this._onChange)
    this._refreshList()
    this._refreshCharacterList()
    this._refreshSettingsPane()
    this._switchTab(this._activeTab)
  }

  resume() {
    this._refreshList()
    this._refreshCharacterList()
    this._refreshSettingsPane()
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
    if (!list) return
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

  _refreshCharacterList() {
    const list = this._el.querySelector('#characterList')
    if (!list) return

    const rows = []
    for (const project of store.getProjects()) {
      for (const actor of project.actors || []) {
        rows.push({ project, actor })
      }
    }

    if (!rows.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <p>No actors yet.<br>Create a project first.</p>
        </div>`
      return
    }

    rows.sort((a, b) => {
      if (this._characterSort === 'project') {
        const pa = a.project.name.localeCompare(b.project.name)
        if (pa !== 0) return pa
      }
      return a.actor.name.localeCompare(b.actor.name)
    })

    list.innerHTML = rows.map(({ project, actor }) => {
      const sideLabel = actor.side === 'right' ? 'Right side' : 'Left side'
      return `
        <div class="home-actor-row" data-project-id="${project.id}" data-actor-id="${actor.id}">
          <div class="home-actor-avatar" style="background:${actor.color};">${actor.name[0]}</div>
          <div class="home-actor-copy">
            <div class="home-actor-name">${actor.name}</div>
            <div class="home-actor-sub">${project.name} · ${sideLabel}</div>
          </div>
          <div class="home-actor-arrow">›</div>
        </div>`
    }).join('')

    list.querySelectorAll('.home-actor-row').forEach(row => {
      row.addEventListener('click', () => {
        push('actor-editor', {
          projectId: row.dataset.projectId,
          actorId: row.dataset.actorId,
        })
      })
    })
  }

  _refreshSettingsPane() {
    const body = this._el.querySelector('.home-settings-list')
    if (!body) return
    body.querySelectorAll('.home-setting-row').forEach(row => {
      row.addEventListener('click', () => {
        const title = row.querySelector('.home-setting-title')?.textContent || ''
        if (title === 'Email') {
          this._snack('Support email is not wired yet in v2.')
        } else if (title === 'Credits & licenses') {
          this._snack('Credits panel is not wired yet in v2.')
        }
      })
    })
  }

  _switchTab(tab) {
    this._activeTab = tab
    this._el.querySelectorAll('.home-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab)
    })
    this._el.querySelectorAll('.home-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.pane === tab)
    })
    const header = this._el.querySelector('#homeHeader h1')
    const fab = this._el.querySelector('#newProjectBtn')
    if (header) {
      header.textContent = tab === 'projects' ? 'My Stories' : tab === 'characters' ? 'Actors' : 'Settings'
    }
    if (fab) fab.style.display = tab === 'projects' ? 'flex' : 'none'
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

  _snack(msg) {
    const s = document.createElement('div')
    s.className = 'snackbar'
    s.textContent = msg
    this._el.appendChild(s)
    setTimeout(() => {
      s.style.opacity = '0'
      s.style.transition = 'opacity 0.25s'
      setTimeout(() => s.remove(), 280)
    }, 2200)
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

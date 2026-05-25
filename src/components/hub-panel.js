import { icons } from './icons.js'
import { store } from '../store.js'
import { push } from '../router.js'

export class HubPanel {
  constructor(overlayLayer, projectId, onClose) {
    this.overlayLayer = overlayLayer
    this.projectId = projectId
    this.onClose = onClose
    this.activeTab = 'actors'
    this._el = null
  }

  mount() {
    const el = document.createElement('div')
    el.innerHTML = this._html()
    this._overlay = el.children[0]
    this._panel   = el.children[1]
    this.overlayLayer.appendChild(this._overlay)
    this.overlayLayer.appendChild(this._panel)
    this.overlayLayer.style.pointerEvents = 'all'
    this._overlay.style.pointerEvents = 'all'
    this._bind()
    requestAnimationFrame(() => {
      this._overlay.classList.add('visible')
      this._panel.classList.add('visible')
    })
  }

  dismiss() {
    this._overlay.classList.remove('visible')
    this._panel.classList.remove('visible')
    setTimeout(() => {
      this._overlay.remove()
      this._panel.remove()
      this.overlayLayer.style.pointerEvents = 'none'
      this.onClose?.()
    }, 340)
  }

  _html() {
    return `
<div class="hub-overlay"></div>
<div class="hub-panel">
  <div class="hub-rail">
    <div class="hub-rail-btn active" data-tab="actors">${icons.actors}</div>
    <div class="hub-rail-btn" data-tab="scene">${icons.scene}</div>
    <div class="hub-rail-btn" data-tab="script">${icons.script}</div>
    <div class="hub-rail-btn" data-tab="settings">${icons.settings}</div>
    <div style="flex:1;"></div>
    <div class="hub-rail-btn" id="hubClose">${icons.close}</div>
  </div>
  <div class="hub-content">
    <div class="hub-header">
      <div class="hub-header-title" id="hubTitle">Actors</div>
      <div class="hub-header-sub" id="hubSub"></div>
    </div>
    <div class="hub-body" id="hubBody"></div>
  </div>
</div>`
  }

  _bind() {
    this._overlay.addEventListener('click', () => this.dismiss())
    this._panel.querySelector('#hubClose').addEventListener('click', () => this.dismiss())

    this._panel.querySelectorAll('.hub-rail-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this._setTab(btn.dataset.tab))
    })

    this._renderTab('actors')
  }

  _setTab(tab) {
    this.activeTab = tab
    this._panel.querySelectorAll('.hub-rail-btn[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab)
    })
    this._renderTab(tab)
  }

  _renderTab(tab) {
    const p = store.getProject(this.projectId)
    if (!p) return
    const body  = this._panel.querySelector('#hubBody')
    const title = this._panel.querySelector('#hubTitle')
    const sub   = this._panel.querySelector('#hubSub')

    const scene = store.getActiveScene(this.projectId)

    if (tab === 'actors') {
      title.textContent = 'Actors'
      sub.textContent = `${p.name}`
      body.innerHTML = this._actorsTab(p)
      body.querySelectorAll('.actor-list-item').forEach(row => {
        row.addEventListener('click', () => {
          const aid = row.dataset.actorId
          this.dismiss()
          push('actor-editor', { projectId: this.projectId, actorId: aid })
        })
      })
      body.querySelector('#addActorBtn')?.addEventListener('click', () => {
        this.dismiss()
        push('actor-editor', { projectId: this.projectId, actorId: null })
      })
    } else if (tab === 'scene') {
      title.textContent = 'Scene'
      sub.textContent = scene?.name || ''
      body.innerHTML = this._sceneTab(p, scene)
      this._bindSceneTab(body, p, scene)
    } else if (tab === 'script') {
      title.textContent = 'Script'
      sub.textContent = `${p.scenes.length} scenes`
      body.innerHTML = this._scriptTab(p)
      body.querySelectorAll('.hub-list-item[data-scene-id]').forEach(row => {
        row.addEventListener('click', () => {
          store.setActiveScene(this.projectId, row.dataset.sceneId)
          this.dismiss()
        })
      })
      body.querySelector('#addSceneBtn')?.addEventListener('click', () => {
        const s = store.addScene(this.projectId, `Scene ${p.scenes.length + 1}`)
        if (s) { store.setActiveScene(this.projectId, s.id); this.dismiss() }
      })
    } else if (tab === 'settings') {
      title.textContent = 'Settings'
      sub.textContent = p.name
      body.innerHTML = this._settingsTab(p)
      body.querySelectorAll('.toggle').forEach(t => {
        t.addEventListener('click', () => {
          t.classList.toggle('on'); t.classList.toggle('off')
        })
      })
    }
  }

  _actorsTab(p) {
    const rows = p.actors.map(a => {
      const rgb = this._rgb(a.color)
      const badge = a.side === 'right'
        ? `<span class="actor-side-badge" style="background:rgba(${rgb},0.12);color:${a.color};">YOU</span>`
        : `<span class="actor-side-badge" style="background:var(--s2);color:var(--t3);">THEM</span>`
      return `
        <div class="hub-list-item actor-list-item" data-actor-id="${a.id}">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;background:${a.color};box-shadow:0 0 0 2px rgba(${rgb},0.3);">${a.name[0]}</div>
          <div class="hub-list-text">
            <div class="hub-list-title">${a.name}</div>
            <div class="hub-list-sub">${a.side === 'right' ? 'Right side' : 'Left side'}</div>
          </div>
          ${badge}
        </div>`
    }).join('')
    return rows + `
      <div class="hub-list-item" id="addActorBtn" style="margin-top:4px;">
        <div class="hub-list-icon" style="background:rgba(41,121,255,0.10);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#2979FF" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="hub-list-text"><div class="hub-list-title" style="color:var(--accent);">Add actor</div></div>
      </div>`
  }

  _sceneTab(p, scene) {
    if (!scene) return '<p style="padding:20px;color:var(--t3);">No scene selected.</p>'
    return `
      <div class="form-field">
        <label>Scene Name</label>
        <input id="sceneNameInput" type="text" value="${scene.name}" />
      </div>
      <div class="form-field">
        <label>Quote / Subtitle</label>
        <input id="sceneQuoteInput" type="text" value="${scene.quote || ''}" placeholder="Optional scene quote…" />
      </div>
      <div class="btn-primary" id="saveSceneBtn" style="margin-top:4px;">Save Scene</div>
      ${p.scenes.length > 1 ? `<div class="btn-danger" id="deleteSceneBtn">Delete Scene</div>` : ''}`
  }

  _bindSceneTab(body, p, scene) {
    body.querySelector('#saveSceneBtn')?.addEventListener('click', () => {
      const name  = body.querySelector('#sceneNameInput')?.value.trim()
      const quote = body.querySelector('#sceneQuoteInput')?.value.trim()
      if (name) store.updateScene(this.projectId, scene.id, { name, quote })
      this.dismiss()
    })
    body.querySelector('#deleteSceneBtn')?.addEventListener('click', () => {
      store.deleteScene(this.projectId, scene.id)
      this.dismiss()
    })
  }

  _scriptTab(p) {
    const activeId = p.active_scene_id
    const rows = p.scenes.map(s => {
      const isActive = s.id === activeId
      const style = isActive
        ? 'background:rgba(41,121,255,0.06);border-left:2px solid var(--accent);'
        : ''
      return `
        <div class="hub-list-item" data-scene-id="${s.id}" style="${style}">
          <div class="hub-list-icon" style="background:${isActive ? 'rgba(41,121,255,0.12)' : 'var(--s2)'};">
            ${icons.script}
          </div>
          <div class="hub-list-text">
            <div class="hub-list-title">${s.name}</div>
            <div class="hub-list-sub">${s.messages.length} message${s.messages.length !== 1 ? 's' : ''}${isActive ? ' · Active' : ''}</div>
          </div>
          <div class="hub-list-chev">${icons.chev}</div>
        </div>`
    }).join('')
    return rows + `
      <div class="hub-list-item" id="addSceneBtn" style="margin-top:4px;">
        <div class="hub-list-icon" style="background:rgba(41,121,255,0.10);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#2979FF" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="hub-list-text"><div class="hub-list-title" style="color:var(--accent);">Add scene</div></div>
      </div>`
  }

  _settingsTab(p) {
    const rs = p.render_settings || {}
    return `
      <div style="padding:0 18px;">
        <div class="toggle-row">
          <div class="toggle-row-text"><div class="toggle-row-label">Show actor names</div></div>
          <div class="toggle ${rs.show_names ? 'on' : 'off'}"></div>
        </div>
        <div class="toggle-row">
          <div class="toggle-row-text"><div class="toggle-row-label">Show timestamps</div></div>
          <div class="toggle ${rs.show_timestamps !== false ? 'on' : 'off'}"></div>
        </div>
        <div class="toggle-row">
          <div class="toggle-row-text"><div class="toggle-row-label">Dark background</div></div>
          <div class="toggle on"></div>
        </div>
      </div>`
  }

  _rgb(hex) {
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    return `${r},${g},${b}`
  }
}

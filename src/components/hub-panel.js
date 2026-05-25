import { icons } from './icons.js'
import { store } from '../store.js'
import { push } from '../router.js'
import { renderStatusBar, STATUS_ICON_GROUPS } from './status-bar.js'

const BUILTIN_STATUS_TEMPLATES = [
  { id: 'builtin-late-night', emoji: '🌙', name: 'Late Night', status_bar: { time: '2:47 AM', carrier: '', network: '', signal: 'none', wifi: 'off', battery: 'low', icons: ['sleep_focus'] } },
  { id: 'builtin-last-message', emoji: '💀', name: 'Last Message', status_bar: { time: '4:13 AM', carrier: 'No Service', network: '', signal: 'sos', wifi: 'off', battery: 'critical', icons: ['sos_active'] } },
  { id: 'builtin-driving', emoji: '🚗', name: 'Driving', status_bar: { time: '9:41 AM', carrier: 'T-Mobile', network: 'LTE', signal: 'full', wifi: 'off', battery: 'medium', icons: ['driving_focus'] } },
  { id: 'builtin-taking-off', emoji: '✈️', name: 'Taking Off', status_bar: { time: '11:22 PM', carrier: '', network: '', signal: 'airplane', wifi: 'off', battery: 'full', icons: ['headphones'] } },
  { id: 'builtin-stranded', emoji: '🏔️', name: 'Stranded', status_bar: { time: '3:34 PM', carrier: 'Searching', network: '', signal: 'sos', wifi: 'off', battery: 'critical', icons: ['location'] } },
  { id: 'builtin-running', emoji: '🌍', name: 'Running', status_bar: { time: '4:47 AM', carrier: 'Roaming', network: '', signal: '1bar', wifi: 'off', battery: 'critical', icons: ['roaming'] } },
  { id: 'builtin-work-phone', emoji: '💼', name: 'Work Phone', status_bar: { time: '10:15 AM', carrier: 'Work', network: 'LTE', signal: 'full', wifi: 'full', battery: 'full', icons: ['work_focus', 'managed_device'] } },
  { id: 'builtin-anonymous', emoji: '🕵️', name: 'Anonymous', status_bar: { time: '6:31 PM', carrier: '', network: '', signal: 'none', wifi: 'weak', battery: 'medium', icons: ['vpn'] } },
  { id: 'builtin-on-record', emoji: '📹', name: 'On Record', status_bar: { time: '11:59 PM', carrier: 'Verizon', network: '5G', signal: 'full', wifi: 'full', battery: 'full', icons: ['screen_recording'] } },
  { id: 'builtin-woke-up', emoji: '😴', name: 'Woke Up', status_bar: { time: '5:03 AM', carrier: 'AT&T', network: 'LTE', signal: 'full', wifi: 'full', battery: 'medium', icons: ['alarm_set'] } },
  { id: 'builtin-emergency', emoji: '🆘', name: 'Emergency', status_bar: { time: '2:14 AM', carrier: '', network: '', signal: 'sos', wifi: 'off', battery: 'critical', icons: ['sos_active', 'location'] } },
  { id: 'builtin-party', emoji: '🎉', name: 'Party', status_bar: { time: '12:47 AM', carrier: 'T-Mobile', network: '5G', signal: 'full', wifi: 'full', battery: 'full', icons: ['music_playing', 'airpods'] } },
  { id: 'builtin-left-read', emoji: '💔', name: 'Left on Read', status_bar: { time: '3:00 PM', carrier: 'Verizon', network: 'LTE', signal: 'full', wifi: 'full', battery: 'medium', icons: [] } },
  { id: 'builtin-lazy-sunday', emoji: '🏠', name: 'Lazy Sunday', status_bar: { time: '11:34 AM', carrier: 'Home WiFi', network: '', signal: 'none', wifi: 'full', battery: 'full', charging: true, icons: ['music_playing'] } },
  { id: 'builtin-underground', emoji: '🚇', name: 'Underground', status_bar: { time: '8:22 AM', carrier: 'Searching', network: '', signal: 'none', wifi: 'off', battery: 'medium', icons: ['headphones'] } },
  { id: 'builtin-dnd', emoji: '😤', name: 'Do Not Disturb', status_bar: { time: '7:45 PM', carrier: 'Verizon', network: 'LTE', signal: 'full', wifi: 'full', battery: 'medium', icons: ['dnd', 'notifications_silenced'] } },
  { id: 'builtin-gringotts', emoji: '🧙', name: 'Gringotts', status_bar: { time: '9:41', carrier: 'Gringotts Mobile', network: 'MAGIC', signal: 'full', wifi: 'full', battery: 'full', icons: [] } },
  { id: 'builtin-holonet', emoji: '⚡', name: 'HoloNet', status_bar: { time: '9:41', carrier: 'HoloNet', network: 'IMPERIAL', signal: '3bar', wifi: 'medium', battery: 'full', icons: ['work_focus'] } },
]

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
    <div class="hub-rail-btn" data-tab="script" title="Scenes" aria-label="Scenes">${icons.script}</div>
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
      body.querySelectorAll('[data-actor-reorder]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const actorId = btn.dataset.actorId
          const direction = Number(btn.dataset.actorReorder)
          if (!actorId || Number.isNaN(direction) || btn.disabled) return
          store.reorderActor(this.projectId, actorId, direction)
          this._renderTab('actors')
        })
      })
      body.querySelectorAll('[data-actor-side-toggle]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const actorId = btn.dataset.actorId
          const currentSide = btn.dataset.actorSide || 'left'
          if (!actorId) return
          const newSide = currentSide === 'left' ? 'right' : 'left'
          store.updateActor(this.projectId, actorId, { side: newSide })
          this._renderTab('actors')
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
      title.textContent = 'Scenes'
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
      body.querySelector('#duplicateSceneBtn')?.addEventListener('click', () => {
        const activeScene = store.getActiveScene(this.projectId)
        if (!activeScene) return
        const copy = store.duplicateScene(this.projectId, activeScene.id)
        if (copy) {
          store.setActiveScene(this.projectId, copy.id)
          this.dismiss()
        }
      })
      body.querySelector('#clearSceneBtn')?.addEventListener('click', () => {
        const activeScene = store.getActiveScene(this.projectId)
        if (!activeScene) return
        const ok = window.confirm(`Clear all messages from "${activeScene.name}"?`)
        if (!ok) return
        const cleared = store.clearSceneMessages(this.projectId, activeScene.id)
        if (cleared) {
          this.dismiss()
        } else {
          this._snack('This scene is already empty.')
        }
      })
    } else if (tab === 'settings') {
      title.textContent = 'Settings'
      sub.textContent = p.name
      body.innerHTML = this._settingsTab(p)
      body.querySelectorAll('.toggle').forEach(t => {
        t.addEventListener('click', () => {
          const key = t.dataset.key
          if (!key) return
          const next = !(p.render_settings?.[key] !== false)
          store.updateRenderSettings(this.projectId, { [key]: next })
          this._renderTab('settings')
        })
      })
    }
  }

  _actorsTab(p) {
    const lastIdx = (p.actors?.length || 1) - 1
    const rows = p.actors.map((a, idx) => {
      const rgb = this._rgb(a.color)
      const badge = a.side === 'right'
        ? `<span class="actor-side-badge" style="background:rgba(${rgb},0.12);color:${a.color};">YOU</span>`
        : `<span class="actor-side-badge" style="background:var(--s2);color:var(--t3);">THEM</span>`
      const upDisabled = idx === 0
      const downDisabled = idx === lastIdx
      return `
        <div class="hub-list-item actor-list-item" data-actor-id="${a.id}">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;background:${a.color};box-shadow:0 0 0 2px rgba(${rgb},0.3);">${a.name[0]}</div>
          <div class="hub-list-text">
            <div class="hub-list-title">${a.name}</div>
            <div class="hub-list-sub">${a.side === 'right' ? 'Right side' : 'Left side'}</div>
          </div>
          <button class="actor-side-toggle" type="button" data-actor-side-toggle="1" data-actor-id="${a.id}" data-actor-side="${a.side}">
            <span class="actor-side-pill ${a.side === 'left' ? 'active' : ''}">◀ Left</span>
            <span class="actor-side-pill ${a.side === 'right' ? 'active' : ''}">Right ▶</span>
          </button>
          <div class="actor-reorder" role="group" aria-label="Reorder actor">
            <button class="actor-reorder-btn" type="button" data-actor-reorder="-1" data-actor-id="${a.id}" ${upDisabled ? 'disabled' : ''} aria-label="Move actor up">▲</button>
            <button class="actor-reorder-btn" type="button" data-actor-reorder="1" data-actor-id="${a.id}" ${downDisabled ? 'disabled' : ''} aria-label="Move actor down">▼</button>
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
    const status = store.getSceneStatusBar(this.projectId, scene.id)
    const quick = store.getStatusQuickpicks()
    const actorColorRows = (p.actors || []).map(actor => {
      const effective = store.getEffectiveActor(this.projectId, scene.id, actor.id)
      const overrideColor = scene?.actor_overrides?.[actor.id]?.color
      return `
        <div class="hub-list-item" style="margin-top:6px;">
          <div class="avatar" style="width:30px;height:30px;font-size:12px;background:${effective.color || actor.color};">${(actor.name || '?')[0]}</div>
          <div class="hub-list-text">
            <div class="hub-list-title">${actor.name}</div>
            <div class="hub-list-sub">Scene color override</div>
          </div>
          <input data-scene-actor-color="${actor.id}" type="color" value="${effective.color || actor.color}" style="width:28px;height:28px;border:0;background:transparent;padding:0;cursor:pointer;" />
          <button data-scene-actor-reset="${actor.id}" type="button" style="margin-left:8px;border:0;background:transparent;color:${overrideColor ? 'var(--accent)' : 'var(--t4)'};font-size:12px;cursor:${overrideColor ? 'pointer' : 'default'};">↺ Reset</button>
        </div>`
    }).join('')
    return `
      <div class="form-field">
        <label>Scene Name</label>
        <input id="sceneNameInput" type="text" value="${scene.name}" />
      </div>
      <div class="form-field">
        <label>Quote / Subtitle</label>
        <input id="sceneQuoteInput" type="text" value="${scene.quote || ''}" placeholder="Optional scene quote…" />
      </div>
      <div class="form-field">
        <label>Actor Colors (Scene)</label>
        ${actorColorRows}
      </div>
      <div class="btn-primary" id="saveSceneBtn" style="margin-top:4px;">Save Scene</div>
      ${p.scenes.length > 1 ? `<div class="btn-danger" id="deleteSceneBtn">Delete Scene</div>` : ''}
      <div class="status-editor-wrap">
        <button class="status-editor-head" id="statusToggleBtn" type="button">
          <span>Status Bar</span>
          <span class="status-editor-head-actions">
            <span class="status-template-link" id="statusTemplatesBtn">Templates →</span>
            <span id="statusToggleChevron">▾</span>
          </span>
        </button>
        <div class="status-editor-body" id="statusEditorBody">
          <div class="status-preview">${renderStatusBar(status)}</div>

          <div class="form-field">
            <label>Time</label>
            <input id="statusTimeInput" type="text" value="${status.time || ''}" placeholder="9:41" />
            <div class="status-quick-row">${this._quickpickHTML('time', quick.time || [])}<button class="status-save-qp" data-quickpick-save="time" type="button">+ Save</button></div>
          </div>

          <div class="form-field">
            <label>Carrier</label>
            <input id="statusCarrierInput" type="text" value="${status.carrier || ''}" placeholder="Verizon" />
            <div class="status-quick-row">${this._quickpickHTML('carrier', quick.carrier || [])}<button class="status-save-qp" data-quickpick-save="carrier" type="button">+ Save</button></div>
          </div>

          <div class="form-field">
            <label>Network Badge</label>
            <input id="statusNetworkInput" type="text" value="${status.network || ''}" placeholder="LTE" />
            <div class="status-quick-row">${this._quickpickHTML('network', quick.network || [])}<button class="status-save-qp" data-quickpick-save="network" type="button">+ Save</button></div>
          </div>

          <div class="form-field">
            <label>Signal</label>
            <div class="status-pill-row">${this._pillRow('signal', ['full', '3bar', '2bar', '1bar', 'none', 'sos', 'airplane'], status.signal)}</div>
          </div>

          <div class="form-field">
            <label>WiFi</label>
            <div class="status-pill-row">${this._pillRow('wifi', ['full', 'medium', 'weak', 'off'], status.wifi)}</div>
          </div>

          <div class="form-field">
            <label>Battery</label>
            <div class="status-pill-row">${this._pillRow('battery', ['full', 'medium', 'low', 'critical', 'dead'], status.battery)}</div>
            <div class="status-toggle-row">
              ${this._boolChip('charging', '⚡ Charging', status.charging)}
              ${this._boolChip('low_power', 'Low power', status.low_power)}
              ${this._boolChip('show_percent', 'Show %', status.show_percent)}
            </div>
          </div>

          <div class="form-field">
            <label>Status Icons</label>
            ${Object.entries(STATUS_ICON_GROUPS).map(([group, keys]) => `
              <div class="status-icon-group">
                <div class="status-icon-group-title">${group}</div>
                <div class="status-icon-grid">${keys.map(key => this._iconChip(key, status.icons || [])).join('')}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`
  }

  _bindSceneTab(body, p, scene) {
    body.querySelector('#saveSceneBtn')?.addEventListener('click', () => {
      const name  = body.querySelector('#sceneNameInput')?.value.trim()
      const quote = body.querySelector('#sceneQuoteInput')?.value.trim()
      if (name) store.updateScene(this.projectId, scene.id, { name, quote })
      this.dismiss()
    })
    body.querySelector('#deleteSceneBtn')?.addEventListener('click', () => {
      const deleted = store.deleteScene(this.projectId, scene.id)
      if (deleted) {
        this.dismiss()
      } else {
        this._snack('At least one scene is required.')
      }
    })

    const editorBody = body.querySelector('#statusEditorBody')
    const chevron = body.querySelector('#statusToggleChevron')
    const setExpanded = (expanded) => {
      if (!editorBody || !chevron) return
      editorBody.classList.toggle('open', expanded)
      chevron.textContent = expanded ? '▴' : '▾'
    }
    setExpanded(false)

    body.querySelector('#statusToggleBtn')?.addEventListener('click', (e) => {
      if (e.target.closest('#statusTemplatesBtn')) return
      const next = !editorBody?.classList.contains('open')
      setExpanded(next)
    })

    body.querySelector('#statusTemplatesBtn')?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this._openStatusTemplateSheet(scene.id)
    })

    const refreshSceneTab = () => this._renderTab('scene')
    const updateStatus = (patch) => {
      store.updateSceneStatusBar(this.projectId, scene.id, patch)
      refreshSceneTab()
    }

    body.querySelector('#statusTimeInput')?.addEventListener('input', (e) => updateStatus({ time: e.target.value }))
    body.querySelector('#statusCarrierInput')?.addEventListener('input', (e) => updateStatus({ carrier: e.target.value }))
    body.querySelector('#statusNetworkInput')?.addEventListener('input', (e) => updateStatus({ network: e.target.value }))

    body.querySelectorAll('[data-status-field][data-status-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        updateStatus({ [btn.dataset.statusField]: btn.dataset.statusValue })
      })
    })

    body.querySelectorAll('[data-status-bool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.statusBool
        const current = store.getSceneStatusBar(this.projectId, scene.id)
        updateStatus({ [key]: !current[key] })
      })
    })

    body.querySelectorAll('[data-status-icon]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.statusIcon
        const current = store.getSceneStatusBar(this.projectId, scene.id)
        const currentIcons = Array.isArray(current.icons) ? current.icons : []
        const exists = currentIcons.includes(key)
        const icons = exists ? currentIcons.filter(v => v !== key) : [...currentIcons, key]
        updateStatus({ icons })
      })
    })

    body.querySelectorAll('[data-quickpick-value]').forEach(chip => {
      chip.addEventListener('click', () => {
        const field = chip.dataset.quickpickField
        const value = chip.dataset.quickpickValue
        if (!field) return
        updateStatus({ [field]: value })
      })
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const field = chip.dataset.quickpickField
        const value = chip.dataset.quickpickValue
        if (!field || !value) return
        store.removeStatusQuickpick(field, value)
        refreshSceneTab()
      })
    })

    body.querySelectorAll('[data-quickpick-save]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.quickpickSave
        const map = {
          time: '#statusTimeInput',
          carrier: '#statusCarrierInput',
          network: '#statusNetworkInput',
        }
        const v = body.querySelector(map[field])?.value.trim()
        if (!v) return
        store.addStatusQuickpick(field, v)
        refreshSceneTab()
      })
    })

    body.querySelectorAll('[data-scene-actor-color]').forEach(input => {
      input.addEventListener('input', () => {
        const actorId = input.dataset.sceneActorColor
        if (!actorId) return
        store.updateSceneActorOverride(this.projectId, scene.id, actorId, { color: input.value })
        refreshSceneTab()
      })
    })

    body.querySelectorAll('[data-scene-actor-reset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const actorId = btn.dataset.sceneActorReset
        if (!actorId) return
        const hasOverride = scene?.actor_overrides?.[actorId]?.color
        if (!hasOverride) return
        store.updateSceneActorOverride(this.projectId, scene.id, actorId, { color: null })
        refreshSceneTab()
      })
    })
  }

  _quickpickHTML(field, values) {
    return values.map(v => `<button class="status-quick-chip" type="button" data-quickpick-field="${field}" data-quickpick-value="${v}">${v}</button>`).join('')
  }

  _pillRow(field, values, active) {
    return values.map(v => `<button class="status-pill ${v === active ? 'active' : ''}" type="button" data-status-field="${field}" data-status-value="${v}">${v}</button>`).join('')
  }

  _boolChip(key, label, active) {
    return `<button class="status-pill ${active ? 'active' : ''}" type="button" data-status-bool="${key}">${label}</button>`
  }

  _iconChip(key, activeIcons) {
    const active = Array.isArray(activeIcons) && activeIcons.includes(key)
    const label = key.replace(/_/g, ' ')
    return `<button class="status-icon-chip ${active ? 'active' : ''}" type="button" data-status-icon="${key}" title="${label}">${label}</button>`
  }

  _openStatusTemplateSheet(sceneId) {
    const sceneStatus = store.getSceneStatusBar(this.projectId, sceneId)
    const userTemplates = store.getStatusTemplates()
    const builtins = BUILTIN_STATUS_TEMPLATES
    const sheetWrap = document.createElement('div')
    sheetWrap.className = 'status-template-sheet-wrap'
    sheetWrap.innerHTML = `
      <div class="status-template-sheet-overlay"></div>
      <div class="status-template-sheet">
        <div class="status-template-head">
          <div>Status Templates</div>
          <button id="statusTemplateClose" type="button">✕</button>
        </div>
        <div class="status-template-section-title">Built-in presets</div>
        <div class="status-template-grid">
          ${builtins.map(t => `<div class="status-template-card"><div class="status-template-name">${t.emoji} ${t.name}</div><div class="status-template-preview">${renderStatusBar(t.status_bar)}</div><button type="button" data-template-apply="${t.id}">Apply</button></div>`).join('')}
        </div>
        <div class="status-template-section-title">Your templates</div>
        <div class="status-template-grid" id="userTemplateGrid">
          ${userTemplates.length ? userTemplates.map(t => `<div class="status-template-card"><div class="status-template-name">${t.emoji || '⭐'} ${t.name}</div><div class="status-template-preview">${renderStatusBar(t.status_bar)}</div><div class="status-template-actions"><button type="button" data-user-template-apply="${t.id}">Apply</button><button type="button" data-user-template-share="${t.id}">Share</button><button type="button" data-user-template-rename="${t.id}">Rename</button><button type="button" data-user-template-delete="${t.id}">Delete</button></div></div>`).join('') : '<div class="status-template-empty">No saved templates yet.</div>'}
        </div>
        <div class="status-template-footer">
          <button type="button" id="statusTemplateSaveCurrent">Save current as template</button>
          <button type="button" id="statusTemplateImport">Import template</button>
        </div>
      </div>`

    const close = () => sheetWrap.remove()
    sheetWrap.querySelector('.status-template-sheet-overlay')?.addEventListener('click', close)
    sheetWrap.querySelector('#statusTemplateClose')?.addEventListener('click', close)

    const applyTemplate = (row) => {
      store.updateSceneStatusBar(this.projectId, sceneId, row.status_bar || {})
      this._renderTab('scene')
      close()
    }

    sheetWrap.querySelectorAll('[data-template-apply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = builtins.find(t => t.id === btn.dataset.templateApply)
        if (!row) return
        applyTemplate(row)
      })
    })

    sheetWrap.querySelectorAll('[data-user-template-apply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = store.getStatusTemplates().find(t => t.id === btn.dataset.userTemplateApply)
        if (!row) return
        applyTemplate(row)
      })
    })

    sheetWrap.querySelectorAll('[data-user-template-share]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = store.getStatusTemplates().find(t => t.id === btn.dataset.userTemplateShare)
        if (!row) return
        const code = `bf1:${btoa(JSON.stringify({ name: row.name, emoji: row.emoji, status_bar: row.status_bar }))}`
        try {
          await navigator.clipboard.writeText(code)
          this._snack('Template copied - share it anywhere')
        } catch {
          window.prompt('Copy this template code', code)
        }
      })
    })

    sheetWrap.querySelectorAll('[data-user-template-rename]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = store.getStatusTemplates().find(t => t.id === btn.dataset.userTemplateRename)
        if (!row) return
        const nextName = window.prompt('Rename template', row.name || '')?.trim()
        if (!nextName) return
        const all = store.getStatusTemplates().map(t => t.id === row.id ? { ...t, name: nextName } : t)
        localStorage.setItem('bf_status_templates', JSON.stringify(all))
        close()
        this._openStatusTemplateSheet(sceneId)
      })
    })

    sheetWrap.querySelectorAll('[data-user-template-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.userTemplateDelete
        if (!id) return
        const ok = window.confirm('Delete this template?')
        if (!ok) return
        store.deleteStatusTemplate(id)
        close()
        this._openStatusTemplateSheet(sceneId)
      })
    })

    sheetWrap.querySelector('#statusTemplateSaveCurrent')?.addEventListener('click', () => {
      const name = window.prompt('Template name')?.trim()
      if (!name) return
      const emoji = window.prompt('Emoji', '⭐')?.trim() || '⭐'
      store.saveStatusTemplate({ name, emoji, status_bar: sceneStatus })
      close()
      this._openStatusTemplateSheet(sceneId)
    })

    sheetWrap.querySelector('#statusTemplateImport')?.addEventListener('click', () => {
      const raw = window.prompt('Paste bf1 template code')?.trim()
      if (!raw) return
      try {
        const payload = raw.startsWith('bf1:') ? raw.slice(4) : raw
        const parsed = JSON.parse(atob(payload))
        store.saveStatusTemplate({
          name: parsed.name || 'Imported',
          emoji: parsed.emoji || '⭐',
          status_bar: parsed.status_bar || {},
        })
        this._snack('Template imported')
        close()
        this._openStatusTemplateSheet(sceneId)
      } catch {
        this._snack('Invalid template code')
      }
    })

    this.overlayLayer.appendChild(sheetWrap)
  }

  _snack(msg) {
    const s = document.createElement('div')
    s.className = 'snackbar'
    s.textContent = msg
    this.overlayLayer.appendChild(s)
    this.overlayLayer.style.pointerEvents = 'all'
    setTimeout(() => {
      s.style.opacity = '0'
      s.style.transition = 'opacity 0.25s'
      setTimeout(() => s.remove(), 280)
    }, 2200)
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
      <div class="hub-list-item" id="duplicateSceneBtn" style="margin-top:4px;">
        <div class="hub-list-icon" style="background:rgba(41,121,255,0.10);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="7" y="7" width="10" height="10" rx="2" stroke="#2979FF" stroke-width="2"/><rect x="4" y="4" width="10" height="10" rx="2" stroke="#2979FF" stroke-width="2" opacity="0.45"/></svg>
        </div>
        <div class="hub-list-text"><div class="hub-list-title" style="color:var(--accent);">Duplicate active scene</div></div>
      </div>
      <div class="hub-list-item" id="clearSceneBtn" style="margin-top:4px;">
        <div class="hub-list-icon" style="background:rgba(245,0,87,0.12);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M8 10v7M12 10v7M16 10v7" stroke="#F50057" stroke-width="2" stroke-linecap="round"/><path d="M6 7l1 12h10l1-12" stroke="#F50057" stroke-width="2"/></svg>
        </div>
        <div class="hub-list-text"><div class="hub-list-title" style="color:var(--danger);">Clear active scene messages</div></div>
      </div>
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
          <div class="toggle ${rs.show_names !== false ? 'on' : 'off'}" data-key="show_names"></div>
        </div>
        <div class="toggle-row">
          <div class="toggle-row-text"><div class="toggle-row-label">Show timestamps</div></div>
          <div class="toggle ${rs.show_timestamps !== false ? 'on' : 'off'}" data-key="show_timestamps"></div>
        </div>
        <div class="toggle-row">
          <div class="toggle-row-text"><div class="toggle-row-label">Dark background</div></div>
          <div class="toggle ${rs.dark_background !== false ? 'on' : 'off'}" data-key="dark_background"></div>
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

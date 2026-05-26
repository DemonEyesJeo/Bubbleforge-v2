import { icons } from './icons.js'
import { store } from '../store.js'
import { push } from '../router.js'
import { renderStatusBar, STATUS_ICON_GROUPS } from './status-bar.js'

const SCRIPT_FONT_OPTIONS = ['System UI']

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

const BUILTIN_TEMPLATE_CATEGORIES = {
  'builtin-late-night': 'night',
  'builtin-last-message': 'night',
  'builtin-woke-up': 'night',
  'builtin-taking-off': 'travel',
  'builtin-stranded': 'travel',
  'builtin-running': 'travel',
  'builtin-underground': 'travel',
  'builtin-work-phone': 'work',
  'builtin-on-record': 'work',
  'builtin-left-read': 'drama',
  'builtin-dnd': 'drama',
  'builtin-anonymous': 'drama',
  'builtin-gringotts': 'sci-fi',
  'builtin-holonet': 'sci-fi',
  'builtin-emergency': 'special',
  'builtin-party': 'special',
  'builtin-lazy-sunday': 'special',
  'builtin-driving': 'special',
}

export class HubPanel {
  constructor(overlayLayer, projectId, onClose, initialTab = 'actors', conversationScreen = null) {
    this.overlayLayer = overlayLayer
    this.projectId = projectId
    this.onClose = onClose
    this.activeTab = initialTab
    this.conversationScreen = conversationScreen
    this._importExpandedProjectId = ''
    this._statusTemplateCategory = 'all'
    this._statusActiveZone = 'left'
    this._statusZoneOpen = { left: true, center: true, right: true }
    this._statusDraft = null
    this._suppressProjectRender = false
    this._el = null
    this._onProjectChange = (changedProjectId) => {
      if (changedProjectId && changedProjectId !== this.projectId) return
      if (!this._panel?.isConnected) return
      if (this._suppressProjectRender) return
      this._renderTab(this.activeTab)
    }
  }

  mount() {
    const el = document.createElement('div')
    el.innerHTML = this._html()
    this._overlay = el.children[0]
    this._panel   = el.children[1]
    this.overlayLayer.appendChild(this._overlay)
    this.overlayLayer.appendChild(this._panel)
    store.on('project-changed', this._onProjectChange)
    this.overlayLayer.style.pointerEvents = 'all'
    this._overlay.style.pointerEvents = 'all'
    this._bind()
    requestAnimationFrame(() => {
      this._overlay.classList.add('visible')
      this._panel.classList.add('visible')
    })
  }

  dismiss() {
    store.off('project-changed', this._onProjectChange)
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
    <div class="hub-rail-btn" data-tab="import">${icons.actorImport}</div>
    <div class="hub-rail-btn" data-tab="script" title="Script Export" aria-label="Script Export">${icons.script}</div>
    <div class="hub-rail-btn" data-tab="scene">${icons.clapper}</div>
    <div class="hub-rail-btn" data-tab="status" title="Status" aria-label="Status"><span class="hub-rail-glyph">▤</span></div>
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

    this._setTab(this.activeTab)
  }

  _setTab(tab) {
    this.activeTab = tab
    if (tab !== 'status') {
      this._statusDraft = null
    }
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
          push('actor-editor', { projectId: this.projectId, actorId: aid, sceneId: scene?.id || null })
        })
      })
      body.querySelectorAll('[data-actor-edit]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const actorId = btn.dataset.actorId
          if (!actorId) return
          this.dismiss()
          push('actor-editor', { projectId: this.projectId, actorId, sceneId: scene?.id || null })
        })
      })
      body.querySelectorAll('[data-actor-side]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const actorId = btn.dataset.actorId
          const nextSide = btn.dataset.actorSide
          if (!actorId || !nextSide) return
          store.updateActor(this.projectId, actorId, { side: nextSide })
        })
      })
      body.querySelector('#addActorBtn')?.addEventListener('click', () => {
        this.dismiss()
        push('actor-editor', { projectId: this.projectId, actorId: null })
      })
    } else if (tab === 'import') {
      title.textContent = 'Import Actors'
      sub.textContent = 'Reuse actors from other stories'
      body.innerHTML = this._importActorsTab(p)
      body.querySelectorAll('[data-import-project]').forEach(btn => {
        btn.addEventListener('click', () => {
          const projectId = btn.dataset.importProject || ''
          this._importExpandedProjectId = this._importExpandedProjectId === projectId ? '' : projectId
          this._renderTab('import')
        })
      })
      body.querySelectorAll('[data-import-actor]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sourceProjectId = btn.dataset.sourceProjectId
          const actorId = btn.dataset.importActor
          const sourceProject = store.getProject(sourceProjectId)
          const sourceActor = sourceProject?.actors?.find(actor => actor.id === actorId)
          if (!sourceActor) return
          store.addActor(this.projectId, sourceActor.name, sourceActor.color, sourceActor.side, sourceActor.avatar)
          this._snack(`Imported ${sourceActor.name}`)
        })
      })
    } else if (tab === 'scene') {
      title.textContent = 'Scene Editor'
      sub.textContent = scene?.name || ''
      body.innerHTML = this._sceneTab(p, scene)
      this._bindSceneTab(body, p, scene)
    } else if (tab === 'script') {
      title.textContent = 'Script Export'
      sub.textContent = 'Layout and export settings'
      body.innerHTML = this._scriptTab(p)
      this._bindScriptSubTabs(body)
      this._bindRenderSettingsControls(body)
      body.querySelector('#scriptExportBtn')?.addEventListener('click', () => this._exportScriptProject())
    } else if (tab === 'status') {
      title.textContent = 'Status'
      sub.textContent = scene?.name || ''
      body.innerHTML = this._statusTab(p, scene)
      this._bindStatusTab(body, scene)
    } else if (tab === 'settings') {
      title.textContent = 'Story Settings'
      sub.textContent = p.name
      body.innerHTML = this._settingsTab(p)
      this._bindRenderSettingsControls(body)
    }
  }

  _actorsTab(p) {
    const rows = p.actors.map(a => {
      const rgb = this._rgb(a.color)
      const sideArrow = a.side === 'right' ? '◀' : '▶'
      const sideTarget = a.side === 'right' ? 'left' : 'right'
      const avatar = a.avatar
        ? `<img class="actor-row-avatar-img" src="${this._esc(a.avatar)}" alt="${this._esc(a.name)}" />`
        : `${a.name[0]}`
      return `
        <div class="hub-list-item actor-list-item" data-actor-id="${a.id}">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;background:${a.color};box-shadow:0 0 0 2px rgba(${rgb},0.3);">${avatar}</div>
          <div class="hub-list-text">
            <div class="hub-list-title">${a.name}</div>
            <div class="hub-list-sub">${a.side === 'right' ? 'Right side' : 'Left side'}</div>
          </div>
          <button class="actor-control-btn actor-edit-btn" type="button" data-actor-edit="1" data-actor-id="${a.id}" title="Edit actor">
            ${icons.edit}
          </button>
          <button class="actor-control-btn actor-side-btn" type="button" data-actor-id="${a.id}" data-actor-side="${sideTarget}" title="Move to ${sideTarget} side">${sideArrow}</button>
        </div>`
    }).join('')
    return rows + `
      <div class="hub-list-item" id="addActorBtn" style="margin-top:4px;">
        <div class="hub-list-icon" style="background:rgba(var(--accent-rgb),0.10);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="hub-list-text"><div class="hub-list-title" style="color:var(--accent);">Add actor</div></div>
      </div>`
  }

  _importActorsTab(project) {
    const otherProjects = store.getProjects().filter(row => row.id !== project.id)
    if (!otherProjects.length) {
      return `<div class="hub-empty-note">No other stories available yet.</div>`
    }
    return `
      <div class="hub-tab-scroll">
        ${otherProjects.map(row => {
          const expanded = this._importExpandedProjectId === row.id
          return `
            <div class="hub-expand-card ${expanded ? 'open' : ''}">
              <button class="hub-expand-head" type="button" data-import-project="${row.id}">
                <span>${row.name}</span>
                <span>${expanded ? '▾' : '▸'}</span>
              </button>
              ${expanded ? `
                <div class="hub-expand-body">
                  ${(row.actors || []).length ? row.actors.map(actor => `
                    <button class="hub-import-actor" type="button" data-import-actor="${actor.id}" data-source-project-id="${row.id}">
                      <span class="hub-import-actor-avatar" style="background:${actor.color};">${(actor.name || '?')[0]}</span>
                      <span class="hub-import-actor-copy">
                        <span class="hub-import-actor-name">${actor.name}</span>
                        <span class="hub-import-actor-side">${actor.side === 'right' ? 'Right side' : 'Left side'}</span>
                      </span>
                      <span class="hub-import-actor-cta">Import</span>
                    </button>`).join('') : '<div class="hub-empty-note inline">No actors in this story.</div>'}
                </div>` : ''}
            </div>`
        }).join('')}
      </div>`
  }

  _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  _sceneTab(p, scene) {
    if (!scene) return '<p style="padding:20px;color:var(--t3);">No scene selected.</p>'
    const DEFAULT_DS = { date_label:'Today', show_date:true, show_name:true, line_style:'gradient', line_opacity:0.08, label_color:'muted', label_case:'upper' }
    const ds = { ...DEFAULT_DS, ...(scene.divider_style || {}) }
    const datePicks = store.getDividerDatePicks()
    const opacityPct = Math.round((ds.line_opacity || 0.08) * 100)

    const pillRow = (name, opts, current) => opts.map(o => `<button class="status-pill ${o === current ? 'active' : ''}" data-ds-pill="${name}" data-value="${this._esc(o)}" type="button">${this._esc(o)}</button>`).join('')

    return `
      <div class="hub-tab-scroll">
      <div class="form-field">
        <label>Scene Name</label>
        <input id="sceneNameInput" type="text" value="${this._esc(scene.name)}" />
      </div>
      <div class="form-field">
        <label>Quote / Subtitle</label>
        <input id="sceneQuoteInput" type="text" value="${this._esc(scene.quote || '')}" placeholder="Optional scene quote…" />
      </div>
      <div class="btn-primary" id="saveSceneBtn" style="margin-top:4px;">Save Scene</div>

      <div class="hub-section-head" id="dividerSectionHead" style="margin-top:16px;">SCENE HEADER <span id="dividerChevron">▸</span></div>
      <div class="hub-section-body" id="dividerSectionBody" style="display:none;">

        <div class="form-field" style="margin-top:10px;">
          <label>Date Label</label>
          <input id="dsDatelabel" type="text" value="${this._esc(ds.date_label)}" placeholder="Today" />
          <div class="status-quick-row" id="dsDatePickRow">${datePicks.map(v => `<button class="status-quick-pill" data-ds-pick="${this._esc(v)}" type="button">${this._esc(v)}</button>`).join('')}<button class="status-save-qp" id="dsSaveDatePick" type="button">+ Save</button></div>
        </div>

        <div class="form-field" style="margin-top:8px;">
          <label>Show Date</label>
          <label class="hub-toggle-row"><input id="dsShowDate" type="checkbox" ${ds.show_date ? 'checked' : ''} /><span class="hub-toggle-label">Show date label</span></label>
        </div>

        <div class="form-field" style="margin-top:8px;">
          <label>Line Style</label>
          <div class="status-pill-row">${pillRow('line_style', ['gradient','solid','dashed','dotted','none'], ds.line_style)}</div>
        </div>

        <div class="form-field" style="margin-top:8px;">
          <label>Line Opacity — <span id="dsOpacityLabel">${opacityPct}%</span></label>
          <input id="dsOpacity" type="range" min="0" max="100" value="${opacityPct}" />
        </div>

        <div class="form-field" style="margin-top:8px;">
          <label>Label Color</label>
          <div class="status-pill-row">${pillRow('label_color', ['muted','accent','white'], ds.label_color)}</div>
        </div>

        <div class="form-field" style="margin-top:8px;">
          <label>Label Case</label>
          <div class="status-pill-row">${pillRow('label_case', ['upper','title','normal'], ds.label_case)}</div>
        </div>

        <div class="form-field" style="margin-top:8px;">
          <label>Show Scene Name</label>
          <label class="hub-toggle-row"><input id="dsShowName" type="checkbox" ${ds.show_name ? 'checked' : ''} /><span class="hub-toggle-label">Show scene name label</span></label>
        </div>

      </div>
      </div>`
  }

  _bindSceneTab(body, p, scene) {
    const save = () => {
      const name  = body.querySelector('#sceneNameInput')?.value.trim()
      const quote = body.querySelector('#sceneQuoteInput')?.value.trim()
      if (!name) return
      store.updateScene(this.projectId, scene.id, { name, quote })
    }
    body.querySelector('#sceneNameInput')?.addEventListener('blur', save)
    body.querySelector('#sceneQuoteInput')?.addEventListener('blur', save)
    body.querySelector('#saveSceneBtn')?.addEventListener('click', () => {
      save()
      this.dismiss()
    })

    // Scene Header collapsible toggle
    body.querySelector('#dividerSectionHead')?.addEventListener('click', () => {
      const bodyEl = body.querySelector('#dividerSectionBody')
      const chevron = body.querySelector('#dividerChevron')
      if (!bodyEl) return
      const open = bodyEl.style.display !== 'none'
      bodyEl.style.display = open ? 'none' : 'block'
      if (chevron) chevron.textContent = open ? '▸' : '▾'
    })

    // Divider style changes
    const updateDs = patch => store.updateSceneDividerStyle(this.projectId, scene.id, patch)

    body.querySelector('#dsDatelabel')?.addEventListener('change', e => updateDs({ date_label: e.target.value.trim() }))

    body.querySelectorAll('[data-ds-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.dsPick
        const input = body.querySelector('#dsDatelabel')
        if (input) input.value = val
        updateDs({ date_label: val })
      })
    })

    body.querySelector('#dsSaveDatePick')?.addEventListener('click', () => {
      const val = body.querySelector('#dsDatelabel')?.value.trim()
      if (!val) return
      store.saveDividerDatePick(val)
      const row = body.querySelector('#dsDatePickRow')
      if (row) {
        const picks = store.getDividerDatePicks()
        const saveBtn = row.querySelector('#dsSaveDatePick')
        row.innerHTML = picks.map(v => `<button class="status-quick-pill" data-ds-pick="${this._esc(v)}" type="button">${this._esc(v)}</button>`).join('')
        row.appendChild(saveBtn)
        row.querySelectorAll('[data-ds-pick]').forEach(b => {
          b.addEventListener('click', () => {
            const iv = b.dataset.dsPick
            const inp = body.querySelector('#dsDatelabel')
            if (inp) inp.value = iv
            updateDs({ date_label: iv })
          })
        })
      }
    })

    body.querySelector('#dsShowDate')?.addEventListener('change', e => updateDs({ show_date: e.target.checked }))
    body.querySelector('#dsShowName')?.addEventListener('change', e => updateDs({ show_name: e.target.checked }))

    body.querySelectorAll('[data-ds-pill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.dsPill
        const value = btn.dataset.value
        body.querySelectorAll(`[data-ds-pill="${field}"]`).forEach(b => b.classList.toggle('active', b === btn))
        updateDs({ [field]: value })
      })
    })

    const opacityInput = body.querySelector('#dsOpacity')
    const opacityLabel = body.querySelector('#dsOpacityLabel')
    opacityInput?.addEventListener('input', () => {
      const val = parseFloat(opacityInput.value) / 100
      if (opacityLabel) opacityLabel.textContent = `${opacityInput.value}%`
      updateDs({ line_opacity: val })
    })
  }

  _statusTab(p, scene) {
    if (!scene) return '<p style="padding:20px;color:var(--t3);">No scene selected.</p>'
    const status = this._normalizeStatusSettings(this._statusDraft || store.getSceneStatusBar(this.projectId, scene.id))
    const quick = store.getStatusQuickpicks()
    const builtins = BUILTIN_STATUS_TEMPLATES
    const userTemplates = store.getStatusTemplates()
    const selectedCategory = this._statusTemplateCategory || 'all'
    const isAirplane = status.signal === 'airplane'
    const visibleBuiltins = builtins.filter(row => selectedCategory === 'all' || BUILTIN_TEMPLATE_CATEGORIES[row.id] === selectedCategory)
    const visibleUsers = selectedCategory === 'custom' || selectedCategory === 'all' ? userTemplates : []

    return `
      <div class="status-tab-wrap">
        <div class="sb-zone-map">
          <button class="sb-zone ${this._statusActiveZone === 'left' ? 'active' : ''}" type="button" data-sb-zone="left">
            <div class="sb-zone-label">Left Zone</div>
            <div class="sb-zone-desc">${isAirplane ? '✈ Airplane' : 'Carrier · Signal'}</div>
          </button>
          <button class="sb-zone ${this._statusActiveZone === 'center' ? 'active' : ''}" type="button" data-sb-zone="center">
            <div class="sb-zone-label">Center</div>
            <div class="sb-zone-desc">Time</div>
          </button>
          <button class="sb-zone ${this._statusActiveZone === 'right' ? 'active' : ''}" type="button" data-sb-zone="right">
            <div class="sb-zone-label">Right Zone</div>
            <div class="sb-zone-desc">Icons · Batt</div>
          </button>
        </div>

        <div class="status-zone-sections">
          <section class="status-zone-section ${this._statusZoneOpen.left ? 'open' : ''}" id="sbZoneLeftSection">
            <button class="status-zone-head" type="button" data-sb-collapse="left">LEFT ZONE - Carrier & Signal <span>${this._statusZoneOpen.left ? '▾' : '▸'}</span></button>
            <div class="status-zone-body">
              <div class="form-field ${isAirplane ? 'disabled' : ''}">
                <label>Carrier</label>
                <input id="statusCarrierInput" type="text" value="${status.carrier || ''}" placeholder="Verizon" ${isAirplane ? 'disabled' : ''} />
                <div class="status-quick-row">${this._quickpickHTML('carrier', quick.carrier || [], isAirplane)}<button class="status-save-qp" data-quickpick-save="carrier" type="button" ${isAirplane ? 'disabled' : ''}>+ Save</button></div>
              </div>

              <div class="form-field ${isAirplane ? 'disabled' : ''}">
                <label>Network</label>
                <input id="statusNetworkInput" type="text" value="${status.network || ''}" placeholder="LTE" ${isAirplane ? 'disabled' : ''} />
                <div class="status-quick-row">${this._quickpickHTML('network', quick.network || [], isAirplane)}<button class="status-save-qp" data-quickpick-save="network" type="button" ${isAirplane ? 'disabled' : ''}>+ Save</button></div>
              </div>

              <div class="form-field">
                <label>Signal</label>
                <div class="status-pill-row">${this._pillRow('signal', ['full', '3bar', '2bar', '1bar', 'none', 'sos', 'airplane'], status.signal)}</div>
              </div>
            </div>
          </section>

          <section class="status-zone-section ${this._statusZoneOpen.center ? 'open' : ''}" id="sbZoneCenterSection">
            <button class="status-zone-head" type="button" data-sb-collapse="center">CENTER - Time <span>${this._statusZoneOpen.center ? '▾' : '▸'}</span></button>
            <div class="status-zone-body">
              <div class="form-field">
                <label>Time</label>
                <input id="statusTimeInput" type="text" value="${status.time || ''}" placeholder="9:41" />
                <div class="status-quick-row">${this._quickpickHTML('time', quick.time || [])}<button class="status-save-qp" data-quickpick-save="time" type="button">+ Save</button></div>
              </div>
            </div>
          </section>

          <section class="status-zone-section ${this._statusZoneOpen.right ? 'open' : ''}" id="sbZoneRightSection">
            <button class="status-zone-head" type="button" data-sb-collapse="right">RIGHT ZONE - Status & Battery <span>${this._statusZoneOpen.right ? '▾' : '▸'}</span></button>
            <div class="status-zone-body">
              <div class="form-field ${isAirplane ? 'disabled' : ''}">
                <label>WiFi</label>
                <div class="status-pill-row">${this._pillRow('wifi', ['full', 'medium', 'weak', 'off'], status.wifi, isAirplane)}</div>
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
          </section>
        </div>

        <div class="status-templates-inline">
          <div class="status-templates-head">Templates</div>
          <div class="status-template-filters">
            ${[
              ['all', 'All'],
              ['night', 'Night'],
              ['travel', 'Travel'],
              ['work', 'Work'],
              ['drama', 'Drama'],
              ['sci-fi', 'Sci-Fi'],
              ['custom', 'Custom'],
            ].map(([value, label]) => `<button class="status-template-filter ${selectedCategory === value ? 'active' : ''}" type="button" data-template-category="${value}">${label}</button>`).join('')}
          </div>
          <div class="status-template-inline-list">
            ${visibleBuiltins.map(row => this._statusTemplateCard(row, false)).join('')}
            ${visibleUsers.map(row => this._statusTemplateCard(row, true)).join('')}
            ${selectedCategory === 'custom' && !visibleUsers.length ? '<div class="status-template-empty">No saved templates yet.</div><button class="status-template-save-current" type="button" id="statusTemplateSaveCurrentEmpty">+ Save current</button>' : ''}
          </div>
          ${selectedCategory === 'custom' ? '' : '<button class="status-template-save-current" type="button" id="statusTemplateSaveCurrent">+ Save current as template</button>'}
        </div>
      </div>`
  }

  _bindStatusTab(body, scene) {
    if (!scene) return
    this._statusDraft = this._normalizeStatusSettings(this._statusDraft || store.getSceneStatusBar(this.projectId, scene.id))

    const refreshStatusTab = () => this._renderTab('status')
    const updateStatus = (patch, rerender = false) => {
      const next = this._normalizeStatusSettings({ ...this._currentSbSettings(), ...(patch || {}) })
      this._statusDraft = next
      this._suppressProjectRender = true
      store.updateSceneStatusBar(this.projectId, scene.id, next)
      queueMicrotask(() => {
        this._suppressProjectRender = false
      })
      if (rerender) refreshStatusTab()
    }

    body.querySelector('#statusTimeInput')?.addEventListener('input', (e) => updateStatus({ time: e.target.value }))
    body.querySelector('#statusCarrierInput')?.addEventListener('input', (e) => updateStatus({ carrier: e.target.value }))
    body.querySelector('#statusNetworkInput')?.addEventListener('input', (e) => updateStatus({ network: e.target.value }))

    body.querySelectorAll('[data-sb-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        const zone = btn.dataset.sbZone || 'left'
        this._statusActiveZone = zone
        body.querySelectorAll('[data-sb-zone]').forEach(node => node.classList.toggle('active', node.dataset.sbZone === zone))
        const sectionMap = {
          left: '#sbZoneLeftSection',
          center: '#sbZoneCenterSection',
          right: '#sbZoneRightSection',
        }
        const target = body.querySelector(sectionMap[zone])
        if (target) {
          this._statusZoneOpen[zone] = true
          target.classList.add('open')
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    })

    body.querySelectorAll('[data-sb-collapse]').forEach(btn => {
      btn.addEventListener('click', () => {
        const zone = btn.dataset.sbCollapse
        if (!zone) return
        this._statusZoneOpen[zone] = !this._statusZoneOpen[zone]
        refreshStatusTab()
      })
    })

    body.querySelectorAll('[data-status-field][data-status-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.statusField
        const value = btn.dataset.statusValue
        updateStatus({ [field]: value }, field === 'signal' || field === 'battery')
      })
    })

    body.querySelectorAll('[data-status-bool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.statusBool
        const current = this._currentSbSettings()
        updateStatus({ [key]: !current[key] }, key === 'charging' || key === 'show_percent')
      })
    })

    body.querySelectorAll('[data-status-icon]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.statusIcon
        const current = this._currentSbSettings()
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
        if (chip.disabled) return
        if (!field) return
        updateStatus({ [field]: value })
      })
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const field = chip.dataset.quickpickField
        const value = chip.dataset.quickpickValue
        if (!field || !value) return
        store.removeStatusQuickpick(field, value)
        refreshStatusTab()
      })
    })

    body.querySelectorAll('[data-quickpick-save]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.quickpickSave
        if (btn.disabled) return
        const map = {
          time: '#statusTimeInput',
          carrier: '#statusCarrierInput',
          network: '#statusNetworkInput',
        }
        const v = body.querySelector(map[field])?.value.trim()
        if (!v) return
        store.addStatusQuickpick(field, v)
        refreshStatusTab()
      })
    })

    body.querySelectorAll('[data-template-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._statusTemplateCategory = btn.dataset.templateCategory || 'all'
        refreshStatusTab()
      })
    })

    body.querySelectorAll('[data-template-apply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const templateId = btn.dataset.templateApply
        const allTemplates = [...BUILTIN_STATUS_TEMPLATES, ...store.getStatusTemplates()]
        const row = allTemplates.find(t => t.id === templateId)
        if (!row) return
        updateStatus(row.status_bar || {}, true)
      })
    })

    body.querySelectorAll('[data-template-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const templateId = btn.dataset.templateDelete
        if (!templateId) return
        const ok = window.confirm('Delete this template?')
        if (!ok) return
        store.deleteStatusTemplate(templateId)
        refreshStatusTab()
      })
    })

    body.querySelectorAll('#statusTemplateSaveCurrent, #statusTemplateSaveCurrentEmpty').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = store.getSceneStatusBar(this.projectId, scene.id)
        this._statusDraft = this._normalizeStatusSettings(current)
        const name = window.prompt('Template name')?.trim()
        if (!name) return
        const emoji = window.prompt('Emoji', '⭐')?.trim() || '⭐'
        store.saveStatusTemplate({ name, emoji, status_bar: this._statusDraft })
        this._statusTemplateCategory = 'custom'
        refreshStatusTab()
      })
    })
  }

  _currentSbSettings() {
    if (this._statusDraft) return this._statusDraft
    const scene = store.getActiveScene(this.projectId)
    if (!scene) return {}
    return store.getSceneStatusBar(this.projectId, scene.id)
  }

  _normalizeStatusSettings(status) {
    const next = { ...(status || {}) }
    if (next.charging && next.battery === 'dead') {
      next.battery = 'low'
    }
    if (next.battery === 'dead') {
      next.show_percent = false
    }
    return next
  }

  _statusTemplateCard(template, isCustom) {
    return `
      <div class="status-template-card compact">
        <div class="status-template-name">${template.emoji || '⭐'} ${template.name}</div>
        <div class="status-template-preview">${renderStatusBar(template.status_bar)}</div>
        <div class="status-template-actions">
          <button type="button" data-template-apply="${template.id}">Apply</button>
          ${isCustom ? `<button type="button" data-template-delete="${template.id}">Delete</button>` : ''}
        </div>
      </div>`
  }

  _quickpickHTML(field, values, disabled = false) {
    return values.map(v => `<button class="status-quick-chip" type="button" data-quickpick-field="${field}" data-quickpick-value="${v}" ${disabled ? 'disabled' : ''}>${v}</button>`).join('')
  }

  _pillRow(field, values, active, disabled = false) {
    return values.map(v => `<button class="status-pill ${v === active ? 'active' : ''}" type="button" data-status-field="${field}" data-status-value="${v}" ${disabled ? 'disabled' : ''}>${v}</button>`).join('')
  }

  _boolChip(key, label, active) {
    return `<button class="status-pill ${active ? 'active' : ''}" type="button" data-status-bool="${key}">${label}</button>`
  }

  _iconChip(key, activeIcons) {
    const active = Array.isArray(activeIcons) && activeIcons.includes(key)
    const label = key.replace(/_/g, ' ')
    return `<button class="status-icon-chip ${active ? 'active' : ''}" type="button" data-status-icon="${key}" title="${label}">${label}</button>`
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
    const rs = p.render_settings || {}
    return `
      <div class="hub-tab-scroll" style="display:flex;flex-direction:column;gap:0;">
        <div class="hub-sub-rail">
          <button class="hub-sub-btn active" data-sub="format">Format</button>
          <button class="hub-sub-btn" data-sub="style">Style</button>
          <button class="hub-sub-btn" data-sub="export">Export</button>
        </div>

        <div class="hub-config-stack hub-sub-page active" data-sub-page="format">
          ${this._settingsSection('Output', this._settingsPills('script_format', ['PDF', 'PNG', 'JPG', 'WEBP'], (rs.script_format || 'pdf').toUpperCase()))}
          ${this._settingsSection('Paper', this._settingsPills('script_paper', ['A4', 'US Letter'], (rs.script_paper || 'a4') === 'letter' ? 'US Letter' : 'A4'))}
          ${this._settingsRange('Font Size', 'script_font_size', 10, 21, 1, rs.script_font_size || 14, value => `${value}pt`)}
        </div>

        <div class="hub-config-stack hub-sub-page" data-sub-page="style">
          ${this._settingsSection('Layout', this._settingsPills('script_style', ['Screenplay', 'Reduced', 'Condensed'], this._titleCase(rs.script_style || 'screenplay')))}
          ${this._settingsSection('Font', this._settingsPills('script_font', SCRIPT_FONT_OPTIONS, rs.script_font || 'System UI'))}
          <div class="hub-note">No bundled font files were found in this v2 project, so Script export currently uses System UI.</div>
          ${this._settingsSection('Effects', `
            ${this._settingsToggle('Bold names', 'script_bold_names', rs.script_bold_names !== false)}
            ${this._settingsToggle('Page numbers', 'script_page_numbers', rs.script_page_numbers !== false)}
            ${this._settingsToggle('Paper texture effect', 'script_paper_effect', rs.script_paper_effect === true)}
          `)}
        </div>

        <div class="hub-config-stack hub-sub-page" data-sub-page="export">
          <button class="hub-action-primary" id="scriptExportBtn" type="button">Export Script</button>
          <div class="hub-note" style="text-align:center;">Exports a formatted screenplay-style PDF (or image) of this story's messages.</div>
        </div>
      </div>`
  }

  _bindScriptSubTabs(body) {
    body.querySelectorAll('.hub-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.hub-sub-btn').forEach(b => b.classList.remove('active'))
        body.querySelectorAll('.hub-sub-page').forEach(p => p.classList.remove('active'))
        btn.classList.add('active')
        body.querySelector(`[data-sub-page="${btn.dataset.sub}"]`)?.classList.add('active')
      })
    })
  }

  _settingsTab(p) {
    const rs = p.render_settings || {}
    return `
      <div class="hub-tab-scroll hub-config-stack">
        ${this._settingsSection('Actions', `
          <button class="hub-action-secondary" id="settingsReorderBtn" type="button">Reorder messages</button>
          <button class="hub-action-secondary" id="settingsExportBtn" type="button">Export</button>
          <button class="hub-action-secondary" id="settingsUndoBtn" type="button">Undo</button>
        `)}
        ${this._settingsSection('FPS', this._settingsPills('fps', ['24', '30', '60'], String(rs.fps || 30)))}
        ${this._settingsSection('SFX Type', this._settingsPills('sfx_type', ['Soft', 'Mechanical', 'Typewriter', 'Retro'], this._titleCase(rs.sfx_type || 'soft')))}
        ${this._settingsSection('Keyboard Style', this._settingsPills('keyboard_style', ['iOS', 'Android', 'Minimal'], rs.keyboard_style === 'minimal' ? 'Minimal' : rs.keyboard_style === 'android' ? 'Android' : 'iOS'))}
        ${this._settingsSection('Display', `
          ${this._settingsToggle('SFX enabled', 'sfx_enabled', rs.sfx_enabled !== false)}
          ${this._settingsToggle('Show actor names', 'show_names', rs.show_names !== false)}
          ${this._settingsToggle('Show timestamps', 'show_timestamps', rs.show_timestamps !== false)}
          ${this._settingsToggle('Dark background', 'dark_background', rs.dark_background !== false)}
          ${this._settingsToggle('Fakeout', 'fakeout', rs.fakeout !== false)}
          ${this._settingsToggle('Loop music', 'loop_music', rs.loop_music !== false)}
          ${this._settingsToggle('Fade music', 'fade_music', rs.fade_music !== false)}
          ${this._settingsToggle('Enter sends message', 'enter_sends', rs.enter_sends !== false)}
          ${this._settingsToggle('Autosave', 'autosave', rs.autosave !== false)}
        `)}
        ${this._settingsRange('Typing duration', 'typing_duration', 0.02, 0.2, 0.01, rs.typing_duration || 0.08, value => `${Number(value).toFixed(2)}s`)}
        ${this._settingsRange('Typing indicator duration', 'typing_indicator_duration', 0.3, 3, 0.1, rs.typing_indicator_duration || 1.2, value => `${Number(value).toFixed(1)}s`)}
        ${this._settingsRange('Message pause', 'message_pause', 0.2, 3, 0.1, rs.message_pause || 0.8, value => `${Number(value).toFixed(1)}s`)}
        ${this._settingsRange('Music volume', 'music_volume', 0, 1, 0.01, rs.music_volume ?? 0.7, value => `${Math.round(Number(value) * 100)}%`)}
      </div>`
  }

  _bindRenderSettingsControls(body) {
    body.querySelector('#settingsReorderBtn')?.addEventListener('click', () => {
      this.conversationScreen?._toggleReorderMode?.()
      this.dismiss()
    })
    body.querySelector('#settingsExportBtn')?.addEventListener('click', () => {
      this.dismiss()
      this.conversationScreen?._openExport?.()
    })
    body.querySelector('#settingsUndoBtn')?.addEventListener('click', () => {
      if (store.undoLastChange()) {
        this.conversationScreen?._refresh?.()
        this._snack('Change undone')
      }
    })

    body.querySelectorAll('[data-rs-pill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.rsKey
        const value = btn.dataset.rsValue
        if (!key) return
        store.updateRenderSettings(this.projectId, { [key]: this._mapRenderSettingValue(key, value) })
        this._renderTab(this.activeTab)
      })
    })

    body.querySelectorAll('[data-rs-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.rsToggle
        if (!key) return
        const next = !btn.classList.contains('on')
        store.updateRenderSettings(this.projectId, { [key]: next })
        this._renderTab(this.activeTab)
      })
    })

    body.querySelectorAll('[data-rs-range]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.rsRange
        if (!key) return
        const value = this._mapRangeValue(key, input.value)
        store.updateRenderSettings(this.projectId, { [key]: value })
        const label = body.querySelector(`[data-rs-display="${key}"]`)
        if (label) label.textContent = this._formatRenderSettingValue(key, value)
      })
    })
  }

  _exportScriptProject() {
    const project = store.getProject(this.projectId)
    if (!project) return
    const nextProject = {
      ...project,
      render_settings: {
        ...(project.render_settings || {}),
      },
    }
    fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: nextProject, format: 'script_pdf' }),
    }).then(async (resp) => {
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || 'Failed to start script export')
      this._snack('Script export started')
    }).catch((err) => {
      this._snack(err?.message || 'Script export requires the backend server')
    })
  }

  _settingsSection(title, content) {
    return `<div class="hub-settings-card"><div class="hub-settings-title">${title}</div>${content}</div>`
  }

  _settingsPills(key, options, active) {
    return `<div class="hub-pill-row">${options.map(option => `<button class="hub-pill ${option === active ? 'active' : ''}" type="button" data-rs-pill="1" data-rs-key="${key}" data-rs-value="${option}">${option}</button>`).join('')}</div>`
  }

  _settingsToggle(label, key, isOn) {
    return `
      <div class="toggle-row compact">
        <div class="toggle-row-text"><div class="toggle-row-label">${label}</div></div>
        <div class="toggle ${isOn ? 'on' : 'off'}" data-rs-toggle="${key}"></div>
      </div>`
  }

  _settingsRange(label, key, min, max, step, value, formatter) {
    return `
      <div class="hub-range-wrap">
        <div class="hub-range-head"><span>${label}</span><span data-rs-display="${key}">${formatter(value)}</span></div>
        <input class="hub-range" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-rs-range="${key}" />
      </div>`
  }

  _mapRenderSettingValue(key, value) {
    if (key === 'fps') return Number(value)
    if (key === 'sfx_type') return String(value || '').toLowerCase()
    if (key === 'keyboard_style') return value === 'iOS' ? 'ios' : value === 'Android' ? 'android' : 'minimal'
    if (key === 'script_format') return String(value || '').toLowerCase()
    if (key === 'script_paper') return value === 'US Letter' ? 'letter' : 'a4'
    if (key === 'script_style') return String(value || '').toLowerCase()
    return value
  }

  _mapRangeValue(key, value) {
    if (['script_font_size', 'fps'].includes(key)) return Number(value)
    return Number(value)
  }

  _formatRenderSettingValue(key, value) {
    if (key === 'typing_duration') return `${Number(value).toFixed(2)}s`
    if (key === 'typing_indicator_duration') return `${Number(value).toFixed(1)}s`
    if (key === 'message_pause') return `${Number(value).toFixed(1)}s`
    if (key === 'music_volume') return `${Math.round(Number(value) * 100)}%`
    if (key === 'script_font_size') return `${Number(value)}pt`
    return String(value)
  }

  _titleCase(value) {
    const text = String(value || '')
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  _rgb(hex) {
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    return `${r},${g},${b}`
  }
}

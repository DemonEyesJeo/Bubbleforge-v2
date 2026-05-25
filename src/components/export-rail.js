import { store } from '../store.js'
import { icons } from './icons.js'

export class ExportRail {
  constructor(overlayLayer, projectId, onClose) {
    this.overlayLayer = overlayLayer
    this.projectId = projectId
    this.onClose = onClose
    this.activeTab = 'keyboard'
    this._pollTimer = null
    this._exportState = null
  }

  mount() {
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="export-overlay"></div>
      <div class="export-rail">
        <div class="rail-handle"></div>
        <div class="rail-title">Export</div>
        <div class="rail-tabs">
          <div class="rail-tab active" data-tab="keyboard">Keyboard</div>
          <div class="rail-tab" data-tab="audio">Audio</div>
          <div class="rail-tab" data-tab="timing">Timing</div>
          <div class="rail-tab" data-tab="format">Format</div>
        </div>
        <div class="rail-body" id="railBody"></div>
        <div class="export-cta" id="exportCta">Export MP4</div>
      </div>`

    this._overlay = wrap.children[0]
    this._rail    = wrap.children[1]
    this.overlayLayer.appendChild(this._overlay)
    this.overlayLayer.appendChild(this._rail)
    this.overlayLayer.style.pointerEvents = 'all'

    requestAnimationFrame(() => {
      this._overlay.classList.add('visible')
      this._rail.classList.add('visible')
    })

    this._overlay.addEventListener('click', () => this.dismiss())
    this._rail.querySelectorAll('.rail-tab').forEach(tab => {
      tab.addEventListener('click', () => this._setTab(tab.dataset.tab, tab))
    })
    this._rail.querySelector('#exportCta').addEventListener('click', () => this._doExport())
    this._renderTab('keyboard')
  }

  dismiss() {
    this._stopPolling()
    this._overlay.classList.remove('visible')
    this._rail.classList.remove('visible')
    setTimeout(() => {
      this._overlay.remove()
      this._rail.remove()
      this.overlayLayer.style.pointerEvents = 'none'
      this.onClose?.()
    }, 370)
  }

  _setTab(tab, el) {
    if (this._exportState && (this._exportState.status === 'queued' || this._exportState.status === 'running')) {
      return
    }
    this.activeTab = tab
    this._rail.querySelectorAll('.rail-tab').forEach(t => t.classList.toggle('active', t === el))
    const p = store.getProject(this.projectId)
    const rs = p?.render_settings || {}
    // Update CTA label
    const cta = this._rail.querySelector('#exportCta')
    if (cta) cta.textContent = tab === 'format' && rs.format === 'pdf' ? 'Export PDF' : 'Export MP4'
    this._renderTab(tab)
  }

  _renderTab(tab) {
    const p = store.getProject(this.projectId)
    const rs = p?.render_settings || {}
    const body = this._rail.querySelector('#railBody')

    const tabs = {
      keyboard: () => `
        ${this._section('Keyboard Style', this._pills(['iOS','Android','Off'], rs.keyboard_style === 'ios' ? 'iOS' : rs.keyboard_style === 'android' ? 'Android' : 'Off', 'keyboard_style', v => ({'iOS':'ios','Android':'android','Off':'off'}[v])))}
        ${this._section('SFX Type', this._pills(['Soft','Mechanical','Typewriter','Retro','Off'], (rs.sfx_type||'soft').charAt(0).toUpperCase()+(rs.sfx_type||'soft').slice(1), 'sfx_type', v => v.toLowerCase()))}
        <div class="rail-section">
          ${this._slider('Typing speed', `${(rs.typing_duration||0.08).toFixed(2)}s / char`, ((rs.typing_duration||0.08) - 0.02) / 0.18, 'typing_duration', v => 0.02 + v * 0.18)}
          ${this._slider('Typing indicator', `${(rs.typing_indicator_duration||1.2).toFixed(1)}s`, ((rs.typing_indicator_duration||1.2) - 0.3) / 2.7, 'typing_indicator_duration', v => 0.3 + v * 2.7)}
        </div>
        <div class="rail-section">
          ${this._toggle('Typing animation', 'Characters appear one by one', rs.typing_animation !== false, 'typing_animation')}
          ${this._toggle('Fakeout', 'Indicator stops and restarts once before sending', rs.fakeout !== false, 'fakeout')}
        </div>`,
      audio: () => `
        <div class="rail-section">
          <div class="rail-section-title">Background Music</div>
          <div class="hub-list-item" style="background:var(--s1);border-radius:12px;margin-bottom:8px;" id="pickMusicBtn">
            <div class="hub-list-icon" style="background:rgba(41,121,255,0.10);">${icons.music}</div>
            <div class="hub-list-text">
              <div class="hub-list-title">${rs.music_path ? rs.music_path.split('/').pop() : 'No track selected'}</div>
              <div class="hub-list-sub">Tap to choose a file</div>
            </div>
          </div>
        </div>
        <div class="rail-section">
          ${this._slider('Music volume', `${Math.round((rs.music_volume||0.7)*100)}%`, rs.music_volume||0.7, 'music_volume', v => v)}
        </div>
        <div class="rail-section">
          ${this._toggle('Loop music', '', rs.loop_music !== false, 'loop_music')}
          ${this._toggle('Fade in / out', '', rs.fade_music !== false, 'fade_music')}
        </div>`,
      timing: () => `
        ${this._section('Frame Rate', this._pills(['24 fps','30 fps','60 fps'], `${rs.fps||30} fps`, 'fps', v => parseInt(v)))}
        <div class="rail-section">
          ${this._slider('Message pause', `${(rs.message_pause||0.8).toFixed(1)}s`, ((rs.message_pause||0.8) - 0.2) / 2.8, 'message_pause', v => 0.2 + v * 2.8)}
        </div>`,
      format: () => `
        ${this._section('Format', this._pills(['MP4','PDF','PNG sequence'], (rs.format||'mp4').toUpperCase(), 'format', v => v.toLowerCase().replace(' sequence','_sequence')))}
        ${this._section('Resolution', this._pills(['720p','1080p','4K'], rs.resolution||'1080p', 'resolution', v => v))}
        <div class="rail-section">
          ${this._toggle('Preview before export', 'Show frame 0 before exporting', rs.preview_before_export||false, 'preview_before_export')}
        </div>`,
    }

    body.innerHTML = tabs[tab]?.() || ''
    this._bindInteractions(body, tab)
  }

  _bindInteractions(body, tab) {
    if (tab === 'audio') {
      body.querySelector('#pickMusicBtn')?.addEventListener('click', () => this._pickMusicFile())
    }

    body.querySelectorAll('.pill').forEach(pill => {
      pill.addEventListener('click', () => {
        pill.closest('.pill-row').querySelectorAll('.pill').forEach(p => p.classList.remove('active'))
        pill.classList.add('active')
        const key = pill.closest('.pill-row').dataset.key
        const mapper = this._mappers[key]
        if (key && mapper) store.updateRenderSettings(this.projectId, { [key]: mapper(pill.dataset.value) })
        if (key === 'format') {
          const cta = this._rail.querySelector('#exportCta')
          if (cta) cta.textContent = pill.dataset.value === 'PDF' ? 'Export PDF' : 'Export MP4'
        }
      })
    })

    body.querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', () => {
        const isOn = t.classList.contains('on')
        t.classList.toggle('on', !isOn)
        t.classList.toggle('off', isOn)
        const key = t.dataset.key
        if (key) store.updateRenderSettings(this.projectId, { [key]: !isOn })
      })
    })

    body.querySelectorAll('.slider-track').forEach(track => {
      const fill  = track.querySelector('.slider-fill')
      const knob  = track.querySelector('.slider-knob')
      const key   = track.dataset.key
      const calc  = this._mappers[key]
      let dragging = false

      const update = (e) => {
        const rect = track.getBoundingClientRect()
        const clientX = e.touches ? e.touches[0].clientX : e.clientX
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        fill.style.width = `${pct * 100}%`
        knob.style.left = `${pct * 100}%`
        if (key && calc) {
          const val = calc(pct)
          store.updateRenderSettings(this.projectId, { [key]: val })
          // Update label
          const label = track.closest('.slider-block')?.querySelector('.slider-label-value')
          if (label) label.textContent = this._formatSliderValue(key, val)
        }
      }

      track.addEventListener('mousedown', e => { dragging = true; update(e) })
      track.addEventListener('touchstart', e => { dragging = true; update(e) }, { passive: true })
      window.addEventListener('mousemove', e => { if (dragging) update(e) })
      window.addEventListener('touchmove', e => { if (dragging) update(e) }, { passive: true })
      window.addEventListener('mouseup', () => dragging = false)
      window.addEventListener('touchend', () => dragging = false)
    })
  }

  async _pickMusicFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac'

    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return

      this._snack('Uploading music…')
      try {
        const fd = new FormData()
        fd.append('music', file)
        const resp = await fetch('/api/music-upload', { method: 'POST', body: fd })
        const data = await resp.json()
        if (!resp.ok || !data?.path) {
          throw new Error(data?.error || 'Upload failed')
        }

        store.updateRenderSettings(this.projectId, { music_path: data.path })
        this._renderTab('audio')
        this._snack(`Music selected: ${data.name || file.name}`)
      } catch (err) {
        this._snack(err?.message || 'Could not upload music file')
      }
    }, { once: true })

    input.click()
  }

  _mappers = {}

  _pills(options, activeValue, key, valueMapper) {
    const pills = options.map(opt => {
      const isActive = opt === activeValue
      this._mappers[key] = valueMapper
      return `<div class="pill ${isActive ? 'active' : ''}" data-value="${opt}">${opt}</div>`
    }).join('')
    return `<div class="pill-row" data-key="${key}">${pills}</div>`
  }

  _slider(label, valueStr, pct, key, calc) {
    this._mappers[key] = calc
    const safePct = Math.max(0, Math.min(1, pct || 0))
    return `
      <div class="slider-block">
        <div class="slider-labels">
          <span class="slider-label-text">${label}</span>
          <span class="slider-label-value">${valueStr}</span>
        </div>
        <div class="slider-track" data-key="${key}">
          <div class="slider-fill" style="width:${safePct*100}%;"></div>
          <div class="slider-knob" style="left:${safePct*100}%;"></div>
        </div>
      </div>`
  }

  _toggle(label, sub, isOn, key) {
    return `
      <div class="toggle-row">
        <div class="toggle-row-text">
          <div class="toggle-row-label">${label}</div>
          ${sub ? `<div class="toggle-row-sub">${sub}</div>` : ''}
        </div>
        <div class="toggle ${isOn ? 'on' : 'off'}" data-key="${key}"></div>
      </div>`
  }

  _section(title, content) {
    return `<div class="rail-section"><div class="rail-section-title">${title}</div>${content}</div>`
  }

  _formatSliderValue(key, val) {
    if (key === 'typing_duration')           return `${val.toFixed(2)}s / char`
    if (key === 'typing_indicator_duration') return `${val.toFixed(1)}s`
    if (key === 'music_volume')              return `${Math.round(val * 100)}%`
    if (key === 'message_pause')             return `${val.toFixed(1)}s`
    return val.toFixed(2)
  }

  _doExport() {
    const p = store.getProject(this.projectId)
    if (!p) return

    const rs = p.render_settings || {}
    if (rs.preview_before_export && !this._exportState?.previewing) {
      this._exportState = { status: 'preview', progress: 0, message: 'Preview before export', previewing: true }
      this._renderExportState()
      return
    }

    this._exportState = { status: 'queued', progress: 0, message: 'Starting export…' }
    this._rail.classList.add('is-exporting')
    this._renderExportState()

    fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: p }),
    }).then(r => r.json()).then(data => {
      if (!data?.job_id) {
        throw new Error(data?.error || 'Failed to start export')
      }
      this._exportState = { status: 'running', progress: 0, jobId: data.job_id, message: 'Export in progress…' }
      this._renderExportState()
      this._startPolling(data.job_id)
    }).catch(() => {
      this._stopPolling()
      this._exportState = {
        status: 'error',
        progress: 0,
        message: 'Export requires the Python backend server. See README.',
      }
      this._renderExportState()
      this._snack('Export requires the Python backend server. See README.')
    })
  }

  _startPolling(jobId) {
    this._stopPolling()
    this._pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`/api/export/${jobId}`)
        const job = await resp.json()
        if (!resp.ok) {
          throw new Error(job?.error || 'Export status failed')
        }

        const state = {
          status: job.status || 'running',
          progress: typeof job.progress === 'number' ? job.progress : 0,
          outputPath: job.output_path,
          error: job.error,
        }
        this._exportState = state
        this._renderExportState()

        if (state.status === 'done' || state.status === 'error') {
          this._stopPolling()
        }
      } catch (err) {
        this._stopPolling()
        this._exportState = {
          status: 'error',
          progress: 0,
          message: err?.message || 'Failed to poll export status',
        }
        this._renderExportState()
      }
    }, 500)
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  _renderExportState() {
    const body = this._rail.querySelector('#railBody')
    const cta = this._rail.querySelector('#exportCta')
    const st = this._exportState
    if (!body || !cta || !st) return

    const progress = Math.max(0, Math.min(100, Number(st.progress || 0)))
    const running = st.status === 'queued' || st.status === 'running'
    const previewing = st.status === 'preview'
    const done = st.status === 'done'
    const errored = st.status === 'error'

    cta.style.display = running || previewing ? 'none' : 'block'
    this._rail.querySelectorAll('.rail-tab').forEach(t => t.classList.toggle('disabled', running || previewing))

    if (previewing) {
      const p = store.getProject(this.projectId)
      const scene = store.getActiveScene(this.projectId)
      const previewHtml = scene
        ? `<div class="export-preview-scene">${scene.name}</div>${scene.messages.length ? `<div class="export-preview-card">${scene.messages[0].text}</div>` : '<div class="export-preview-card is-empty">No messages in scene</div>'}`
        : '<div class="export-preview-card is-empty">No active scene</div>'

      body.innerHTML = `
        <div class="export-progress-wrap">
          <div class="export-progress-title">Preview before export</div>
          <div class="export-progress-sub">Check the first frame before rendering the full file.</div>
          <div class="export-preview-wrap">${previewHtml}</div>
          <div class="export-preview-actions">
            <button class="export-preview-btn ghost" id="exportPreviewCancelBtn">Cancel</button>
            <button class="export-preview-btn primary" id="exportPreviewGoBtn">Export</button>
          </div>
        </div>
      `

      body.querySelector('#exportPreviewCancelBtn')?.addEventListener('click', () => {
        this._exportState = null
        this._renderTab(this.activeTab)
      })
      body.querySelector('#exportPreviewGoBtn')?.addEventListener('click', () => {
        this._exportState = null
        this._doExport()
      })
      return
    }

    body.innerHTML = `
      <div class="export-progress-wrap">
        <div class="export-progress-title">${done ? 'Export complete' : errored ? 'Export failed' : 'Exporting MP4'}</div>
        <div class="export-progress-sub ${errored ? 'is-error' : ''}">
          ${errored ? (st.message || st.error || 'An unknown export error occurred.') : done ? 'Your video is ready.' : (st.message || 'Rendering and mixing audio...')}
        </div>
        <div class="export-progress-track">
          <div class="export-progress-fill" style="width:${progress}%"></div>
        </div>
        <div class="export-progress-percent">${progress}%</div>
        ${done && st.outputPath ? `<div class="export-output-path">${st.outputPath}</div>` : ''}
        ${done ? '<button class="export-share-btn" id="exportShareBtn">Share</button>' : ''}
      </div>
    `

    const shareBtn = body.querySelector('#exportShareBtn')
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const path = st.outputPath || ''
        try {
          if (navigator.share) {
            await navigator.share({ title: 'Bubbleforge export', text: path })
            return
          }
          await navigator.clipboard.writeText(path)
          this._snack('Export path copied to clipboard')
        } catch {
          this._snack('Could not share export path')
        }
      })
    }
  }

  _snack(msg) {
    const s = document.createElement('div')
    s.className = 'snackbar'
    s.textContent = msg
    this.overlayLayer.appendChild(s)
    this.overlayLayer.style.pointerEvents = 'all'
    setTimeout(() => { s.style.opacity = '0'; s.style.transition = 'opacity 0.3s'; setTimeout(() => s.remove(), 320) }, 3000)
  }
}

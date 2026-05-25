import { store } from '../store.js'
import { push, pop } from '../router.js'
import { icons } from '../components/icons.js'
import { renderMessages, renderTypingIndicator, hexToRgb } from '../components/bubble.js'
import { HubPanel } from '../components/hub-panel.js'
import { ExportRail } from '../components/export-rail.js'
import { renderStatusBar } from '../components/status-bar.js'

export class ConversationScreen {
  constructor({ projectId }) {
    this.projectId = projectId
    this._activeActorId = null
    this._hub = null
    this._exportRail = null
    this._audioToolsOpen = false
    this._composePendingMedia = ''
    this._composePendingAudio = ''
    this._composeCharLimit = 160
    this._bubbleLongPressTimer = null
    this._bubbleLongPressSuppressedMsgId = null
    this._audioRecorder = null
    this._audioChunks = []
    this._audioStream = null
    this._audioRecordStart = 0
    this._audioRecordTick = null
    this._composeMusicAudio = null
    this._composeMusicRaf = null
    this._composeMusicUrl = ''
    this._composeMusicTitle = ''
    this._speakerphoneEnabled = false
    this._onChange = () => this._refresh()
  }

  render() {
    const el = document.createElement('div')
    el.className = 'conversation-screen'
    el.innerHTML = `
      <div class="status-bar">
        <div id="statusBarHost">${renderStatusBar()}</div>
      </div>
      <div class="nav-bar">
        <div class="nav-back" id="backBtn">${icons.back} Stories</div>
        <div class="nav-center">
          <div class="nav-title" id="sceneTitle">…</div>
          <div class="nav-sub" id="sceneSub"></div>
        </div>
        <div class="nav-actions">
          <div class="nav-btn" id="undoBtn" title="Undo">${icons.undo}</div>
          <div class="nav-btn" id="playBtn" title="Preview">${icons.play}</div>
          <div class="nav-btn" id="menuBtn" title="Menu">${icons.dots}</div>
        </div>
      </div>
      <div class="conversation-canvas" id="convCanvas"></div>
      <div class="command-center">
        <div class="speaker-strip" id="speakerStrip"></div>
        <div class="audio-pill" id="audioPill">
          <div class="audio-pill-grid">
            <div class="audio-pill-button" data-action="attach">${icons.attach}</div>
            <div class="audio-pill-button" data-action="mic">${icons.mic}</div>
            <div class="audio-pill-button" data-action="play">${icons.play}</div>
            <div class="audio-pill-button" data-action="rewind">${icons.rewind}</div>
          </div>
          <div class="audio-pill-divider"></div>
          <div class="audio-pill-timeline">
            <div class="audio-pill-title">Audio tools</div>
            <div class="audio-pill-sub" id="audioPillSub">Hidden while typing</div>
            <div class="audio-pill-preview" id="audioPillPreview"></div>
              <div class="audio-pill-actions">
                <button class="audio-pill-action" id="audioAttachBtn" type="button">Attach</button>
                <button class="audio-pill-action primary" id="audioRecordBtn" type="button">Record</button>
              </div>
              <div class="audio-pill-music">
                <div class="audio-pill-music-head">
                  <div>
                    <div class="audio-pill-music-title" id="composeMusicTitle">No audio selected</div>
                    <div class="audio-pill-music-sub" id="composeMusicSub">Pick a background track for this story</div>
                  </div>
                  <button class="audio-pill-action primary" id="composeMusicPickBtn" type="button">Pick music</button>
                </div>
                <div class="audio-pill-music-actions">
                  <button class="audio-pill-mini-btn" id="composeMusicPlayBtn" type="button">${icons.play}</button>
                  <button class="audio-pill-mini-btn" id="composeMusicRewindBtn" type="button">${icons.rewind}</button>
                  <button class="audio-pill-mini-btn" id="composeMusicClearBtn" type="button">✕</button>
                </div>
                <div class="audio-pill-volume">
                  <div class="audio-pill-volume-head">
                    <span>Music volume</span>
                    <span id="composeMusicVolumeLabel">70%</span>
                  </div>
                  <input class="audio-pill-volume-slider" id="composeMusicVolume" type="range" min="0" max="100" step="1" value="70" />
                </div>
                <div class="audio-pill-switches">
                  <label class="audio-pill-switch"><input id="composeMusicLoop" type="checkbox" checked /> Loop music</label>
                  <label class="audio-pill-switch"><input id="composeMusicFade" type="checkbox" checked /> Fade music</label>
                </div>
                <div class="audio-pill-music-time">
                  <span id="composeMusicNow">00:00.0</span>
                  <span id="composeMusicTotal">00:00</span>
                </div>
                <input class="audio-pill-music-seek" id="composeMusicSeek" type="range" min="0" max="0.1" step="0.1" value="0" />
              </div>
            <div class="audio-pill-track"><div class="audio-pill-fill" style="width:38%"></div></div>
          </div>
        </div>
        <div class="compose-row">
          <div class="nav-btn" id="audioToggleBtn" title="Audio">${icons.music}</div>
          <div class="compose-pill" id="composePill">
            <div class="compose-emoji-btn" id="emojiBtn" title="Emoji">${icons.emoji}</div>
            <textarea class="compose-input" id="composeInput" rows="1" placeholder="Message…"></textarea>
            <div class="compose-count" id="composeCount">0/160</div>
            <div class="compose-pill-action" id="cameraBtn" title="Camera">${icons.camera}</div>
          </div>
          <div class="send-btn" id="sendBtn">${icons.add}</div>
          <input id="composeMusicInput" type="file" accept="audio/*" hidden />
          <input id="composeAudioInput" type="file" accept="audio/*" hidden />
          <input id="composeCameraInput" type="file" accept="image/*" capture="environment" hidden />
          <input id="composeMediaInput" type="file" accept="image/*" hidden />
          <div class="nav-btn" id="cancelEditBtn" title="Cancel edit" style="display:none;">✕</div>
        </div>
      </div>`
    return el
  }

  bind() {
    store.on('project-changed', this._onChange)

    this._el.querySelector('#backBtn').addEventListener('click', () => pop())
    this._el.querySelector('#undoBtn').addEventListener('click', () => {
      if (store.undoLastChange()) this._refresh()
    })
    this._el.querySelector('#playBtn').addEventListener('click', () => {
      push('play', { projectId: this.projectId })
    })
    this._el.querySelector('#menuBtn').addEventListener('click', () => this._openHub())
    this._el.querySelector('#audioToggleBtn').addEventListener('click', () => this._toggleAudioPill())
    this._el.querySelector('#composeMusicPickBtn').addEventListener('click', () => this._el.querySelector('#composeMusicInput')?.click())
    this._el.querySelector('#composeMusicPlayBtn').addEventListener('click', () => this._toggleComposeMusicPlay())
    this._el.querySelector('#composeMusicRewindBtn').addEventListener('click', () => this._rewindComposeMusic())
    this._el.querySelector('#composeMusicClearBtn').addEventListener('click', () => this._clearComposeMusic())
    this._el.querySelector('#composeMusicVolume').addEventListener('input', e => this._setComposeMusicVolume(e.target))
    this._el.querySelector('#composeMusicLoop').addEventListener('change', e => this._setComposeMusicFlags({ loop_music: e.target.checked }))
    this._el.querySelector('#composeMusicFade').addEventListener('change', e => this._setComposeMusicFlags({ fade_music: e.target.checked }))
    this._el.querySelector('#audioAttachBtn').addEventListener('click', () => this._el.querySelector('#composeAudioInput')?.click())
    this._el.querySelector('#audioRecordBtn').addEventListener('click', () => this._toggleAudioRecording())
    this._el.querySelector('#cameraBtn').addEventListener('click', () => this._el.querySelector('#composeCameraInput')?.click())
    this._el.querySelector('#composeMusicInput').addEventListener('change', e => this._pickComposeMusic(e.target))
    this._el.querySelector('#composeAudioInput').addEventListener('change', e => this._pickComposeAudio(e.target))
    this._el.querySelector('#composeCameraInput').addEventListener('change', e => this._pickComposeMedia(e.target))
    this._el.querySelector('#composeMediaInput').addEventListener('change', e => this._pickComposeMedia(e.target))
    this._el.querySelector('#emojiBtn').addEventListener('click', e => this._toggleEmojiPicker(e.currentTarget))
    this._el.querySelector('#cancelEditBtn').addEventListener('click', () => this._clearEditMode())

    this._el.querySelectorAll('.audio-pill-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action
        if (action === 'play') {
          this._playPendingAudio()
        } else if (action === 'rewind') {
          this._restartPendingAudio()
        } else if (action === 'attach' || action === 'mic') {
          if (action === 'attach') {
            this._el.querySelector('#composeAudioInput')?.click()
          } else {
            this._toggleAudioRecording()
          }
        }
      })
    })

    const input = this._el.querySelector('#composeInput')
    const sendBtn = this._el.querySelector('#sendBtn')

    input.addEventListener('input', () => {
      this._syncComposeCharCount(input)
      this._syncSendReady()
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 100) + 'px'
    })

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._editingMsgId) {
        e.preventDefault()
        this._clearEditMode()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send() }
    })

    sendBtn.addEventListener('click', () => {
      if (sendBtn.dataset.mode === 'send') {
        this._send()
      } else {
        this._el.querySelector('#composeMediaInput')?.click()
      }
    })

    this._refresh()
    this._syncSendReady()
  }

  resume() { this._refresh() }

  destroy() {
    store.off('project-changed', this._onChange)
    try {
      if (this._audioRecorder && this._audioRecorder.state === 'recording') {
        this._audioRecorder.stop()
      }
    } catch {}
    this._stopAudioStream()
    this._hub?.dismiss()
    this._exportRail?.dismiss()
    this._stopComposeMusic()
    this._endBubblePress()
  }

  _refresh() {
    const p = store.getProject(this.projectId)
    if (!p) return

    const scene = store.getActiveScene(this.projectId)
    if (this._editingMsgId && this._editingSceneId !== scene?.id) {
      this._clearEditMode()
    }
    const totalMsgs = p.scenes.reduce((n, s) => n + s.messages.length, 0)

    this._el.querySelector('#sceneTitle').textContent = scene?.name || p.name
    this._el.querySelector('#sceneSub').textContent =
      `${p.scenes.length} scene${p.scenes.length !== 1 ? 's' : ''} · ${totalMsgs} messages`
    const status = store.getSceneStatusBar(this.projectId, scene?.id)
    const statusHost = this._el.querySelector('#statusBarHost')
    if (statusHost) statusHost.innerHTML = renderStatusBar(status)

    // Default active actor to first right-side actor
    if (!this._activeActorId || !p.actors.find(a => a.id === this._activeActorId)) {
      this._activeActorId = p.actors.find(a => a.side === 'right')?.id || p.actors[0]?.id || null
    }

    this._renderSpeakerStrip(p)
    this._renderCanvas(p, scene)
    this._syncComposeMusicTools(p)
  }

  _renderSpeakerStrip(p) {
    const strip = this._el.querySelector('#speakerStrip')
    const chips = p.actors.map(a => {
      const active = a.id === this._activeActorId
      const rgb = this._rgb(a.color)
      return `
        <div class="speaker-chip ${active ? 'active' : ''}" data-actor-id="${a.id}">
          <div class="chip-avatar" style="background:${a.color};${active ? `box-shadow:0 0 0 1.5px rgba(${rgb},0.6);` : ''}">${(a.name || '?')[0]}</div>
          <span class="chip-name">${a.name}</span>
        </div>`
    }).join('')
    strip.innerHTML = `
      <div class="speaker-mega-btn ${this._speakerphoneEnabled ? 'active' : ''}" id="speakerphoneBtn" title="Speakerphone">📣</div>
      <div class="speaker-strip-divider"></div>
      ${chips}
      <div class="speaker-add-chip" id="addActorChip" title="Add actor">+</div>
    `

    strip.querySelector('#speakerphoneBtn')?.addEventListener('click', () => {
      this._speakerphoneEnabled = !this._speakerphoneEnabled
      this._renderSpeakerStrip(p)
    })

    strip.querySelector('#addActorChip')?.addEventListener('click', () => {
      push('actor-editor', { projectId: this.projectId, actorId: null })
    })

    strip.querySelectorAll('.speaker-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._activeActorId = chip.dataset.actorId
        this._renderSpeakerStrip(p)
        this._syncComposePillBorder(p)
        this._el.querySelector('#composeInput').focus()
      })
    })

    this._syncComposePillBorder(p)
  }

  _renderCanvas(p, scene) {
    const canvas = this._el.querySelector('#convCanvas')
    if (!scene) {
      canvas.innerHTML = `<div class="empty-state"><p style="color:var(--t3);">No scenes yet.</p></div>`
      return
    }
    const rs = p.render_settings || {}
    this._el.classList.toggle('is-light', rs.dark_background === false)
    canvas.classList.toggle('is-light', rs.dark_background === false)

    const sceneHeader = `
      <div class="msg-timestamp">Today</div>
      <div class="scene-divider">
        <div class="scene-divider-rule left"></div>
        <div class="scene-divider-label">${scene.name.toUpperCase()}</div>
        <div class="scene-divider-rule right"></div>
      </div>`
    const sceneQuote = scene.quote
      ? `<div class="scene-quote">${scene.quote}</div>`
      : ''

    canvas.innerHTML = sceneHeader + renderMessages(scene.messages, p.actors, {
      projectId: this.projectId,
      sceneId: scene.id,
      showNames: rs.show_names !== false,
      showTimestamps: rs.show_timestamps === true,
    }) + sceneQuote
    canvas.scrollTop = canvas.scrollHeight

    // Bubble tap → context menu
    canvas.querySelectorAll('.bubble').forEach(bub => {
      const msgId = bub.dataset.msgId
      bub.addEventListener('pointerdown', e => this._beginBubblePress(e, bub, p, scene, msgId))
      bub.addEventListener('pointerup', () => this._endBubblePress())
      bub.addEventListener('pointercancel', () => this._endBubblePress())
      bub.addEventListener('pointerleave', () => this._endBubblePress())
      bub.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this._bubbleLongPressSuppressedMsgId === msgId) {
          this._bubbleLongPressSuppressedMsgId = null
          return
        }
        this._showBubbleMenu(bub, p, scene)
      })
    })
  }

  _beginBubblePress(e, bub, p, scene, msgId) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this._endBubblePress()
    this._bubbleLongPressTimer = window.setTimeout(() => {
      this._bubbleLongPressTimer = null
      this._bubbleLongPressSuppressedMsgId = msgId
      this._showReactionPicker(bub, p, scene, msgId)
    }, 320)
  }

  _endBubblePress() {
    if (this._bubbleLongPressTimer) {
      clearTimeout(this._bubbleLongPressTimer)
      this._bubbleLongPressTimer = null
    }
  }

  _showBubbleMenu(bub, p, scene) {
    document.querySelectorAll('.bubble-menu').forEach(m => m.remove())
    const msgId = bub.dataset.msgId
    const msg = scene.messages.find(m => m.id === msgId)
    const canEditText = Boolean((msg?.text || '').trim())
    const menu = document.createElement('div')
    menu.className = 'bubble-menu fade-in'
    menu.innerHTML = `
      ${canEditText ? '<div class="bubble-menu-item" data-action="edit">Edit</div>' : ''}
      <div class="bubble-menu-item" data-action="actor">Change actor</div>
      <div class="bubble-menu-item danger" data-action="delete">Delete</div>`

    const rect = bub.getBoundingClientRect()
    const appRect = document.getElementById('app').getBoundingClientRect()
    menu.style.position = 'absolute'
    menu.style.top  = `${rect.top - appRect.top - 10}px`
    menu.style.left = bub.closest('.msg-row.right')
      ? `${rect.left - appRect.left - 150 + rect.width}px`
      : `${rect.left - appRect.left}px`
    menu.style.zIndex = '500'
    document.getElementById('app').appendChild(menu)

    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
      store.deleteMessage(this.projectId, scene.id, msgId)
      if (this._editingMsgId === msgId && this._editingSceneId === scene.id) {
        this._clearEditMode()
      }
      menu.remove()
    })
    menu.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      const nextMsg = scene.messages.find(m => m.id === msgId)
      if (!nextMsg) return menu.remove()
      this._enterEditMode(scene.id, msgId, nextMsg.text)
      menu.remove()
    })
    menu.querySelector('[data-action="actor"]').addEventListener('click', () => {
      this._showActorPicker(bub, p, scene, msgId)
      menu.remove()
    })

    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50)
  }

  _showActorPicker(bub, p, scene, msgId) {
    document.querySelectorAll('.bubble-menu').forEach(m => m.remove())
    const message = scene.messages.find(m => m.id === msgId)
    if (!message) return

    const picker = document.createElement('div')
    picker.className = 'bubble-menu actor-picker fade-in'
    picker.innerHTML = p.actors.map(actor => {
      const active = actor.id === message.actor_id
      return `
        <div class="bubble-menu-item actor-option ${active ? 'active' : ''}" data-actor-id="${actor.id}">
          <span class="actor-dot" style="background:${actor.color}"></span>
          <span>${actor.name}</span>
        </div>`
    }).join('')

    const rect = bub.getBoundingClientRect()
    const appRect = document.getElementById('app').getBoundingClientRect()
    picker.style.position = 'absolute'
    picker.style.top = `${rect.top - appRect.top - 10}px`
    picker.style.left = bub.closest('.msg-row.right')
      ? `${rect.left - appRect.left - 180 + rect.width}px`
      : `${rect.left - appRect.left}px`
    picker.style.zIndex = '500'
    document.getElementById('app').appendChild(picker)

    picker.querySelectorAll('.actor-option').forEach(opt => {
      opt.addEventListener('click', () => {
        store.updateMessage(this.projectId, scene.id, msgId, { actor_id: opt.dataset.actorId })
        picker.remove()
      })
    })

    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50)
  }

  _showReactionPicker(bub, p, scene, msgId) {
    document.querySelectorAll('.bubble-menu').forEach(m => m.remove())
    const message = scene.messages.find(m => m.id === msgId)
    if (!message) return

    const picker = document.createElement('div')
    picker.className = 'bubble-menu emoji-menu reaction-menu fade-in'
    const emojis = ['❤️', '😂', '😮', '😢', '🔥', '👏']
    picker.innerHTML = emojis.map(emoji => {
      const active = message.reaction === emoji
      return `<div class="emoji-item ${active ? 'active' : ''}" data-emoji="${emoji}">${emoji}</div>`
    }).join('')

    const rect = bub.getBoundingClientRect()
    const appRect = document.getElementById('app').getBoundingClientRect()
    const width = 214
    const height = 86
    const isRight = !!bub.closest('.msg-row.right')
    const left = isRight
      ? Math.max(10, Math.min(rect.right - appRect.left - width, appRect.width - width - 10))
      : Math.max(10, Math.min(rect.left - appRect.left, appRect.width - width - 10))
    const below = rect.bottom - appRect.top + 10
    const above = rect.top - appRect.top - height - 10
    const top = above > 10 ? above : below

    picker.style.position = 'absolute'
    picker.style.left = `${left}px`
    picker.style.top = `${Math.max(10, top)}px`
    picker.style.zIndex = '520'
    document.getElementById('app').appendChild(picker)

    picker.querySelectorAll('.emoji-item').forEach(item => {
      item.addEventListener('click', () => {
        const nextReaction = message.reaction === item.dataset.emoji ? null : item.dataset.emoji
        store.updateMessage(this.projectId, scene.id, msgId, { reaction: nextReaction })
        picker.remove()
      })
    })

    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 50)
  }

  _send() {
    const input = this._el.querySelector('#composeInput')
    const text = input.value.trim()
    const hasAttachment = Boolean(this._composePendingMedia || this._composePendingAudio)
    if (!this._activeActorId) return

    const scene = store.getActiveScene(this.projectId)
    if (!scene) return

    if (this._editingMsgId) {
      if (!text) {
        this._snack('Message text cannot be empty when editing.')
        input.focus()
        return
      }
      const editingScene = store.getScene(this.projectId, this._editingSceneId)
      const targetMsg = editingScene?.messages?.find(m => m.id === this._editingMsgId)
      if (!editingScene || !targetMsg) {
        this._clearEditMode()
        this._snack('Message no longer exists. Edit canceled.')
        return
      }
      store.updateMessage(this.projectId, this._editingSceneId, this._editingMsgId, { text })
      this._clearEditMode({ preserveText: false })
    } else {
      if (!text && !hasAttachment) return
      const extras = {}
      if (this._composePendingMedia) extras.media = this._composePendingMedia
      if (this._composePendingAudio) extras.audio = this._composePendingAudio
      store.addMessage(this.projectId, scene.id, this._activeActorId, text, extras)
    }

    input.value = ''
    this._composePendingMedia = ''
    this._composePendingAudio = ''
    input.style.height = 'auto'
    input.dispatchEvent(new Event('input'))
    this._syncComposeMediaPreview()
    this._syncSendReady()
  }

  _syncSendReady() {
    const input = this._el?.querySelector('#composeInput')
    const sendBtn = this._el?.querySelector('#sendBtn')
    if (!input || !sendBtn) return
    const hasText = input.value.trim().length > 0
    sendBtn.dataset.mode = hasText ? 'send' : 'add'
    sendBtn.innerHTML = hasText ? icons.send : icons.add
    sendBtn.classList.toggle('ready', hasText)
  }

  _enterEditMode(sceneId, msgId, text) {
    const input = this._el.querySelector('#composeInput')
    const cancelBtn = this._el.querySelector('#cancelEditBtn')
    this._editingMsgId = msgId
    this._editingSceneId = sceneId
    this._composePendingMedia = ''
    this._composePendingAudio = ''
    input.value = String(text || '')
    input.placeholder = 'Edit message…'
    input.dispatchEvent(new Event('input'))
    this._syncComposeMediaPreview()
    if (cancelBtn) cancelBtn.style.display = 'flex'
    input.focus()
  }

  _clearEditMode(opts = {}) {
    const { preserveText = false } = opts
    const input = this._el?.querySelector('#composeInput')
    const cancelBtn = this._el?.querySelector('#cancelEditBtn')
    this._editingMsgId = null
    this._editingSceneId = null
    if (input) {
      if (!preserveText) input.value = ''
      input.placeholder = 'Message…'
      input.dispatchEvent(new Event('input'))
    }
    if (cancelBtn) cancelBtn.style.display = 'none'
    this._syncSendReady()
  }

  _openHub() {
    const overlayLayer = document.getElementById('overlay-layer')
    this._hub = new HubPanel(overlayLayer, this.projectId, () => { this._hub = null; this._refresh() })
    this._hub.mount()
  }

  _openExport() {
    const overlayLayer = document.getElementById('overlay-layer')
    this._exportRail = new ExportRail(overlayLayer, this.projectId, () => { this._exportRail = null })
    this._exportRail.mount()
  }

  _toggleAudioPill() {
    this._setAudioPillOpen(!this._audioToolsOpen)
  }

  _setAudioPillOpen(isOpen) {
    this._audioToolsOpen = Boolean(isOpen)
    const pill = this._el.querySelector('#audioPill')
    const sub = this._el.querySelector('#audioPillSub')
    if (pill) pill.classList.toggle('open', this._audioToolsOpen)
    if (sub) sub.textContent = this._audioToolsOpen ? 'Ready for voice and media tools' : 'Hidden while typing'
    this._syncComposeMediaPreview()
    this._syncComposeMusicTools()
  }

  async _toggleAudioRecording() {
    if (this._audioRecorder && this._audioRecorder.state === 'recording') {
      this._audioRecorder.stop()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this._snack('Recording is not available in this browser.')
      return
    }

    try {
      this._audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this._audioChunks = []
      this._audioRecorder = new MediaRecorder(this._audioStream)
      this._audioRecordStart = performance.now()
      this._audioRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) this._audioChunks.push(event.data)
      }
      this._audioRecorder.onstop = () => {
        const blob = new Blob(this._audioChunks, { type: this._audioRecorder?.mimeType || 'audio/webm' })
        this._audioChunks = []
        this._stopAudioStream()
        const reader = new FileReader()
        reader.onload = () => {
          this._composePendingAudio = String(reader.result || '')
          this._syncComposeMediaPreview()
          this._syncSendReady()
          this._snack('Voice note ready. Tap send to post.')
        }
        reader.readAsDataURL(blob)
      }
      this._audioRecorder.start()
      this._audioRecordTick = window.setInterval(() => this._syncComposeMusicTools(), 100)
      this._snack('Recording voice note...')
      const btn = this._el.querySelector('#audioRecordBtn')
      if (btn) btn.textContent = 'Stop'
      this._syncComposeMusicTools()
    } catch {
      this._stopAudioStream()
      this._snack('Could not access microphone.')
    }
  }

  _stopAudioStream() {
    try {
      this._audioStream?.getTracks?.().forEach(track => track.stop())
    } catch {}
    this._audioStream = null
    this._audioRecorder = null
    this._audioRecordStart = 0
    if (this._audioRecordTick) clearInterval(this._audioRecordTick)
    this._audioRecordTick = null
    const btn = this._el.querySelector('#audioRecordBtn')
    if (btn) btn.textContent = 'Record'
  }

  _syncComposeCharCount(input) {
    const field = input || this._el.querySelector('#composeInput')
    const label = this._el.querySelector('#composeCount')
    if (!field || !label) return

    const limit = this._composeCharLimit
    if (field.value.length > limit) {
      const start = field.selectionStart ?? limit
      const end = field.selectionEnd ?? limit
      field.value = field.value.slice(0, limit)
      const nextPos = Math.min(limit, start)
      field.setSelectionRange(nextPos, Math.min(limit, end))
    }

    const length = field.value.length
    label.textContent = `${length}/${limit}`
    label.classList.toggle('warn', length >= Math.floor(limit * 0.8))
  }

  _syncComposePillBorder(p = store.getProject(this.projectId)) {
    const pill = this._el?.querySelector('#composePill')
    if (!pill || !p) return
    const actor = (p.actors || []).find(a => a.id === this._activeActorId) || p.actors?.[0]
    if (!actor?.color) return
    const rgb = hexToRgb(actor.color)
    pill.style.border = `1px solid rgba(${rgb},0.50)`
  }

  _pickComposeMedia(input) {
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      this._composePendingMedia = String(reader.result || '')
      this._syncComposeMediaPreview()
      this._setAudioPillOpen(true)
      this._syncSendReady()
    }
    reader.readAsDataURL(file)
    input.value = ''
  }

  _pickComposeAudio(input) {
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      this._composePendingAudio = String(reader.result || '')
      this._syncComposeMediaPreview()
      this._setAudioPillOpen(true)
      this._syncSendReady()
    }
    reader.readAsDataURL(file)
    input.value = ''
  }

  _pickComposeMusic(input) {
    const file = input?.files?.[0]
    if (!file) return
    this._uploadComposeMusic(file)
    input.value = ''
  }

  async _uploadComposeMusic(file) {
    this._snack('Uploading music…')
    try {
      const fd = new FormData()
      fd.append('music', file)
      const resp = await fetch('/api/music-upload', { method: 'POST', body: fd })
      const data = await resp.json()
      if (!resp.ok || !data?.path) {
        throw new Error(data?.error || 'Upload failed')
      }

      const previewUrl = data.url || URL.createObjectURL(file)
      this._setComposeMusicSource(previewUrl, file.name)
      store.updateRenderSettings(this.projectId, {
        music_path: data.path,
        music_title: file.name,
        music_preview_url: data.url || '',
      })
      this._snack(`Music selected: ${file.name}`)
    } catch (err) {
      const previewUrl = URL.createObjectURL(file)
      this._setComposeMusicSource(previewUrl, file.name)
      store.updateRenderSettings(this.projectId, {
        music_path: null,
        music_title: file.name,
        music_preview_url: '',
      })
      this._snack(err?.message || 'Could not upload music file')
      this._snack('Using local preview only. Export music requires backend upload.')
    }
  }

  _setComposeMusicSource(url, title) {
    this._stopComposeMusic()
    this._composeMusicUrl = url || ''
    this._composeMusicTitle = title || ''
    if (!url) {
      this._syncComposeMusicTools()
      return
    }

    const audio = new Audio(url)
    this._composeMusicAudio = audio
    audio.addEventListener('loadedmetadata', () => this._syncComposeMusicTools())
    audio.addEventListener('timeupdate', () => this._syncComposeMusicTools())
    audio.addEventListener('ended', () => this._syncComposeMusicTools())
    audio.preload = 'metadata'
    this._composeMusicTitle = title || 'Selected audio'
    this._syncComposeMusicTools()
  }

  _syncComposeMusicTools(p = store.getProject(this.projectId)) {
    const rs = p?.render_settings || {}
    const title = this._el?.querySelector('#composeMusicTitle')
    const sub = this._el?.querySelector('#composeMusicSub')
    const now = this._el?.querySelector('#composeMusicNow')
    const total = this._el?.querySelector('#composeMusicTotal')
    const seek = this._el?.querySelector('#composeMusicSeek')
    const playBtn = this._el?.querySelector('#composeMusicPlayBtn')
    const rewindBtn = this._el?.querySelector('#composeMusicRewindBtn')
    const volume = this._el?.querySelector('#composeMusicVolume')
    const volumeLabel = this._el?.querySelector('#composeMusicVolumeLabel')
    const loop = this._el?.querySelector('#composeMusicLoop')
    const fade = this._el?.querySelector('#composeMusicFade')
    const exportPath = rs.music_path || ''
    const url = this._composeMusicUrl || rs.music_preview_url || ''
    const musicTitle = rs.music_title || this._composeMusicTitle || (url ? 'Selected audio' : 'No audio selected')
    const musicVolume = Number.isFinite(Number(rs.music_volume)) ? Math.max(0, Math.min(1, Number(rs.music_volume))) : 0.7
    const musicLoop = rs.loop_music !== false
    const musicFade = rs.fade_music !== false

    if (title) title.textContent = musicTitle
    if (volume) volume.value = String(Math.round(musicVolume * 100))
    if (volumeLabel) volumeLabel.textContent = `${Math.round(musicVolume * 100)}%`
    if (loop) loop.checked = musicLoop
    if (fade) fade.checked = musicFade

    if (!url) {
      if (sub) sub.textContent = exportPath ? 'Track linked for export. Pick again to preview.' : 'Pick a background track for this story'
      if (now) now.textContent = '00:00.0'
      if (total) total.textContent = '00:00'
      if (seek) {
        seek.value = '0'
        seek.max = '0.1'
        seek.disabled = true
      }
      if (playBtn) {
        playBtn.textContent = '▶'
        playBtn.disabled = true
      }
      if (rewindBtn) rewindBtn.disabled = true
      return
    }

    if (!this._composeMusicAudio || this._composeMusicUrl !== url) {
      this._setComposeMusicSource(url, musicTitle)
      return
    }

    const audio = this._composeMusicAudio
    audio.loop = musicLoop
    audio.volume = musicVolume
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0.1
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    const recording = Boolean(this._audioRecorder && this._audioRecorder.state === 'recording')
    if (sub) sub.textContent = recording ? 'Recording voice note...' : (audio.paused ? 'Ready to preview this track' : 'Previewing background music')
    if (recording) {
      const heldFor = Math.max(0, (performance.now() - this._audioRecordStart) / 1000)
      if (now) now.textContent = this._formatMusicClock(heldFor, true)
      if (total) total.textContent = 'REC'
    } else {
      if (now) now.textContent = this._formatMusicClock(current, true)
      if (total) total.textContent = this._formatMusicClock(duration, false)
    }
    if (seek) {
      seek.max = String(Math.max(0.1, duration))
      seek.value = String(Math.min(current, duration))
      seek.disabled = recording
      if (!seek.dataset.bound) {
        seek.dataset.bound = '1'
        seek.addEventListener('input', () => {
          if (!this._composeMusicAudio) return
          this._composeMusicAudio.currentTime = Number(seek.value || 0)
          this._syncComposeMusicTools()
        })
      }
    }
    if (playBtn) {
      playBtn.textContent = audio.paused ? '▶' : '❚❚'
      playBtn.disabled = recording
    }
    if (rewindBtn) rewindBtn.disabled = recording
  }

  _setComposeMusicVolume(input) {
    const raw = Number(input?.value || 0)
    const volume = Math.max(0, Math.min(100, raw)) / 100.0
    store.updateRenderSettings(this.projectId, { music_volume: volume })
    if (this._composeMusicAudio) this._composeMusicAudio.volume = volume
    this._syncComposeMusicTools()
  }

  _setComposeMusicFlags(patch) {
    store.updateRenderSettings(this.projectId, patch)
    this._syncComposeMusicTools()
  }

  _toggleComposeMusicPlay() {
    const audio = this._composeMusicAudio
    if (!audio) {
      this._snack('Pick audio first.')
      return
    }
    if (audio.paused) {
      audio.play().catch(() => this._snack('Could not play audio preview.'))
    } else {
      audio.pause()
    }
    this._syncComposeMusicTools()
  }

  _rewindComposeMusic() {
    const audio = this._composeMusicAudio
    if (!audio) return
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5)
    this._syncComposeMusicTools()
  }

  _clearComposeMusic() {
    this._stopComposeMusic()
    store.updateRenderSettings(this.projectId, { music_path: null, music_title: '', music_preview_url: '' })
    this._syncComposeMusicTools()
  }

  _stopComposeMusic() {
    try {
      if (this._composeMusicAudio) {
        this._composeMusicAudio.pause()
        this._composeMusicAudio.src = ''
      }
    } catch {}
    try {
      if (this._composeMusicUrl && this._composeMusicUrl.startsWith('blob:')) {
        URL.revokeObjectURL(this._composeMusicUrl)
      }
    } catch {}
    this._composeMusicAudio = null
    this._composeMusicUrl = ''
    this._composeMusicTitle = ''
  }

  _playPendingAudio() {
    if (!this._composePendingAudio) {
      this._snack('Attach or record audio first.')
      return
    }
    try {
      const audio = new Audio(this._composePendingAudio)
      audio.play().catch(() => {})
    } catch {
      this._snack('Could not preview that audio clip.')
    }
  }

  _restartPendingAudio() {
    if (!this._composePendingAudio) {
      this._snack('Attach or record audio first.')
      return
    }
    this._playPendingAudio()
  }

  _syncComposeMediaPreview() {
    const wrap = this._el.querySelector('#audioPillPreview')
    if (!wrap) return
    if (!this._composePendingMedia) {
      if (!this._composePendingAudio) {
        wrap.innerHTML = ''
        return
      }
    }
    const parts = []
    if (this._composePendingMedia) {
      parts.push(`<div class="audio-pill-thumb"><img src="${this._composePendingMedia}" alt="attachment preview"><span>Image ready</span><button class="audio-pill-mini-btn" id="clearPendingMediaBtn" type="button">✕</button></div>`)
    }
    if (this._composePendingAudio) {
      parts.push(`<div class="audio-pill-thumb"><span>Audio ready</span><audio class="bubble-audio" controls src="${this._composePendingAudio}"></audio><button class="audio-pill-mini-btn" id="clearPendingAudioBtn" type="button">✕</button></div>`)
    }
    wrap.innerHTML = parts.join('')

    wrap.querySelector('#clearPendingMediaBtn')?.addEventListener('click', () => {
      this._composePendingMedia = ''
      this._syncComposeMediaPreview()
      this._syncSendReady()
    })
    wrap.querySelector('#clearPendingAudioBtn')?.addEventListener('click', () => {
      this._composePendingAudio = ''
      this._syncComposeMediaPreview()
      this._syncSendReady()
    })
  }

  _toggleEmojiPicker(anchor) {
    document.querySelectorAll('.emoji-menu').forEach(m => m.remove())
    const menu = document.createElement('div')
    menu.className = 'bubble-menu emoji-menu fade-in'
    const emojis = ['😀','😂','😍','🥲','😎','🔥','✨','💬','❤️','👍']
    menu.innerHTML = emojis.map(emoji => `<div class="emoji-item" data-emoji="${emoji}">${emoji}</div>`).join('')

    const rect = anchor.getBoundingClientRect()
    const appRect = document.getElementById('app').getBoundingClientRect()
    menu.style.position = 'absolute'
    menu.style.right = `${Math.max(12, appRect.width - (rect.right - appRect.left))}px`
    menu.style.bottom = `${Math.max(70, appRect.height - (rect.top - appRect.top))}px`
    menu.style.zIndex = '520'
    document.getElementById('app').appendChild(menu)

    menu.querySelectorAll('.emoji-item').forEach(item => {
      item.addEventListener('click', () => {
        this._insertEmoji(item.dataset.emoji)
        menu.remove()
      })
    })

    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50)
  }

  _insertEmoji(emoji) {
    const input = this._el.querySelector('#composeInput')
    if (!input) return
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`
    const nextPos = start + emoji.length
    input.setSelectionRange(nextPos, nextPos)
    input.dispatchEvent(new Event('input'))
    input.focus()
  }

  _rgb(hex) {
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    return `${r},${g},${b}`
  }
}

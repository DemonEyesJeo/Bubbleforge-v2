import { store } from '../store.js'
import { push, pop } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'
import { renderMessages, renderTypingIndicator } from '../components/bubble.js'
import { HubPanel } from '../components/hub-panel.js'
import { ExportRail } from '../components/export-rail.js'

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
    this._onChange = () => this._refresh()
  }

  render() {
    const el = document.createElement('div')
    el.innerHTML = `
      <div class="status-bar">
        <span class="time">9:41</span>
        ${statusIcons()}
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
            <div class="audio-pill-track"><div class="audio-pill-fill" style="width:38%"></div></div>
          </div>
        </div>
        <div class="compose-row">
          <div class="nav-btn" id="audioToggleBtn" title="Audio">${icons.music}</div>
          <textarea class="compose-input" id="composeInput" rows="1" placeholder="Message…"></textarea>
          <div class="compose-count" id="composeCount">0 / 160</div>
          <div class="nav-btn" id="emojiBtn" title="Emoji">${icons.emoji}</div>
          <input id="composeAudioInput" type="file" accept="audio/*" hidden />
          <input id="composeCameraInput" type="file" accept="image/*" capture="environment" hidden />
          <input id="composeMediaInput" type="file" accept="image/*" hidden />
          <div class="nav-btn" id="cameraBtn" title="Camera">${icons.camera}</div>
          <div class="nav-btn" id="mediaBtn" title="Attach image">${icons.image}</div>
          <div class="nav-btn" id="exportBtn" title="Export">${icons.export}</div>
          <div class="send-btn" id="sendBtn">${icons.send}</div>
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
    this._el.querySelector('#exportBtn').addEventListener('click', () => this._openExport())
    this._el.querySelector('#audioToggleBtn').addEventListener('click', () => this._toggleAudioPill())
    this._el.querySelector('#audioAttachBtn').addEventListener('click', () => this._el.querySelector('#composeAudioInput')?.click())
    this._el.querySelector('#audioRecordBtn').addEventListener('click', () => this._toggleAudioRecording())
    this._el.querySelector('#cameraBtn').addEventListener('click', () => this._el.querySelector('#composeCameraInput')?.click())
    this._el.querySelector('#mediaBtn').addEventListener('click', () => this._el.querySelector('#composeMediaInput')?.click())
    this._el.querySelector('#composeAudioInput').addEventListener('change', e => this._pickComposeAudio(e.target))
    this._el.querySelector('#composeCameraInput').addEventListener('change', e => this._pickComposeMedia(e.target))
    this._el.querySelector('#composeMediaInput').addEventListener('change', e => this._pickComposeMedia(e.target))
    this._el.querySelector('#emojiBtn').addEventListener('click', e => this._toggleEmojiPicker(e.currentTarget))

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
      sendBtn.classList.toggle('ready', input.value.trim().length > 0)
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 100) + 'px'
    })

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send() }
    })

    sendBtn.addEventListener('click', () => this._send())

    this._refresh()
  }

  resume() { this._refresh() }

  destroy() {
    store.off('project-changed', this._onChange)
    this._hub?.dismiss()
    this._exportRail?.dismiss()
    this._endBubblePress()
  }

  _refresh() {
    const p = store.getProject(this.projectId)
    if (!p) return

    const scene = store.getActiveScene(this.projectId)
    const totalMsgs = p.scenes.reduce((n, s) => n + s.messages.length, 0)

    this._el.querySelector('#sceneTitle').textContent = scene?.name || p.name
    this._el.querySelector('#sceneSub').textContent =
      `${p.scenes.length} scene${p.scenes.length !== 1 ? 's' : ''} · ${totalMsgs} messages`

    // Default active actor to first right-side actor
    if (!this._activeActorId || !p.actors.find(a => a.id === this._activeActorId)) {
      this._activeActorId = p.actors.find(a => a.side === 'right')?.id || p.actors[0]?.id || null
    }

    this._renderSpeakerStrip(p)
    this._renderCanvas(p, scene)
  }

  _renderSpeakerStrip(p) {
    const strip = this._el.querySelector('#speakerStrip')
    strip.innerHTML = p.actors.map(a => {
      const active = a.id === this._activeActorId
      const rgb = this._rgb(a.color)
      const avatarStyle = a.avatar
        ? `background-image:url('${a.avatar.replace(/'/g, '%27')}');background-size:cover;background-position:center;${active ? `box-shadow:0 0 0 1.5px rgba(${rgb},0.4);` : ''}`
        : `background:${a.color};${active ? `box-shadow:0 0 0 1.5px rgba(${rgb},0.4);` : ''}`
      return `
        <div class="speaker-chip ${active ? 'active' : ''}" data-actor-id="${a.id}">
          <div class="chip-avatar" style="${avatarStyle}">${a.avatar ? '' : a.name[0]}</div>
          <span class="chip-name">${a.name}</span>
        </div>`
    }).join('')

    strip.querySelectorAll('.speaker-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._activeActorId = chip.dataset.actorId
        this._renderSpeakerStrip(p)
        this._el.querySelector('#composeInput').focus()
      })
    })
  }

  _renderCanvas(p, scene) {
    const canvas = this._el.querySelector('#convCanvas')
    if (!scene) {
      canvas.innerHTML = `<div class="empty-state"><p style="color:var(--t3);">No scenes yet.</p></div>`
      return
    }

    const sceneHeader = `
      <div class="msg-timestamp">Today</div>
      <div class="scene-divider">
        <div class="scene-divider-rule left"></div>
        <div class="scene-divider-label">${scene.name.toUpperCase()}</div>
        <div class="scene-divider-rule right"></div>
      </div>`

    canvas.innerHTML = sceneHeader + renderMessages(scene.messages, p.actors)
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
    const menu = document.createElement('div')
    menu.className = 'bubble-menu fade-in'
    menu.innerHTML = `
      <div class="bubble-menu-item" data-action="edit">Edit</div>
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
      menu.remove()
    })
    menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
      const msg = scene.messages.find(m => m.id === msgId)
      if (!msg) return menu.remove()
      const input = this._el.querySelector('#composeInput')
      input.value = msg.text
      input.dispatchEvent(new Event('input'))
      this._editingMsgId = msgId
      this._editingSceneId = scene.id
      menu.remove()
      input.focus()
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
    if (!text || !this._activeActorId) return

    const scene = store.getActiveScene(this.projectId)
    if (!scene) return

    if (this._editingMsgId) {
      store.updateMessage(this.projectId, this._editingSceneId, this._editingMsgId, { text })
      this._editingMsgId = null
      this._editingSceneId = null
    } else {
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
    this._audioToolsOpen = !this._audioToolsOpen
    const pill = this._el.querySelector('#audioPill')
    const sub = this._el.querySelector('#audioPillSub')
    if (pill) pill.classList.toggle('open', this._audioToolsOpen)
    if (sub) sub.textContent = this._audioToolsOpen ? 'Ready for voice and media tools' : 'Hidden while typing'
    this._syncComposeMediaPreview()
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
          this._snack('Voice note ready. Tap send to post.')
        }
        reader.readAsDataURL(blob)
      }
      this._audioRecorder.start()
      this._snack('Recording voice note...')
      const btn = this._el.querySelector('#audioRecordBtn')
      if (btn) btn.textContent = 'Stop'
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
    label.textContent = `${length} / ${limit}`
    label.classList.toggle('warn', length >= Math.floor(limit * 0.8))
  }

  _pickComposeMedia(input) {
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      this._composePendingMedia = String(reader.result || '')
      this._syncComposeMediaPreview()
      this._toggleAudioPill()
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
      this._toggleAudioPill()
    }
    reader.readAsDataURL(file)
    input.value = ''
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
      parts.push(`<div class="audio-pill-thumb"><img src="${this._composePendingMedia}" alt="attachment preview"><span>Image ready</span></div>`)
    }
    if (this._composePendingAudio) {
      parts.push(`<div class="audio-pill-thumb"><span>Audio ready</span><audio class="bubble-audio" controls src="${this._composePendingAudio}"></audio></div>`)
    }
    wrap.innerHTML = parts.join('')
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

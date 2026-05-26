import { store } from '../store.js'
import { push, pop } from '../router.js'
import { icons } from '../components/icons.js'
import { renderMessages, renderTypingIndicator, hexToRgb } from '../components/bubble.js'
import { createEmojiPicker } from '../components/emoji-picker.js'

const DEFAULT_DIVIDER_STYLE = {
  date_label: 'Today',
  show_date: true,
  show_name: true,
  line_style: 'gradient',
  line_opacity: 0.08,
  label_color: 'muted',
  label_case: 'upper',
}
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
    this._composePendingFile = null
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
    this._onRootClick = (e) => this._handleRootClick(e)
    this._bubbleOptionsOverlay = null
    this._bubbleOptionsSheet = null
    this._dragSrcId = null
    this._removeCanvasDragListeners = null
    this._emojiPicker = null
    this._inlineEmojiPicker = null
    this._reorderMode = false
    this._attachSheetOverlay = null
    this._attachSheet = null
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
        </div>
        <div class="nav-actions">
          <div class="nav-btn" id="playBtn" title="Preview">${icons.play}</div>
          <div class="nav-btn" id="menuBtn" title="Menu">${icons.dots}</div>
        </div>
      </div>
      <div class="reorder-banner" id="reorderBanner">Drag to reorder - tap ✓ when done</div>
      <div class="conversation-canvas" id="convCanvas"></div>
      <div class="command-center">
        <div class="speaker-strip" id="speakerStrip"></div>
        <div class="audio-pill" id="audioPill">
          <div class="audio-pill-grid">
            <div class="audio-pill-button" data-action="mic">${icons.mic}</div>
            <div class="audio-pill-button" data-action="play">${icons.play}</div>
            <div class="audio-pill-button" data-action="rewind">${icons.rewind}</div>
          </div>
          <div class="audio-pill-divider"></div>
          <div class="audio-pill-timeline">
            <div class="audio-pill-title">Audio tools</div>
            <div class="audio-pill-sub" id="audioPillSub">Background track and voice tools</div>
              <div class="audio-pill-actions">
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
          <div class="compose-music-btn" id="audioToggleBtn" title="Audio">${icons.music}</div>
          <div class="compose-pill" id="composePill">
            <div class="compose-emoji-btn" id="emojiBtn" title="Emoji">${icons.emoji}</div>
            <div class="compose-attachment-preview" id="composeAttachmentPreview"></div>
            <textarea class="compose-input" id="composeInput" rows="1" placeholder="Message…"></textarea>
            <div class="compose-count" id="composeCount">0/160</div>
          </div>
          <div class="send-btn" id="sendBtn">${icons.add}</div>
          <input id="composeMusicInput" type="file" accept="audio/*" hidden />
          <input id="composeAudioInput" type="file" accept="audio/*" hidden />
          <input id="composeCameraInput" type="file" accept="image/*" capture="environment" hidden />
          <input id="composeMediaInput" type="file" accept="image/*" hidden />
          <input id="composeFileInput" type="file" hidden />
          <div class="nav-btn" id="cancelEditBtn" title="Cancel edit" style="display:none;">✕</div>
        </div>
      </div>`
    return el
  }

  bind() {
    store.on('project-changed', this._onChange)
    this._el.addEventListener('click', this._onRootClick)

    this._el.querySelector('#backBtn').addEventListener('click', () => pop())
    this._el.querySelector('#statusBarHost')?.addEventListener('click', () => this._openHub('status'))
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
    this._el.querySelector('#audioRecordBtn').addEventListener('click', () => this._toggleAudioRecording())
    this._el.querySelector('#composeMusicInput').addEventListener('change', e => this._pickComposeMusic(e.target))
    this._el.querySelector('#composeAudioInput').addEventListener('change', e => this._pickComposeAudio(e.target))
    this._el.querySelector('#composeCameraInput').addEventListener('change', e => this._pickComposeMedia(e.target))
    this._el.querySelector('#composeMediaInput').addEventListener('change', e => this._pickComposeMedia(e.target))
    this._el.querySelector('#composeFileInput').addEventListener('change', e => this._pickComposeFile(e.target))
    this._el.querySelector('#emojiBtn').addEventListener('click', () => this._toggleEmojiPicker())
    this._el.querySelector('#cancelEditBtn').addEventListener('click', () => this._clearEditMode())

    this._el.querySelectorAll('.audio-pill-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action
        if (action === 'play') {
          this._playPendingAudio()
        } else if (action === 'rewind') {
          this._restartPendingAudio()
        } else if (action === 'mic') {
          this._toggleAudioRecording()
        }
      })
    })

    const input = this._el.querySelector('#composeInput')
    const sendBtn = this._el.querySelector('#sendBtn')
    input.setAttribute('maxlength', String(this._composeCharLimit))

    input.addEventListener('input', () => {
      this._autoGrowComposeInput(input)
      this._syncComposeCharCount(input)
      this._updateMorphBtn()
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
        this._showAttachSheet()
      }
    })

    const canvas = this._el.querySelector('#convCanvas')
    let activeHandle = null

    const clearDragHandle = () => {
      if (!activeHandle) return
      const row = activeHandle.closest('.msg-row')
      row?.removeAttribute('draggable')
      activeHandle.classList.remove('dragging')
      activeHandle = null
    }

    const onPointerDown = (e) => {
      if (!this._reorderMode) return
      const handle = e.target.closest('.msg-drag-handle')
      if (!handle) return
      e.preventDefault()
      e.stopPropagation()
      const row = handle.closest('.msg-row')
      if (!row) return
      row.setAttribute('draggable', 'true')
      handle.classList.add('dragging')
      activeHandle = handle
    }

    const onPointerUp = () => clearDragHandle()

    const onDragStart = (e) => {
      if (!this._reorderMode) return
      const row = e.target.closest('.msg-row[draggable]')
      if (!row) return
      this._dragSrcId = row.dataset.msgId || null
      row.classList.add('drag-source')
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
      }
    }

    const onDragOver = (e) => {
      if (!this._reorderMode) return
      e.preventDefault()
      const row = e.target.closest('.msg-row')
      if (!row || row.dataset.msgId === this._dragSrcId) return
      canvas.querySelectorAll('.msg-row.drag-over').forEach(r => r.classList.remove('drag-over'))
      row.classList.add('drag-over')
    }

    const onDrop = (e) => {
      if (!this._reorderMode) return
      e.preventDefault()
      const row = e.target.closest('.msg-row')
      if (!row || !this._dragSrcId || row.dataset.msgId === this._dragSrcId) return
      const scene = store.getActiveScene(this.projectId)
      if (!scene) return
      const targetId = row.dataset.msgId
      store.reorderMessage(this.projectId, scene.id, this._dragSrcId, targetId)
      this._dragSrcId = null
      canvas.querySelectorAll('.drag-over, .drag-source').forEach(r => r.classList.remove('drag-over', 'drag-source'))
    }

    const onDragEnd = () => {
      this._dragSrcId = null
      canvas.querySelectorAll('.drag-over, .drag-source').forEach(r => r.classList.remove('drag-over', 'drag-source'))
      canvas.querySelectorAll('.msg-row[draggable]').forEach(r => r.removeAttribute('draggable'))
      clearDragHandle()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('dragstart', onDragStart)
    canvas.addEventListener('dragover', onDragOver)
    canvas.addEventListener('drop', onDrop)
    canvas.addEventListener('dragend', onDragEnd)

    this._removeCanvasDragListeners = () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('dragstart', onDragStart)
      canvas.removeEventListener('dragover', onDragOver)
      canvas.removeEventListener('drop', onDrop)
      canvas.removeEventListener('dragend', onDragEnd)
    }

    this._refresh()
    this._autoGrowComposeInput(input)
    this._syncComposeCharCount(input)
    this._updateMorphBtn()
    this._syncReorderUI()
  }

  resume() { this._refresh() }

  destroy() {
    store.off('project-changed', this._onChange)
    this._el?.removeEventListener('click', this._onRootClick)
    this._removeCanvasDragListeners?.()
    this._removeCanvasDragListeners = null
    try {
      if (this._audioRecorder && this._audioRecorder.state === 'recording') {
        this._audioRecorder.stop()
      }
    } catch {}
    this._stopAudioStream()
    this._hub?.dismiss()
    this._exportRail?.dismiss()
    this._closeBubbleOptionsSheet(true)
    this._closeAttachSheet(true)
    this._closeEmojiPicker()
    this._closeInlineEmojiPicker()
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
    this._el.querySelector('#sceneTitle').textContent = scene?.name || p.name
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
    this._syncReorderUI()
  }

  _renderSpeakerStrip(p) {
    const strip = this._el.querySelector('#speakerStrip')
    const chips = p.actors.map((a, idx) => {
      const active = a.id === this._activeActorId
      const rgb = this._rgb(a.color)
      const avatar = a.avatar
        ? `<img class="chip-avatar-img" src="${this._escHtml(a.avatar)}" alt="${this._escHtml(a.name || 'Actor')}" />`
        : `${(a.name || '?')[0]}`
      return `
        <div class="speaker-chip ${active ? 'active' : ''} ${idx === 0 ? 'main' : ''} ${idx === 1 ? 'rest-start' : ''}" data-actor-id="${a.id}">
          <div class="chip-avatar" style="background:${a.color};${active ? `box-shadow:0 0 0 1.5px rgba(${rgb},0.6);` : ''}">${avatar}</div>
          <span class="chip-name">${a.name}</span>
          ${idx === 0 ? '<span class="speaker-main-indicator">main</span>' : ''}
        </div>`
    }).join('')
    strip.innerHTML = `
      <div class="speaker-mega-btn ${this._speakerphoneEnabled ? 'active' : ''}" id="speakerphoneBtn" title="Speakerphone">${icons.speakerphone}</div>
      <div class="speaker-strip-divider"></div>
      <div class="speaker-actors-track" id="speakerActorsTrack">${chips}</div>
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

    const sceneQuote = scene.quote
      ? `<div class="scene-quote">${scene.quote}</div>`
      : ''

    if (!(scene.messages || []).length) {
      if (!(p.actors || []).length) {
        canvas.innerHTML = `<div class="empty-state">
          <p>No actors yet.</p>
          <p>Tap <strong>+ Add actor</strong> below to get started.</p>
        </div>`
      } else {
        canvas.innerHTML = `<div class="empty-state">
          <p>No messages yet.</p>
          <p>Pick an actor below and start typing.</p>
        </div>`
      }
      return
    }

    canvas.innerHTML = this._renderSceneHeader(scene) + renderMessages(scene.messages, p.actors, {
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
        if (this._reorderMode) return
        if (this._bubbleLongPressSuppressedMsgId === msgId) {
          this._bubbleLongPressSuppressedMsgId = null
          return
        }
        const msg = scene.messages.find(m => m.id === msgId)
        if (msg) this._enterInlineEdit(scene.id, msgId, bub, msg.text)
      })
    })
  }

  _beginBubblePress(e, bub, p, scene, msgId) {
    if (this._reorderMode) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this._endBubblePress()
    this._bubbleLongPressTimer = window.setTimeout(() => {
      this._bubbleLongPressTimer = null
      this._bubbleLongPressSuppressedMsgId = msgId
      this._showBubbleOptions(p, scene, msgId)
    }, 320)
  }

  _endBubblePress() {
    if (this._bubbleLongPressTimer) {
      clearTimeout(this._bubbleLongPressTimer)
      this._bubbleLongPressTimer = null
    }
  }

  _showReactionPicker(scene, msgId) {
    this._closeBubbleOptionsSheet(true)
    const message = scene.messages.find(m => m.id === msgId)
    if (!message) return

    const overlay = document.createElement('div')
    overlay.className = 'sheet-overlay'
    const sheet = document.createElement('div')
    sheet.className = 'bottom-sheet bubble-options-sheet'
    const reactionsMeta = [
      { char: '😂', hex: '1F602' },
      { char: '❤️', hex: '2764' },
      { char: '😮', hex: '1F62E' },
      { char: '😢', hex: '1F622' },
      { char: '🔥', hex: '1F525' },
      { char: '👍', hex: '1F44D' },
    ]
    const reactions = Array.isArray(message.reactions)
      ? message.reactions
      : (message.reaction ? [message.reaction] : [])
    sheet.innerHTML = `
      <div class="bottom-sheet-handle"></div>
      <div class="bottom-sheet-title">React</div>
      <div class="bubble-options-react-strip">
        ${reactionsMeta.map(item => {
          const active = reactions.includes(item.char)
          return `<button class="bubble-options-emoji ${active ? 'active' : ''}" data-emoji="${item.char}" type="button"><img src="/openmoji/svg/${item.hex}.svg" alt="${item.char}" loading="lazy" /></button>`
        }).join('')}
      </div>`

    this._bubbleOptionsOverlay = overlay
    this._bubbleOptionsSheet = sheet
    this._el.appendChild(overlay)
    this._el.appendChild(sheet)

    const close = () => this._closeBubbleOptionsSheet()
    overlay.addEventListener('click', close)

    sheet.querySelectorAll('[data-emoji]').forEach(item => {
      item.addEventListener('click', () => {
        const emoji = item.dataset.emoji
        const current = Array.isArray(message.reactions)
          ? [...message.reactions]
          : (message.reaction ? [message.reaction] : [])
        const nextReactions = current.includes(emoji)
          ? current.filter(r => r !== emoji)
          : [...current, emoji]
        store.updateMessage(this.projectId, scene.id, msgId, { reactions: nextReactions, reaction: null })
        close()
      })
    })

    requestAnimationFrame(() => {
      overlay.classList.add('visible')
      sheet.classList.add('visible')
    })
  }

  _showBubbleOptions(p, scene, msgId) {
    this._closeBubbleOptionsSheet(true)
    const msg = scene.messages.find(m => m.id === msgId)
    if (!msg) return
    const actor = p.actors.find(a => a.id === msg.actor_id)
    const targetSide = actor?.side === 'right' ? 'left' : 'right'
    const status = msg.status || ''

    const overlay = document.createElement('div')
    overlay.className = 'sheet-overlay'
    const sheet = document.createElement('div')
    sheet.className = 'bottom-sheet bubble-options-sheet'
    sheet.innerHTML = `
      <div class="bottom-sheet-handle"></div>
      <div class="bottom-sheet-title">Message Options</div>
      <div class="bubble-options-list">
        <button class="bubble-options-action" data-action="react" type="button">React</button>
        <button class="bubble-options-action" data-action="flip" type="button">Flip side</button>
        <button class="bubble-options-action" data-action="copy" type="button">Copy text</button>
        <button class="bubble-options-action danger" data-action="delete" type="button">Delete</button>
      </div>
      <div class="bubble-options-status-row">
        <div class="bubble-options-status-label">Status</div>
        <div class="bubble-options-status-pills">
          ${['sent', 'delivered', 'seen'].map(value => `<button class="bubble-options-status-pill ${status === value ? 'active' : ''}" data-status="${value}" type="button">${value[0].toUpperCase()}${value.slice(1)}</button>`).join('')}
        </div>
      </div>`

    this._bubbleOptionsOverlay = overlay
    this._bubbleOptionsSheet = sheet
    this._el.appendChild(overlay)
    this._el.appendChild(sheet)

    const close = () => this._closeBubbleOptionsSheet()
    overlay.addEventListener('click', close)

    sheet.querySelector('[data-action="react"]')?.addEventListener('click', () => {
      this._showReactionPicker(scene, msgId)
    })
    sheet.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      store.deleteMessage(this.projectId, scene.id, msgId)
      if (this._editingMsgId === msgId && this._editingSceneId === scene.id) {
        this._clearEditMode()
      }
      close()
    })
    sheet.querySelector('[data-action="flip"]')?.addEventListener('click', () => {
      this._flipMessageSide(msgId, targetSide)
      close()
    })
    sheet.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(String(msg.text || ''))
        this._snack('Copied.')
      } catch {
        this._snack('Could not copy text.')
      }
      close()
    })

    sheet.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.status
        if (!value) return
        store.updateMessage(this.projectId, scene.id, msgId, { status: value })
        close()
      })
    })

    requestAnimationFrame(() => {
      overlay.classList.add('visible')
      sheet.classList.add('visible')
    })
  }

  _closeBubbleOptionsSheet(immediate = false) {
    const overlay = this._bubbleOptionsOverlay
    const sheet = this._bubbleOptionsSheet
    this._bubbleOptionsOverlay = null
    this._bubbleOptionsSheet = null
    if (!overlay && !sheet) return
    if (immediate) {
      overlay?.remove()
      sheet?.remove()
      return
    }
    overlay?.classList.remove('visible')
    sheet?.classList.remove('visible')
    setTimeout(() => {
      overlay?.remove()
      sheet?.remove()
    }, 280)
  }

  _handleRootClick(e) {
    const arrow = e.target.closest('.side-arrow')
    if (!arrow) return
    e.preventDefault()
    e.stopPropagation()
    const actorId = arrow.dataset.actorId
    const dir = arrow.dataset.dir
    if (!actorId || !dir) return
    this._flipActorSide(actorId, dir)
  }

  _flipActorSide(actorId, dir) {
    const project = store.getProject(this.projectId)
    const actor = project?.actors?.find(a => a.id === actorId)
    if (!actor) return
    if (actor.side === dir) return
    store.updateActor(this.projectId, actorId, { side: dir })
  }

  _flipMessageSide(msgId, dir) {
    const scene = store.getActiveScene(this.projectId)
    const msg = scene?.messages?.find(m => m.id === msgId)
    if (!scene || !msg) return
    const project = store.getProject(this.projectId)
    const targetActor = project?.actors?.find(a => a.side === dir && a.id !== msg.actor_id)
    if (!targetActor) {
      this._snack(`No actor on the ${dir} side.`)
      return
    }
    store.updateMessage(this.projectId, scene.id, msgId, { actor_id: targetActor.id })
  }

  _send() {
    const input = this._el.querySelector('#composeInput')
    const text = input.value.trim()
    const hasAttachment = Boolean(this._composePendingMedia || this._composePendingAudio || this._composePendingFile)
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
      if (this._composePendingFile) {
        extras.file_name = this._composePendingFile.name
        extras.file_data = this._composePendingFile.data
      }
      store.addMessage(this.projectId, scene.id, this._activeActorId, text, extras)
    }

    input.value = ''
    this._composePendingMedia = ''
    this._composePendingAudio = ''
    this._composePendingFile = null
    input.style.height = 'auto'
    input.dispatchEvent(new Event('input'))
    this._syncComposeMediaPreview()
    this._updateMorphBtn()
  }

  _updateMorphBtn() {
    const input = this._el?.querySelector('#composeInput')
    const sendBtn = this._el?.querySelector('#sendBtn')
    if (!input || !sendBtn) return
    const hasText = input.value.trim().length > 0
    sendBtn.dataset.mode = hasText ? 'send' : 'add'
    sendBtn.innerHTML = hasText ? icons.send : icons.add
    sendBtn.classList.toggle('ready', hasText)
  }

  _syncSendReady() {
    this._updateMorphBtn()
  }

  _autoGrowComposeInput(input) {
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`
  }

  _enterInlineEdit(sceneId, msgId, bubbleEl, currentText) {
    this._closeInlineEmojiPicker()
    const ta = document.createElement('textarea')
    ta.className = 'bubble-inline-edit'
    ta.value = currentText
    bubbleEl.innerHTML = ''
    bubbleEl.appendChild(ta)

    const emojiBtn = document.createElement('button')
    emojiBtn.className = 'bubble-edit-emoji-btn'
    emojiBtn.type = 'button'
    emojiBtn.innerHTML = '😊'
    emojiBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this._showInlineEmojiPicker(ta, emojiBtn)
    })
    bubbleEl.appendChild(emojiBtn)

    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const save = () => {
      const newText = ta.value.trim()
      if (newText && newText !== currentText)
        store.updateMessage(this.projectId, sceneId, msgId, { text: newText })
      this._closeInlineEmojiPicker()
    }
    ta.addEventListener('blur', (e) => {
      if (e.relatedTarget?.closest('.ep-panel')) return
      save()
    })
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur() }
      if (e.key === 'Escape') { this._closeInlineEmojiPicker(); this._refresh() }
    })
  }

  async _showInlineEmojiPicker(textareaEl, anchorEl) {
    this._closeInlineEmojiPicker()
    try {
      const picker = await createEmojiPicker({
        onSelect: (char) => {
          this._insertEmojiAtCursor(textareaEl, char)
          this._closeInlineEmojiPicker()
        },
        onClose: () => {
          this._closeInlineEmojiPicker()
        },
      })
      const rect = anchorEl.getBoundingClientRect()
      const appRect = this._el.getBoundingClientRect()
      picker.style.position = 'absolute'
      picker.style.bottom = `${Math.max(12, appRect.bottom - rect.top + 8)}px`
      picker.style.left = '8px'
      picker.style.right = '8px'
      picker.style.zIndex = '600'
      this._el.appendChild(picker)
      this._inlineEmojiPicker = picker
    } catch {
      this._snack('Could not open emoji picker.')
    }
  }

  _insertEmojiAtCursor(textareaEl, char) {
    if (!textareaEl) return
    const start = textareaEl.selectionStart ?? textareaEl.value.length
    const end = textareaEl.selectionEnd ?? start
    textareaEl.value = `${textareaEl.value.slice(0, start)}${char}${textareaEl.value.slice(end)}`
    textareaEl.selectionStart = textareaEl.selectionEnd = start + char.length
    textareaEl.focus()
  }

  _closeInlineEmojiPicker() {
    if (!this._inlineEmojiPicker) return
    this._inlineEmojiPicker.destroyPicker?.()
    this._inlineEmojiPicker.remove()
    this._inlineEmojiPicker = null
  }

  _enterEditMode(sceneId, msgId, text) {
    const input = this._el.querySelector('#composeInput')
    const cancelBtn = this._el.querySelector('#cancelEditBtn')
    this._editingMsgId = msgId
    this._editingSceneId = sceneId
    this._composePendingMedia = ''
    this._composePendingAudio = ''
    this._composePendingFile = null
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

  _openHub(initialTab = 'actors') {
    const overlayLayer = document.getElementById('overlay-layer')
    this._hub = new HubPanel(overlayLayer, this.projectId, () => { this._hub = null; this._refresh() }, initialTab, this)
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
    const audioBtn = this._el.querySelector('#audioToggleBtn')
    if (pill) pill.classList.toggle('open', this._audioToolsOpen)
    if (audioBtn) audioBtn.classList.toggle('active', this._audioToolsOpen)
    if (sub) sub.textContent = this._audioToolsOpen ? 'Background track and voice tools' : 'Hidden while typing'
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
          this._composePendingMedia = ''
          this._composePendingFile = null
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
    const remaining = limit - length
    label.textContent = `${length}/${limit}`
    label.style.color = remaining <= 20 ? '#FF453A' : 'var(--t4)'
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
      this._composePendingAudio = ''
      this._composePendingFile = null
      this._syncComposeMediaPreview()
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
      this._composePendingMedia = ''
      this._composePendingFile = null
      this._syncComposeMediaPreview()
      this._syncSendReady()
    }
    reader.readAsDataURL(file)
    input.value = ''
  }

  _pickComposeFile(input) {
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      this._composePendingFile = {
        name: file.name || 'Attached file',
        data: String(reader.result || ''),
      }
      this._composePendingMedia = ''
      this._composePendingAudio = ''
      this._syncComposeMediaPreview()
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
    const wrap = this._el.querySelector('#composeAttachmentPreview')
    if (!wrap) return
    if (!this._composePendingMedia) {
      if (!this._composePendingAudio && !this._composePendingFile) {
        wrap.innerHTML = ''
        wrap.classList.remove('has-attachment')
        return
      }
    }
    const parts = []
    if (this._composePendingMedia) {
      parts.push(`<div class="compose-attachment-card"><img class="compose-attachment-thumb" src="${this._composePendingMedia}" alt="attachment preview"><button class="compose-attachment-clear" id="clearPendingMediaBtn" type="button">✕</button></div>`)
    }
    if (this._composePendingAudio) {
      parts.push(`<div class="compose-attachment-audio"><span class="compose-attachment-label">Audio ready</span><button class="compose-attachment-clear" id="clearPendingAudioBtn" type="button">✕</button></div>`)
    }
    if (this._composePendingFile) {
      parts.push(`<div class="compose-attachment-file"><div class="compose-attachment-file-meta"><div class="compose-attachment-file-name">${this._escHtml(this._composePendingFile.name)}</div><div class="compose-attachment-file-sub">File ready</div></div><button class="compose-attachment-clear" id="clearPendingFileBtn" type="button">✕</button></div>`)
    }
    wrap.innerHTML = parts.join('')
    wrap.classList.add('has-attachment')

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
    wrap.querySelector('#clearPendingFileBtn')?.addEventListener('click', () => {
      this._composePendingFile = null
      this._syncComposeMediaPreview()
      this._syncSendReady()
    })
  }

  _showAttachSheet() {
    this._closeAttachSheet(true)
    const overlay = document.createElement('div')
    overlay.className = 'compose-sheet-overlay'
    const sheet = document.createElement('div')
    sheet.className = 'compose-attach-sheet'
    sheet.innerHTML = `
      <button class="compose-attach-action" data-pick="camera" type="button">Camera</button>
      <button class="compose-attach-action" data-pick="library" type="button">Photo Library</button>
      <button class="compose-attach-action" data-pick="audio" type="button">Audio file</button>
      <button class="compose-attach-action" data-pick="file" type="button">File</button>
      <button class="compose-attach-cancel" type="button">Cancel</button>
    `
    overlay.addEventListener('click', () => this._closeAttachSheet())
    sheet.querySelector('[data-pick="camera"]')?.addEventListener('click', () => {
      this._el.querySelector('#composeCameraInput')?.click()
      this._closeAttachSheet()
    })
    sheet.querySelector('[data-pick="library"]')?.addEventListener('click', () => {
      this._el.querySelector('#composeMediaInput')?.click()
      this._closeAttachSheet()
    })
    sheet.querySelector('[data-pick="audio"]')?.addEventListener('click', () => {
      this._el.querySelector('#composeAudioInput')?.click()
      this._closeAttachSheet()
    })
    sheet.querySelector('[data-pick="file"]')?.addEventListener('click', () => {
      this._el.querySelector('#composeFileInput')?.click()
      this._closeAttachSheet()
    })
    sheet.querySelector('.compose-attach-cancel')?.addEventListener('click', () => this._closeAttachSheet())
    this._el.appendChild(overlay)
    this._el.appendChild(sheet)
    this._attachSheetOverlay = overlay
    this._attachSheet = sheet
    requestAnimationFrame(() => {
      overlay.classList.add('visible')
      sheet.classList.add('visible')
    })
  }

  _closeAttachSheet(immediate = false) {
    const overlay = this._attachSheetOverlay
    const sheet = this._attachSheet
    this._attachSheetOverlay = null
    this._attachSheet = null
    if (!overlay && !sheet) return
    if (immediate) {
      overlay?.remove()
      sheet?.remove()
      return
    }
    overlay?.classList.remove('visible')
    sheet?.classList.remove('visible')
    setTimeout(() => {
      overlay?.remove()
      sheet?.remove()
    }, 220)
  }

  async _toggleEmojiPicker() {
    if (this._emojiPicker) {
      this._closeEmojiPicker()
      return
    }

    try {
      const picker = await createEmojiPicker({
        onSelect: (char) => {
          this._insertEmoji(char)
          this._closeEmojiPicker()
        },
        onClose: () => {
          this._closeEmojiPicker()
        },
      })

      this._emojiPicker = picker
      picker.style.position = 'absolute'
      picker.style.bottom = '70px'
      picker.style.left = '8px'
      picker.style.right = '8px'
      this._el.appendChild(picker)
    } catch {
      this._snack('Could not open emoji picker.')
    }
  }

  _closeEmojiPicker() {
    if (!this._emojiPicker) return
    this._emojiPicker.destroyPicker?.()
    this._emojiPicker.remove()
    this._emojiPicker = null
  }

  _insertEmoji(emoji) {
    const input = this._el.querySelector('.compose-input')
    if (!input) return
    const pos = input.selectionStart ?? input.value.length
    input.value = input.value.slice(0, pos) + emoji + input.value.slice(input.selectionEnd ?? pos)
    input.selectionStart = input.selectionEnd = pos + emoji.length
    input.dispatchEvent(new Event('input'))
    input.focus()
  }

  _toggleReorderMode() {
    this._reorderMode = !this._reorderMode
    this._syncReorderUI()
    if (this._reorderMode) {
      this._endBubblePress()
    }
  }

  _syncReorderUI() {
    this._el?.classList.toggle('reorder-mode', this._reorderMode)
  }

  _rgb(hex) {
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    return `${r},${g},${b}`
  }

  _renderSceneHeader(scene) {
    const ds = { ...DEFAULT_DIVIDER_STYLE, ...(scene.divider_style || {}) }

    const dateHtml = ds.show_date && ds.date_label
      ? `<div class="msg-timestamp">${this._escHtml(ds.date_label)}</div>`
      : ''

    if (!ds.show_name) return dateHtml

    const rawName = scene.name || ''
    const label = ds.label_case === 'upper'
      ? rawName.toUpperCase()
      : ds.label_case === 'title'
        ? rawName.replace(/\b\w/g, c => c.toUpperCase())
        : rawName

    const opacity = typeof ds.line_opacity === 'number' ? ds.line_opacity : 0.08
    const lineStyle = ds.line_style || 'gradient'

    const ruleStyle = lineStyle === 'none' ? 'display:none'
      : lineStyle === 'gradient' ? `--rule-opacity:${opacity}`
      : `border-top: 1px ${lineStyle} rgba(255,255,255,${opacity}); background: none;`

    const labelColor = ds.label_color === 'accent' ? 'var(--accent)'
      : ds.label_color === 'white' ? 'rgba(255,255,255,0.80)'
      : `rgba(255,255,255,${Math.min(opacity * 5, 0.45)})`

    return `${dateHtml}
      <div class="scene-divider">
        <div class="scene-divider-rule left" style="${ruleStyle}"></div>
        <div class="scene-divider-label" style="color:${labelColor}">${this._escHtml(label)}</div>
        <div class="scene-divider-rule right" style="${ruleStyle}"></div>
      </div>`
  }

  _escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}

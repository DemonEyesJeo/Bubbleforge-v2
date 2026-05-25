import { store } from '../store.js'
import { pop } from '../router.js'
import { icons, statusIcons } from '../components/icons.js'
import { renderMessages, renderTypingIndicator } from '../components/bubble.js'
import { KeyboardOverlay } from '../components/keyboard.js'

export class PlayScreen {
  constructor({ projectId }) {
    this.projectId = projectId
    this._playing  = false
    this._progress = 0
    this._kb       = null
    this._rafId    = null
    this._msgQueue = []
    this._msgIndex = 0
    this._charIndex = 0
    this._lastTime  = 0
    this._pauseMs   = 0
    this._shownMessages = []
    this._totalMs = 0
    this._timelineMs = []
    this._removeScrubListeners = null
    this._playheadMs = 0
    this._playCtx = null
  }

  render() {
    const el = document.createElement('div')
    el.className = 'play-screen'
    el.innerHTML = `
      <div class="status-bar" style="background:#000;">
        <span class="time">9:41</span>
        <div style="color:var(--accent);font-size:14px;cursor:pointer;" id="closeBtn">✕ Close</div>
      </div>
      <div class="play-canvas" id="playCanvas"></div>
      <div class="compose-input play-ghost-input" id="ghostInput" aria-hidden="true"></div>
      <div class="keyboard-placeholder" id="kbPlaceholder"></div>
      <div class="play-controls">
        <div class="play-btn" id="playBtn">${icons.play}</div>
        <div class="progress-wrap">
          <div class="progress-times">
            <span id="timeCurrent">0:00</span>
            <span id="timeTotal">0:00</span>
          </div>
          <div class="progress-bar-track" id="progressTrack">
            <div class="progress-bar-fill" id="progressFill" style="width:0%;"></div>
          </div>
        </div>
      </div>`
    return el
  }

  bind() {
    const p = store.getProject(this.projectId)
    if (!p) return

    const rs    = p.render_settings || {}
    const scene = store.getActiveScene(this.projectId)

    // Build message queue
    this._msgQueue = scene?.messages || []
    this._shownMessages = []

    this._applyTheme(rs)

    // Set up keyboard overlay
    if (rs.keyboard_style !== 'off' && rs.keyboard_style) {
      this._kb = new KeyboardOverlay(
        this._el.querySelector('#kbPlaceholder'),
        rs.keyboard_style
      )
      this._kb.mount()
    }

    // Render initial empty canvas with scene header
    this._renderCanvas(p, scene, [])

    // Controls
    this._el.querySelector('#closeBtn').addEventListener('click', () => {
      this._stopPlayback()
      pop()
    })

    const playBtn = this._el.querySelector('#playBtn')
    playBtn.addEventListener('click', () => {
      if (this._playing) this._pausePlayback()
      else               this._startPlayback(p, scene, rs)
    })

    // Calculate total duration for progress bar
    const typingDur = (rs.typing_duration || 0.08) * 1000
    const indicatorDur = (rs.typing_indicator_duration || 1.2) * 1000
    const indicatorGapDur = (rs.typing_indicator_gap || 0.4) * 1000
    const pauseDur = (rs.message_pause || 0.8) * 1000
    const typingEnabled = rs.typing_animation !== false
    const fakeoutEnabled = rs.fakeout !== false
    let totalMs = 0
    this._timelineMs = []
    for (let i = 0; i < this._msgQueue.length; i++) {
      const msg = this._msgQueue[i]
      const msgText = String(msg?.text || '')
      const fakeoutCost = fakeoutEnabled && i > 0 ? (indicatorGapDur + indicatorDur * 0.6) : 0
      const typingCost = typingEnabled ? msgText.length * typingDur : 0
      totalMs += indicatorDur + fakeoutCost + typingCost + pauseDur
      this._timelineMs.push(totalMs)
    }
    this._totalMs = totalMs || 10000
    this._el.querySelector('#timeTotal').textContent = this._formatTime(this._totalMs / 1000)

    this._playCtx = { p, scene, rs }

    const track = this._el.querySelector('#progressTrack')
    let scrubbing = false
    let resumeAfterScrub = false

    const applyScrub = (clientX) => {
      const rect = track.getBoundingClientRect()
      if (!rect.width) return
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const targetMs = this._totalMs * frac
      this._applyPlayheadState(targetMs, p, scene, rs)
    }

    const onPointerMove = (e) => {
      if (!scrubbing) return
      applyScrub(e.clientX)
    }
    const onPointerUp = (e) => {
      if (!scrubbing) return
      applyScrub(e.clientX)
      scrubbing = false
      track.releasePointerCapture?.(e.pointerId)
      if (resumeAfterScrub && this._msgIndex < this._msgQueue.length) {
        this._startPlayback(p, scene, rs)
      }
      resumeAfterScrub = false
    }
    const onPointerDown = (e) => {
      resumeAfterScrub = this._playing
      this._pausePlayback()
      scrubbing = true
      track.setPointerCapture?.(e.pointerId)
      applyScrub(e.clientX)
    }

    track.addEventListener('pointerdown', onPointerDown)
    track.addEventListener('pointermove', onPointerMove)
    track.addEventListener('pointerup', onPointerUp)
    track.addEventListener('pointercancel', onPointerUp)
    this._removeScrubListeners = () => {
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', onPointerUp)
      track.removeEventListener('pointercancel', onPointerUp)
    }
  }

  destroy() {
    this._stopPlayback()
    this._removeScrubListeners?.()
    this._removeScrubListeners = null
    this._playCtx = null
    this._kb?.destroy()
  }

  _renderCanvas(p, scene, messages, extraHtml = '') {
    const canvas = this._el.querySelector('#playCanvas')
    const actorMap = Object.fromEntries(p.actors.map(a => [a.id, a]))
    const rs = p.render_settings || {}
    this._applyTheme(rs)
    canvas.classList.toggle('is-light', rs.dark_background === false)

    let html = `
      <div class="msg-timestamp">Today</div>
      <div class="scene-divider">
        <div class="scene-divider-rule left"></div>
        <div class="scene-divider-label">${scene?.name?.toUpperCase() || 'SCENE'}</div>
        <div class="scene-divider-rule right"></div>
      </div>`
    if (scene?.quote) {
      html += `<div class="scene-quote">${scene.quote}</div>`
    }

    html += renderMessages(messages, p.actors, {
      showNames: rs.show_names !== false,
      showTimestamps: rs.show_timestamps === true,
    })
    html += extraHtml
    canvas.innerHTML = html
    canvas.scrollTop = canvas.scrollHeight
  }

  _applyPlayheadState(targetMs, p, scene, rs) {
    const state = this._stateForPlayhead(targetMs, rs)
    this._msgIndex = state.msgIndex
    this._shownMessages = this._msgQueue.slice(0, state.completedCount)
    this._playheadMs = state.playheadMs

    let extraHtml = ''
    if (state.showIndicator && state.indicatorActor) {
      extraHtml = renderTypingIndicator(state.indicatorActor)
    }
    this._renderCanvas(p, scene, this._shownMessages, extraHtml)
    this._setGhostText(state.ghostText)

    const pct = this._totalMs > 0 ? (state.playheadMs / this._totalMs) : 0
    this._el.querySelector('#progressFill').style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`
    this._el.querySelector('#timeCurrent').textContent = this._formatTime(state.playheadMs / 1000)
  }

  _stateForPlayhead(ms, rs) {
    const playheadMs = Math.max(0, Math.min(this._totalMs, Number(ms || 0)))
    const typingDur = Math.max(1, (rs.typing_duration || 0.08) * 1000)
    const indicatorDur = Math.max(1, (rs.typing_indicator_duration || 1.2) * 1000)
    const indicatorGapDur = Math.max(0, (rs.typing_indicator_gap || 0.4) * 1000)
    const pauseDur = Math.max(0, (rs.message_pause || 0.8) * 1000)
    const typingEnabled = rs.typing_animation !== false
    const fakeoutEnabled = rs.fakeout !== false

    let elapsed = 0
    let completedCount = 0

    for (let i = 0; i < this._msgQueue.length; i++) {
      const msg = this._msgQueue[i]
      const text = String(msg?.text || '')
      const fakeoutCost = fakeoutEnabled && i > 0 ? (indicatorGapDur + indicatorDur * 0.6) : 0
      const typingCost = typingEnabled ? text.length * typingDur : 0
      const segment = indicatorDur + fakeoutCost + typingCost + pauseDur
      const segmentEnd = elapsed + segment

      if (playheadMs >= segmentEnd) {
        completedCount++
        elapsed = segmentEnd
        continue
      }

      const localMs = playheadMs - elapsed
      const indicatorOnlyWindow = indicatorDur + fakeoutCost
      const actor = (this._playCtx?.p?.actors || []).find(a => a.id === msg.actor_id)

      if (localMs < indicatorOnlyWindow) {
        return {
          playheadMs,
          completedCount,
          msgIndex: i,
          ghostText: '',
          showIndicator: true,
          indicatorActor: actor,
        }
      }

      if (typingEnabled && typingCost > 0 && localMs < (indicatorOnlyWindow + typingCost)) {
        const typedMs = localMs - indicatorOnlyWindow
        const chars = Math.max(0, Math.min(text.length, Math.floor(typedMs / typingDur)))
        return {
          playheadMs,
          completedCount,
          msgIndex: i,
          ghostText: text.slice(0, chars),
          showIndicator: false,
          indicatorActor: null,
        }
      }

      return {
        playheadMs,
        completedCount: completedCount + 1,
        msgIndex: i + 1,
        ghostText: '',
        showIndicator: false,
        indicatorActor: null,
      }
    }

    return {
      playheadMs,
      completedCount: this._msgQueue.length,
      msgIndex: this._msgQueue.length,
      ghostText: '',
      showIndicator: false,
      indicatorActor: null,
    }
  }

  _startPlayback(p, scene, rs) {
    if (this._msgIndex >= this._msgQueue.length) {
      // Restart
      this._msgIndex = 0
      this._shownMessages = []
      this._elapsedMs = 0
      this._playheadMs = 0
      this._renderCanvas(p, scene, [])
      this._el.querySelector('#progressFill').style.width = '0%'
      this._el.querySelector('#timeCurrent').textContent = this._formatTime(0)
    }
    this._playing = true
    this._el.querySelector('#playBtn').innerHTML = icons.pause
    if (rs.typing_animation !== false) this._kb?.show()
    else this._kb?.hide()
    this._runNext(p, scene, rs)
  }

  _pausePlayback() {
    this._playing = false
    this._el.querySelector('#playBtn').innerHTML = icons.play
    clearTimeout(this._animTimeout)
  }

  _stopPlayback() {
    this._playing = false
    clearTimeout(this._animTimeout)
    this._setGhostText('')
    this._kb?.hide()
  }

  _setGhostText(text) {
    const ghost = this._el?.querySelector('#ghostInput')
    if (!ghost) return
    ghost.textContent = text || ''
    ghost.classList.toggle('has-text', Boolean(text))
  }

  _runNext(p, scene, rs) {
    if (!this._playing) return
    if (this._msgIndex >= this._msgQueue.length) {
      this._pausePlayback()
      this._kb?.hide()
      return
    }

    const msg      = this._msgQueue[this._msgIndex]
    const actor    = p.actors.find(a => a.id === msg.actor_id)
    const typingMs = (rs.typing_duration || 0.08) * 1000
    const indicMs  = (rs.typing_indicator_duration || 1.2) * 1000
    const pauseMs  = (rs.message_pause || 0.8) * 1000
    const fakeout  = rs.fakeout !== false
    const typingEnabled = rs.typing_animation !== false

    const canvas = this._el.querySelector('#playCanvas')

    const showTyping = () => {
      const rows = canvas.querySelectorAll('.typing-row')
      rows.forEach(r => r.remove())
      this._setGhostText('')
      canvas.insertAdjacentHTML('beforeend', renderTypingIndicator(actor))
      canvas.scrollTop = canvas.scrollHeight
    }
    const hideTyping = () => canvas.querySelectorAll('.typing-row').forEach(r => r.remove())

    const setProgress = () => {
      const pct = Math.max(0, Math.min(1, this._playheadMs / this._totalMs))
      this._el.querySelector('#progressFill').style.width = `${pct * 100}%`
      this._el.querySelector('#timeCurrent').textContent = this._formatTime(this._playheadMs / 1000)
    }

    // 1. Show typing indicator
    showTyping()
    this._animTimeout = setTimeout(() => {
      if (!this._playing) return

      this._playheadMs += indicMs
      setProgress()

      if (fakeout && this._msgIndex > 0) {
        // Fakeout: hide briefly, show again
        hideTyping()
        this._animTimeout = setTimeout(() => {
          if (!this._playing) return
          this._playheadMs += (rs.typing_indicator_gap || 0.4) * 1000
          setProgress()
          showTyping()
          this._animTimeout = setTimeout(() => {
            if (typingEnabled) this._typeMessage(p, scene, rs, msg, actor, typingMs, pauseMs)
            else this._commitMessage(p, scene, rs, msg, pauseMs)
          }, indicMs * 0.6)
        }, (rs.typing_indicator_gap || 0.4) * 1000)
      } else {
        if (typingEnabled) this._typeMessage(p, scene, rs, msg, actor, typingMs, pauseMs)
        else this._commitMessage(p, scene, rs, msg, pauseMs)
      }
    }, indicMs)
  }

  _commitMessage(p, scene, rs, msg, pauseMs) {
    this._setGhostText('')
    this._shownMessages.push(msg)
    this._msgIndex++
    this._renderCanvas(p, scene, this._shownMessages)

    this._playheadMs += pauseMs
    const pct = Math.max(0, Math.min(1, this._playheadMs / this._totalMs))
    this._el.querySelector('#progressFill').style.width = `${pct * 100}%`
    this._el.querySelector('#timeCurrent').textContent = this._formatTime(this._playheadMs / 1000)

    this._kb?.hide()
    this._animTimeout = setTimeout(() => this._runNext(p, scene, rs), pauseMs)
  }

  _typeMessage(p, scene, rs, msg, actor, typingMs, pauseMs) {
    if (!this._playing) return
    const canvas = this._el.querySelector('#playCanvas')
    canvas.querySelectorAll('.typing-row').forEach(r => r.remove())

    let charIdx = 0
    const chars = String(msg?.text || '').split('')
    const charMs = rs.typing_duration || 0.08

    const typeNext = () => {
      if (!this._playing) return
      if (charIdx >= chars.length) {
        this._commitMessage(p, scene, rs, msg, pauseMs)
        return
      }

      const ch = chars[charIdx++]
      this._kb?.pressKey(ch)
      this._setGhostText(chars.slice(0, charIdx).join(''))
      if (charIdx === 1) this._kb?.show()

      this._playheadMs += typingMs
      const pct = Math.max(0, Math.min(1, this._playheadMs / this._totalMs))
      this._el.querySelector('#progressFill').style.width = `${pct * 100}%`
      this._el.querySelector('#timeCurrent').textContent = this._formatTime(this._playheadMs / 1000)

      this._animTimeout = setTimeout(typeNext, typingMs + (Math.random() * typingMs * 0.4))
    }

    typeNext()
  }

  _formatTime(secs) {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${String(s).padStart(2,'0')}`
  }

  _applyTheme(rs) {
    const light = rs?.dark_background === false
    this._el.classList.toggle('is-light', light)
    const status = this._el.querySelector('.status-bar')
    const controls = this._el.querySelector('.play-controls')
    if (status) status.style.background = light ? 'rgba(255,255,255,0.84)' : '#000'
    if (controls) controls.style.background = light ? 'rgba(255,255,255,0.84)' : 'rgba(8,8,8,0.96)'
  }
}

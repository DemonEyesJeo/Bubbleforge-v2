import { store } from '../store.js'
import { pop } from '../router.js'
import { icons } from '../components/icons.js'
import { renderMessages, renderTypingIndicator } from '../components/bubble.js'
import { KeyboardOverlay } from '../components/keyboard.js'
import { renderStatusBar } from '../components/status-bar.js'

const FAKEOUT_PROB = 0.35
const STATIC_SCENE_MS = 3600

function defaultTitleData() {
  return {
    title: '',
    subtitle: '',
    bg_type: 'gradient',
    bg_color_a: '#1a1a2e',
    bg_color_b: '#16213e',
    bg_image: null,
    text_align: 'center',
    title_size: 36,
    subtitle_size: 18,
    text_color: '#ffffff',
    text_shadow: true,
    blur: false,
  }
}

function defaultQuoteData() {
  return {
    platform: 'x',
    avatar: null,
    avatar_color: '#1DA1F2',
    display_name: '',
    handle: '',
    verified: false,
    date: '',
    text: '',
    image: null,
    stats: {
      replies: '',
      retweets: '',
      likes: '',
      views: '',
    },
    show_stats: true,
    show_verified: true,
    bg_color: '#000000',
    text_color: '#ffffff',
  }
}

export class PlayScreen {
  constructor({ projectId }) {
    this.projectId = projectId
    this._sceneId = null
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
    this._removeSwipeListeners = null
    this._playheadMs = 0
    this._playCtx = null
    this._music = null
    this._musicFadeTimer = null
  }

  render() {
    const el = document.createElement('div')
    el.className = 'play-screen'
    el.innerHTML = `
      <div class="status-bar" style="background:#000;">
        <div id="statusBarHost">${renderStatusBar(store.getSceneStatusBar(this.projectId, store.getActiveScene(this.projectId)?.id))}</div>
        <div class="play-close-btn" id="closeBtn">${icons.back} Back</div>
      </div>
      <div class="play-canvas" id="playCanvas"></div>
      <div class="compose-input play-ghost-input" id="ghostInput" aria-hidden="true"></div>
      <div class="keyboard-placeholder" id="kbPlaceholder"></div>
      <div class="play-controls">
        <div class="play-scene-nav-btn" id="prevSceneBtn">${icons.back}</div>
        <div class="play-btn play-btn-main" id="playBtn">${icons.play}</div>
        <div class="play-scene-nav-btn" id="nextSceneBtn">${icons.chev}</div>
        <span class="play-time-start" id="timeCurrent">0:00</span>
        <div class="play-scrub">
          <div class="progress-bar-track" id="progressTrack">
            <div class="progress-bar-fill" id="progressFill" style="width:0%;"></div>
          </div>
        </div>
        <span class="play-time-end" id="timeTotal">0:00</span>
      </div>`
    return el
  }

  bind() {
    const p = store.getProject(this.projectId)
    if (!p) return

    const rs = p.render_settings || {}
    const scene = store.getActiveScene(this.projectId)
    this._sceneId = scene?.id || null
    this._rebuildForScene(p, scene, rs)

    // Controls
    this._el.querySelector('#closeBtn').addEventListener('click', () => {
      this._stopPlayback()
      pop()
    })

    this._el.querySelector('#prevSceneBtn')?.addEventListener('click', () => this._gotoScene(-1))
    this._el.querySelector('#nextSceneBtn')?.addEventListener('click', () => this._gotoScene(1))

    const playBtn = this._el.querySelector('#playBtn')
    playBtn.addEventListener('click', () => {
      const ctx = this._getPlayContext()
      if (!ctx.p || !ctx.scene) return
      if (this._playing) this._pausePlayback()
      else               this._startPlayback(ctx.p, ctx.scene, ctx.rs)
    })

    const track = this._el.querySelector('#progressTrack')
    let scrubbing = false
    let resumeAfterScrub = false

    const applyScrub = (clientX) => {
      const ctx = this._getPlayContext()
      if (!ctx.p || !ctx.scene) return
      const rect = track.getBoundingClientRect()
      if (!rect.width) return
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const targetMs = this._totalMs * frac
      this._applyPlayheadState(targetMs, ctx.p, ctx.scene, ctx.rs)
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
        const ctx = this._getPlayContext()
        if (ctx.p && ctx.scene) this._startPlayback(ctx.p, ctx.scene, ctx.rs)
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

    const canvas = this._el.querySelector('#playCanvas')
    let swipeStartX = null
    const onSwipeDown = (e) => {
      swipeStartX = e.clientX
    }
    const onSwipeUp = (e) => {
      if (swipeStartX == null) return
      const deltaX = e.clientX - swipeStartX
      swipeStartX = null
      if (Math.abs(deltaX) <= 60) return
      this._gotoScene(deltaX < 0 ? 1 : -1)
    }
    const onSwipeCancel = () => { swipeStartX = null }
    canvas.addEventListener('pointerdown', onSwipeDown)
    canvas.addEventListener('pointerup', onSwipeUp)
    canvas.addEventListener('pointercancel', onSwipeCancel)

    this._removeScrubListeners = () => {
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', onPointerUp)
      track.removeEventListener('pointercancel', onPointerUp)
    }
    this._removeSwipeListeners = () => {
      canvas.removeEventListener('pointerdown', onSwipeDown)
      canvas.removeEventListener('pointerup', onSwipeUp)
      canvas.removeEventListener('pointercancel', onSwipeCancel)
    }
  }

  destroy() {
    this._stopPlayback()
    this._removeScrubListeners?.()
    this._removeScrubListeners = null
    this._removeSwipeListeners?.()
    this._removeSwipeListeners = null
    this._playCtx = null
    this._kb?.destroy()
  }

  _getPlayContext() {
    const p = store.getProject(this.projectId)
    if (!p) return { p: null, scene: null, rs: {} }
    const scene = p.scenes.find(s => s.id === this._sceneId) || store.getActiveScene(this.projectId)
    const rs = p.render_settings || {}
    return { p, scene, rs }
  }

  _rebuildForScene(p, scene, rs) {
    if (!p || !scene) return
    this._sceneId = scene.id
    this._msgQueue = this._isStaticScene(scene) ? [] : (scene.messages || [])
    this._shownMessages = []
    this._msgIndex = 0
    this._playheadMs = 0
    this._setGhostText('')
    this._setKeyboardActive(false)

    const status = store.getSceneStatusBar(this.projectId, scene.id)
    const statusHost = this._el.querySelector('#statusBarHost')
    if (statusHost) statusHost.innerHTML = renderStatusBar(status)

    this._applyTheme(rs)
    this._renderCanvas(p, scene, [])

    if (this._isStaticScene(scene)) {
      this._totalMs = this._staticSceneDuration(scene, rs)
      this._el.querySelector('#progressFill').style.width = '0%'
      this._el.querySelector('#timeCurrent').textContent = this._formatTime(0)
      this._el.querySelector('#timeTotal').textContent = this._formatTime(this._totalMs / 1000)
      this._playCtx = { p, scene, rs }
      this._updateSceneNavButtons(p)
      return
    }

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
      const fakeoutCost = fakeoutEnabled && i > 0 ? (indicatorGapDur + indicatorDur * 0.6) * FAKEOUT_PROB : 0
      const typingCost = typingEnabled ? msgText.length * typingDur : 0
      totalMs += indicatorDur + fakeoutCost + typingCost + pauseDur
      this._timelineMs.push(totalMs)
    }
    this._totalMs = totalMs || 10000
    this._el.querySelector('#progressFill').style.width = '0%'
    this._el.querySelector('#timeCurrent').textContent = this._formatTime(0)
    this._el.querySelector('#timeTotal').textContent = this._formatTime(this._totalMs / 1000)
    this._playCtx = { p, scene, rs }
    this._updateSceneNavButtons(p)
  }

  _updateSceneNavButtons(p) {
    const scenes = p?.scenes || []
    const idx = scenes.findIndex(s => s.id === this._sceneId)
    const prev = this._el.querySelector('#prevSceneBtn')
    const next = this._el.querySelector('#nextSceneBtn')
    const disablePrev = idx <= 0
    const disableNext = idx < 0 || idx >= scenes.length - 1
    if (prev) prev.classList.toggle('disabled', disablePrev)
    if (next) next.classList.toggle('disabled', disableNext)
  }

  _gotoScene(direction) {
    const p = store.getProject(this.projectId)
    if (!p) return
    const scenes = p.scenes || []
    const idx = scenes.findIndex(s => s.id === this._sceneId)
    if (idx < 0) return
    const next = scenes[idx + direction]
    if (!next) return

    const rs = p.render_settings || {}
    this._stopPlayback()
    this._sceneId = next.id
    store.setActiveScene(this.projectId, next.id)
    this._rebuildForScene(p, next, rs)
  }

  _renderCanvas(p, scene, messages, extraHtml = '') {
    const canvas = this._el.querySelector('#playCanvas')
    const rs = p.render_settings || {}
    this._applyTheme(rs)
    canvas.classList.toggle('is-light', rs.dark_background === false)

    if (scene?.kind === 'title') {
      canvas.innerHTML = this._renderTitleFrame(scene, extraHtml || 'enter')
      return
    }
    if (scene?.kind === 'quote') {
      canvas.innerHTML = this._renderQuoteFrame(scene, extraHtml || 'enter')
      return
    }

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
      projectId: this.projectId,
      sceneId: scene?.id,
      showNames: rs.show_names !== false,
      showTimestamps: rs.show_timestamps === true,
      hideControls: true,
    })
    html += extraHtml
    canvas.innerHTML = html
    canvas.scrollTop = canvas.scrollHeight
  }

  _applyPlayheadState(targetMs, p, scene, rs) {
    if (this._isStaticScene(scene)) {
      this._applyStaticPlayheadState(targetMs, p, scene)
      return
    }
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
      const fakeoutCost = fakeoutEnabled && i > 0 ? (indicatorGapDur + indicatorDur * 0.6) * FAKEOUT_PROB : 0
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
      const actor = store.getEffectiveActor(this.projectId, this._playCtx?.scene?.id, msg.actor_id)

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
    if (this._isStaticScene(scene)) {
      if (this._playheadMs >= this._totalMs) {
        this._playheadMs = 0
        this._applyStaticPlayheadState(0, p, scene)
      }
      this._startStaticScenePlayback(p, scene, rs)
      return
    }
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
    if (!this._kb && rs.keyboard_style !== 'off' && rs.keyboard_style) {
      this._kb = new KeyboardOverlay(
        this._el.querySelector('#kbPlaceholder'),
        rs.keyboard_style
      )
    }
    if (rs.typing_animation !== false) {
      this._kb?.show()
      this._setKeyboardActive(true)
    } else {
      this._kb?.hide()
      this._setKeyboardActive(false)
    }

    if (rs.music_path) {
      const src = String(rs.music_path)
      if (!this._music || this._music.src !== src) {
        this._music = new Audio(src)
      }
      const targetVolume = rs.music_volume ?? 0.7
      this._music.loop = rs.loop_music ?? true
      clearInterval(this._musicFadeTimer)
      this._musicFadeTimer = null
      if (rs.fade_music && this._music.currentTime === 0) {
        this._music.volume = 0
        let vol = 0
        this._musicFadeTimer = setInterval(() => {
          vol = Math.min(targetVolume, vol + 0.05)
          if (this._music) this._music.volume = vol
          if (vol >= targetVolume) {
            clearInterval(this._musicFadeTimer)
            this._musicFadeTimer = null
          }
        }, 80)
      } else {
        this._music.volume = targetVolume
      }
      this._music.play().catch(() => {})
    }

    this._runNext(p, scene, rs)
  }

  _pausePlayback() {
    this._playing = false
    this._el.querySelector('#playBtn').innerHTML = icons.play
    clearTimeout(this._animTimeout)
    cancelAnimationFrame(this._rafId)
    this._rafId = null
    this._music?.pause()
  }

  _stopPlayback() {
    this._playing = false
    clearTimeout(this._animTimeout)
    cancelAnimationFrame(this._rafId)
    this._rafId = null
    clearInterval(this._musicFadeTimer)
    this._musicFadeTimer = null
    this._setGhostText('')
    this._setKeyboardActive(false)
    const playBtn = this._el?.querySelector('#playBtn')
    if (playBtn) playBtn.innerHTML = icons.play
    if (this._music) {
      this._music.pause()
      this._music.currentTime = 0
      this._music = null
    }
    this._kb?.destroy()
    this._kb = null
  }

  _setKeyboardActive(active) {
    const placeholder = this._el?.querySelector('#kbPlaceholder')
    if (!placeholder) return
    placeholder.classList.toggle('kb-active', Boolean(active))
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
      this._setKeyboardActive(false)
      return
    }

    const msg      = this._msgQueue[this._msgIndex]
    const actor    = store.getEffectiveActor(this.projectId, scene?.id, msg.actor_id)
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

      if (fakeout && this._msgIndex > 0 && Math.random() < FAKEOUT_PROB) {
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
    this._setKeyboardActive(false)
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
      if (charIdx === 1) {
        this._kb?.show()
        this._setKeyboardActive(true)
      }

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

  _isStaticScene(scene) {
    return scene?.kind === 'title' || scene?.kind === 'quote'
  }

  _startStaticScenePlayback(p, scene, rs) {
    this._playing = true
    this._el.querySelector('#playBtn').innerHTML = icons.pause

    if (rs.music_path) {
      const src = String(rs.music_path)
      if (!this._music || this._music.src !== src) {
        this._music = new Audio(src)
      }
      this._music.loop = rs.loop_music ?? true
      this._music.volume = rs.music_volume ?? 0.7
      this._music.play().catch(() => {})
    }

    const startedAt = performance.now() - this._playheadMs
    const step = (now) => {
      if (!this._playing) return
      const elapsed = Math.min(this._totalMs, now - startedAt)
      this._applyStaticPlayheadState(elapsed, p, scene)
      if (elapsed >= this._totalMs) {
        this._pausePlayback()
        return
      }
      this._rafId = requestAnimationFrame(step)
    }
    this._rafId = requestAnimationFrame(step)
  }

  _applyStaticPlayheadState(targetMs, p, scene) {
    this._playheadMs = Math.max(0, Math.min(this._totalMs, Number(targetMs || 0)))
    const progress = this._totalMs > 0 ? this._playheadMs / this._totalMs : 0
    let stage = 'enter'
    if (scene?.kind === 'quote') {
      stage = this._playheadMs < 400 ? 'enter' : 'show'
      if (progress >= 0.92) stage = 'hold'
    } else {
      if (progress >= 0.82) stage = 'hold'
      else if (progress >= 0.22) stage = 'show'
    }
    this._renderCanvas(p, scene, [], stage)
    this._el.querySelector('#progressFill').style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`
    this._el.querySelector('#timeCurrent').textContent = this._formatTime(this._playheadMs / 1000)
  }

  _staticSceneDuration(scene, rs) {
    if (scene?.kind === 'quote') {
      const hold = Math.max(1000, (Number(rs?.message_pause) || 0.8) * 4000)
      return 400 + hold
    }
    return STATIC_SCENE_MS
  }

  _renderTitleFrame(scene, stage) {
    const data = { ...defaultTitleData(), ...(scene?.title_data || {}) }
    const bg = data.bg_type === 'image' && data.bg_image
      ? `background:center / cover no-repeat url(${data.bg_image});`
      : data.bg_type === 'solid'
        ? `background:${data.bg_color_a || '#1a1a2e'};`
        : `background:linear-gradient(160deg, ${data.bg_color_a || '#1a1a2e'}, ${data.bg_color_b || '#16213e'});`
    const shadow = data.text_shadow === false ? 'none' : '0 2px 16px rgba(0,0,0,0.5)'
    return `
      <div class="play-title-frame ${data.blur ? 'blurred' : ''} is-${stage}" style="${bg} text-align:${data.text_align || 'center'};">
        <div class="play-title-text" style="font-size:${data.title_size || 36}px;color:${data.text_color || '#ffffff'};text-shadow:${shadow};">${this._escHtml(data.title || scene?.name || 'Title')}</div>
        <div class="play-title-subtext" style="font-size:${data.subtitle_size || 18}px;color:${this._withAlpha(data.text_color || '#ffffff', 0.74)};text-shadow:${shadow};">${this._escHtml(data.subtitle || '')}</div>
      </div>`
  }

  _renderQuoteFrame(scene, stage) {
    const data = { ...defaultQuoteData(), ...(scene?.quote_data || {}) }
    const stats = { ...defaultQuoteData().stats, ...(data.stats || {}) }
    const displayName = data.display_name || 'Display name'
    const handle = this._formatHandle(data.handle)
    const date = data.date || 'Date'
    const postText = data.text || scene?.quote || 'Quote'
    const initials = (displayName || '?').trim().charAt(0).toUpperCase() || '?'
    return `
      <div class="play-quote-frame is-${stage}" style="background:${data.bg_color || '#000000'};">
        <div class="play-post-card" style="color:${data.text_color || '#ffffff'};">
          <div class="play-post-head">
            <div class="play-post-identity">
              <div class="play-post-avatar" style="background:${data.avatar ? 'transparent' : (data.avatar_color || '#1DA1F2')};">${data.avatar ? `<img src="${data.avatar}" alt="avatar" />` : initials}</div>
              <div class="play-post-names">
                <div class="play-post-display">${this._escHtml(displayName)} ${data.show_verified && data.verified ? '<span class="play-post-verified">✓</span>' : ''}</div>
                <div class="play-post-handle">${this._escHtml(handle)}</div>
              </div>
            </div>
            <div class="play-post-date">${this._escHtml(date)}</div>
          </div>
          <div class="play-post-text">${this._escHtml(postText)}</div>
          ${data.image ? `<img class="play-post-image" src="${data.image}" alt="attachment" />` : ''}
          ${data.show_stats ? `
            <div class="play-post-stats">
              <div class="play-post-stat">💬 ${this._escHtml(stats.replies || '')}</div>
              <div class="play-post-stat">🔁 ${this._escHtml(stats.retweets || '')}</div>
              <div class="play-post-stat">♥ ${this._escHtml(stats.likes || '')}</div>
              <div class="play-post-stat">👁 ${this._escHtml(stats.views || '')}</div>
            </div>
          ` : ''}
        </div>
      </div>`
  }

  _formatHandle(value) {
    const clean = String(value || '').replace(/^@+/, '').trim()
    return clean ? `@${clean}` : '@handle'
  }

  _withAlpha(hex, alpha) {
    const clean = String(hex || '#ffffff')
    const r = parseInt(clean.slice(1, 3), 16)
    const g = parseInt(clean.slice(3, 5), 16)
    const b = parseInt(clean.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  _escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

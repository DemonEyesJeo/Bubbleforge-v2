const STORAGE_KEY = 'bf_v2_projects'
const LAST_PROJECT_KEY = 'bf_v2_last_project_id'
const STATUS_TEMPLATES_KEY = 'bf_status_templates'
const STATUS_QUICKPICKS_KEY = 'bf_status_quickpicks'

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

function now() { return Date.now() }

function defaultStatusBar() {
  return {
    time: '9:41',
    carrier: '',
    network: 'LTE',
    signal: 'full',
    wifi: 'full',
    battery: 'full',
    charging: false,
    low_power: false,
    show_percent: false,
    icons: [],
  }
}

function defaultStatusQuickpicks() {
  return {
    carrier: ['Gringotts Mobile', 'Stark Industries', 'HoloNet'],
    network: ['MAGIC', 'FLOO', 'IMPERIAL'],
    time: ['3:47 AM', '11:59 PM', '??:??'],
  }
}

export const ACTOR_COLORS = [
  '#2979FF','#00BFA5','#FF6D00','#7C4DFF',
  '#F50057','#00ACC1','#43A047','#E53935',
  '#FB8C00','#8E24AA','#00897B','#D81B60',
]

function defaultRenderSettings() {
  return {
    fps: 30,
    sfx_type: 'soft',
    sfx_enabled: true,
    keyboard_style: 'ios',
    show_names: true,
    show_timestamps: true,
    dark_background: true,
    typing_duration: 0.08,
    typing_indicator_duration: 1.2,
    typing_indicator_gap: 0.4,
    fakeout: true,
    music_path: null,
    music_volume: 0.7,
    loop_music: true,
    fade_music: true,
    music_title: '',
    music_preview_url: '',
    resolution: '1080p',
    format: 'mp4',
    preview_before_export: false,
    message_pause: 0.8,
  }
}

function sampleProject() {
  const alexId = uuid()
  const mayaId = uuid()
  const sceneId = uuid()
  return {
    id: uuid(),
    name: 'The Rooftop',
    created_at: now(),
    updated_at: now(),
    actors: [
      { id: alexId, name: 'Alex', color: '#2979FF', side: 'right', avatar: null },
      { id: mayaId, name: 'Maya', color: '#00BFA5', side: 'left',  avatar: null },
    ],
    groups: [],
    scenes: [
      {
        id: sceneId,
        name: 'The Rooftop',
        quote: 'Some things don\'t need words.',
        status_bar: defaultStatusBar(),
        actor_overrides: {},
        messages: [
          { id: uuid(), actor_id: mayaId, text: 'You actually showed up.',                           ts: now() },
          { id: uuid(), actor_id: alexId, text: 'I said I would.',                                   ts: now() + 1 },
          { id: uuid(), actor_id: alexId, text: 'Didn\'t think you\'d be here though.',              ts: now() + 2 },
          { id: uuid(), actor_id: alexId, text: 'Nice view.',                                        ts: now() + 3 },
          { id: uuid(), actor_id: mayaId, text: 'It\'s the only thing left that\'s honest in this city.', ts: now() + 4 },
          { id: uuid(), actor_id: alexId, text: 'Then maybe we stay a while.',                       ts: now() + 5 },
        ]
      }
    ],
    render_settings: defaultRenderSettings(),
    active_scene_id: sceneId,
  }
}

class Store {
  constructor() {
    this._projects = []
    this._listeners = {}
    this._history = []
    this._load()
  }

  // ── Persistence ──────────────────────────────
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      this._projects = raw ? JSON.parse(raw) : [sampleProject()]
    } catch {
      this._projects = [sampleProject()]
    }
    if (!this._projects.length) this._projects = [sampleProject()]
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._projects))
  }

  _snapshot() {
    this._history.push(JSON.stringify(this._projects))
    if (this._history.length > 25) this._history.shift()
  }

  undoLastChange() {
    const previous = this._history.pop()
    if (!previous) return false
    try {
      this._projects = JSON.parse(previous)
      this._save()
      this._emit('projects-changed')
      this._emit('project-changed')
      return true
    } catch {
      return false
    }
  }

  // ── Events ───────────────────────────────────
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(fn)
  }
  off(event, fn) {
    if (this._listeners[event])
      this._listeners[event] = this._listeners[event].filter(f => f !== fn)
  }
  _emit(event, data) {
    ;(this._listeners[event] || []).forEach(fn => fn(data))
  }

  // ── Projects ─────────────────────────────────
  getProjects() { return [...this._projects] }

  getProject(id) { return this._projects.find(p => p.id === id) || null }

  getLastOpenedProjectId() {
    try {
      const id = localStorage.getItem(LAST_PROJECT_KEY) || ''
      return this.getProject(id) ? id : ''
    } catch {
      return ''
    }
  }

  setLastOpenedProjectId(projectId) {
    try {
      if (!projectId || !this.getProject(projectId)) {
        localStorage.removeItem(LAST_PROJECT_KEY)
        return
      }
      localStorage.setItem(LAST_PROJECT_KEY, projectId)
    } catch {
      // ignore storage failures
    }
  }

  createProject(name = 'New Story') {
    this._snapshot()
    const p = { ...sampleProject(), id: uuid(), name, created_at: now(), updated_at: now(), scenes: [], actors: [], groups: [] }
    const firstScene = { id: uuid(), name: 'Scene 1', quote: '', status_bar: defaultStatusBar(), actor_overrides: {}, messages: [] }
    p.scenes = [firstScene]
    p.active_scene_id = firstScene.id
    this._projects.unshift(p)
    this._save()
    this.setLastOpenedProjectId(p.id)
    this._emit('projects-changed')
    return p
  }

  updateProject(id, patch) {
    const idx = this._projects.findIndex(p => p.id === id)
    if (idx < 0) return
    this._snapshot()
    this._projects[idx] = { ...this._projects[idx], ...patch, updated_at: now() }
    this._save()
    this._emit('project-changed', id)
  }

  deleteProject(id) {
    this._snapshot()
    this._projects = this._projects.filter(p => p.id !== id)
    this._save()
    const current = this.getLastOpenedProjectId()
    if (!current) {
      this.setLastOpenedProjectId(this._projects[0]?.id || '')
    }
    this._emit('projects-changed')
  }

  // ── Scenes ───────────────────────────────────
  getScene(projectId, sceneId) {
    const p = this.getProject(projectId)
    return p ? (p.scenes.find(s => s.id === sceneId) || null) : null
  }

  getActiveScene(projectId) {
    const p = this.getProject(projectId)
    if (!p) return null
    return p.scenes.find(s => s.id === p.active_scene_id) || p.scenes[0] || null
  }

  addScene(projectId, name = 'New Scene') {
    const p = this.getProject(projectId)
    if (!p) return null
    this._snapshot()
    const s = { id: uuid(), name, quote: '', status_bar: defaultStatusBar(), actor_overrides: {}, messages: [] }
    p.scenes.push(s)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return s
  }

  duplicateScene(projectId, sceneId) {
    const p = this.getProject(projectId)
    if (!p) return null
    const src = p.scenes.find(s => s.id === sceneId)
    if (!src) return null

    this._snapshot()
    const copy = {
      ...src,
      id: uuid(),
      name: `${src.name} Copy`,
      actor_overrides: { ...(src.actor_overrides || {}) },
      messages: (src.messages || []).map(m => ({ ...m, id: uuid() })),
    }
    p.scenes.push(copy)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return copy
  }

  clearSceneMessages(projectId, sceneId) {
    const p = this.getProject(projectId)
    if (!p) return false
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return false
    if (!scene.messages?.length) return false

    this._snapshot()
    scene.messages = []
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return true
  }

  updateScene(projectId, sceneId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const idx = p.scenes.findIndex(s => s.id === sceneId)
    if (idx < 0) return
    this._snapshot()
    p.scenes[idx] = { ...p.scenes[idx], ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  deleteScene(projectId, sceneId) {
    const p = this.getProject(projectId)
    if (!p || p.scenes.length <= 1) return false
    const nextScenes = p.scenes.filter(s => s.id !== sceneId)
    if (nextScenes.length === p.scenes.length) return false
    this._snapshot()
    p.scenes = nextScenes
    if (p.active_scene_id === sceneId) p.active_scene_id = p.scenes[0].id
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return true
  }

  setActiveScene(projectId, sceneId) {
    this.updateProject(projectId, { active_scene_id: sceneId })
  }

  getSceneStatusBar(projectId, sceneId) {
    const scene = this.getScene(projectId, sceneId)
    return { ...defaultStatusBar(), ...(scene?.status_bar || {}) }
  }

  updateSceneStatusBar(projectId, sceneId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const idx = p.scenes.findIndex(s => s.id === sceneId)
    if (idx < 0) return
    this._snapshot()
    const current = { ...defaultStatusBar(), ...(p.scenes[idx].status_bar || {}) }
    p.scenes[idx] = { ...p.scenes[idx], status_bar: { ...current, ...patch } }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  updateSceneActorOverride(projectId, sceneId, actorId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const idx = p.scenes.findIndex(s => s.id === sceneId)
    if (idx < 0) return
    const actor = String(actorId || '').trim()
    if (!actor) return

    this._snapshot()
    const scene = p.scenes[idx]
    const overrides = { ...(scene.actor_overrides || {}) }
    const next = { ...(overrides[actor] || {}) }

    Object.entries(patch || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        delete next[key]
      } else {
        next[key] = value
      }
    })

    if (Object.keys(next).length) {
      overrides[actor] = next
    } else {
      delete overrides[actor]
    }

    p.scenes[idx] = { ...scene, actor_overrides: overrides }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  getEffectiveActor(projectId, sceneId, actorId) {
    const p = this.getProject(projectId)
    const scene = p?.scenes.find(s => s.id === sceneId)
    const base = p?.actors.find(a => a.id === actorId) || {}
    const override = scene?.actor_overrides?.[actorId] || {}
    return { ...base, ...override }
  }

  getStatusTemplates() {
    try {
      const raw = localStorage.getItem(STATUS_TEMPLATES_KEY)
      const data = raw ? JSON.parse(raw) : []
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  saveStatusTemplate(template) {
    const list = this.getStatusTemplates()
    const row = {
      id: uuid(),
      name: String(template?.name || 'Untitled'),
      emoji: String(template?.emoji || '⭐'),
      status_bar: { ...defaultStatusBar(), ...(template?.status_bar || {}) },
      created_at: now(),
    }
    list.unshift(row)
    localStorage.setItem(STATUS_TEMPLATES_KEY, JSON.stringify(list))
    return row
  }

  deleteStatusTemplate(id) {
    const list = this.getStatusTemplates().filter(t => t.id !== id)
    localStorage.setItem(STATUS_TEMPLATES_KEY, JSON.stringify(list))
  }

  getStatusQuickpicks() {
    try {
      const raw = localStorage.getItem(STATUS_QUICKPICKS_KEY)
      const data = raw ? JSON.parse(raw) : defaultStatusQuickpicks()
      return {
        ...defaultStatusQuickpicks(),
        ...(data || {}),
      }
    } catch {
      return defaultStatusQuickpicks()
    }
  }

  addStatusQuickpick(field, value) {
    const v = String(value || '').trim()
    if (!v) return
    if (!['carrier', 'network', 'time'].includes(field)) return
    const picks = this.getStatusQuickpicks()
    const list = Array.isArray(picks[field]) ? picks[field] : []
    if (!list.includes(v)) list.unshift(v)
    picks[field] = list.slice(0, 8)
    localStorage.setItem(STATUS_QUICKPICKS_KEY, JSON.stringify(picks))
  }

  removeStatusQuickpick(field, value) {
    if (!['carrier', 'network', 'time'].includes(field)) return
    const picks = this.getStatusQuickpicks()
    picks[field] = (Array.isArray(picks[field]) ? picks[field] : []).filter(v => v !== value)
    localStorage.setItem(STATUS_QUICKPICKS_KEY, JSON.stringify(picks))
  }

  // ── Messages ─────────────────────────────────
  addMessage(projectId, sceneId, actorId, text, extras = {}) {
    const p = this.getProject(projectId)
    if (!p) return null
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return null
    this._snapshot()
    const msg = { id: uuid(), actor_id: actorId, text: text.trim(), ts: now(), ...extras }
    scene.messages.push(msg)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return msg
  }

  updateMessage(projectId, sceneId, msgId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return
    const idx = scene.messages.findIndex(m => m.id === msgId)
    if (idx < 0) return
    this._snapshot()
    scene.messages[idx] = { ...scene.messages[idx], ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  deleteMessage(projectId, sceneId, msgId) {
    const p = this.getProject(projectId)
    if (!p) return
    const scene = p.scenes.find(s => s.id === sceneId)
    if (!scene) return
    this._snapshot()
    scene.messages = scene.messages.filter(m => m.id !== msgId)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  // ── Actors ───────────────────────────────────
  addGroup(projectId, name, color = '#888888') {
    const p = this.getProject(projectId)
    if (!p) return null
    this._snapshot()
    const group = { id: uuid(), name, color }
    p.groups = [...(p.groups || []), group]
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return group
  }

  addActor(projectId, name, color, side = 'left', avatar = null) {
    const p = this.getProject(projectId)
    if (!p) return null
    this._snapshot()
    const actor = { id: uuid(), name, color, side, avatar }
    p.actors.push(actor)
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return actor
  }

  updateActor(projectId, actorId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    const idx = p.actors.findIndex(a => a.id === actorId)
    if (idx < 0) return
    this._snapshot()
    p.actors[idx] = { ...p.actors[idx], ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }

  deleteActor(projectId, actorId) {
    const p = this.getProject(projectId)
    if (!p) return false
    if ((p.actors || []).length <= 1) return false
    const remaining = p.actors.filter(a => a.id !== actorId)
    if (remaining.length === p.actors.length) return false
    this._snapshot()
    const fallbackActorId = remaining[0]?.id || null

    p.actors = remaining
    p.scenes = p.scenes.map(scene => ({
      ...scene,
      messages: (scene.messages || []).map(msg => (
        msg.actor_id === actorId && fallbackActorId
          ? { ...msg, actor_id: fallbackActorId }
          : msg
      )),
    }))
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
    return true
  }

  // ── Render settings ──────────────────────────
  updateRenderSettings(projectId, patch) {
    const p = this.getProject(projectId)
    if (!p) return
    this._snapshot()
    p.render_settings = { ...p.render_settings, ...patch }
    p.updated_at = now()
    this._save()
    this._emit('project-changed', projectId)
  }
}

export const store = new Store()

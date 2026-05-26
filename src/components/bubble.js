import { store } from '../store.js'

/**
 * Renders message rows for a scene.
 * Groups consecutive messages from the same actor and applies
 * first/mid/last corner radius variants.
 */
export function renderMessages(messages, actors, opts = {}) {
  if (typeof opts === 'function') opts = {}
  const showNames = opts.showNames !== false
  const showTimestamps = opts.showTimestamps === true
  const hideControls = opts.hideControls === true
  if (!messages.length) {
    if (hideControls) return '' // play screen — show nothing
    return `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;">
      <p style="color:var(--t3);font-size:14px;text-align:center;">No messages yet.<br>Pick an actor below and start typing.</p>
    </div>`
  }

  const actorMap = Object.fromEntries(actors.map(a => [a.id, a]))
  const groups = groupMessages(messages)
  let html = ''
  const fallbackActor = {
    id: '__unknown__',
    name: 'Unknown',
    side: 'left',
    color: '#7D8085',
  }

  for (const group of groups) {
    const actor = (opts.projectId && opts.sceneId)
      ? (store.getEffectiveActor(opts.projectId, opts.sceneId, group.actor_id) || fallbackActor)
      : (actorMap[group.actor_id] || fallbackActor)
    const isRight = actor.side === 'right'
    const isLeft = !isRight
    const colorRgb = hexToRgb(actor.color)

    for (let i = 0; i < group.messages.length; i++) {
      const msg = group.messages[i]
      const textValue = String(msg.text || '')
      const isFirst = i === 0
      const isLast  = i === group.messages.length - 1
      const isSolo  = group.messages.length === 1

      let grpClass = ''
      if (!isSolo) {
        if (isFirst)      grpClass = 'grp-first'
        else if (isLast)  grpClass = 'grp-last'
        else              grpClass = 'grp-mid'
      }

      const showAvatar = isLast || isSolo
      const showName   = showNames && (isFirst || isSolo)

      const avatarEl = showAvatar
        ? (actor.avatar
          ? `<div class="avatar" style="box-shadow:0 0 0 2px rgba(${colorRgb},0.32);"><img class="actor-avatar-img" src="${escAttr(actor.avatar)}" alt="${escAttr(actor.name || 'Actor')}" /></div>`
          : `<div class="avatar" style="background:${actor.color};box-shadow:0 0 0 2px rgba(${colorRgb},0.32);">${(actor.name?.[0] || '?').toUpperCase()}</div>`)
        : `<div class="avatar ghost"></div>`

      const nameEl = showName
        ? `<div class="bubble-sender ${isRight ? 'right' : ''}" style="color:rgba(${colorRgb},0.62);">${actor.name}</div>`
        : ''
      const tsEl = showTimestamps
        ? `<div class="bubble-meta">${formatMessageTime(msg.ts)}</div>`
        : ''
      const reactions = Array.isArray(msg.reactions)
        ? msg.reactions
        : (msg.reaction ? [msg.reaction] : [])
      const statusHtml = isRight && msg.status
        ? `<div class="bubble-status">${msg.status === 'seen' ? `<span style="color:var(--accent)">✓✓</span>` : msg.status === 'delivered' ? '<span>✓✓</span>' : '<span>✓</span>'}</div>`
        : ''
      const leftHandle = (!isRight && !hideControls)
        ? `<div class="msg-handle-left"><div class="msg-drag-handle" data-msg-id="${msg.id}" title="Hold to reorder">≡</div></div>`
        : '<div class="msg-handle-left"></div>'
      const rightHandle = (isRight && !hideControls)
        ? `<div class="msg-handle-right"><div class="msg-drag-handle" data-msg-id="${msg.id}" title="Hold to reorder">≡</div></div>`
        : '<div class="msg-handle-right"></div>'
      const leftArrow = (isRight && showAvatar && !hideControls)
        ? `<div class="msg-arrow-left"><button class="side-arrow" data-actor-id="${actor.id}" data-dir="left" aria-label="Flip actor to left">←</button></div>`
        : `<div class="msg-arrow-left"></div>`
      const rightArrow = (isLeft && showAvatar && !hideControls)
        ? `<div class="msg-arrow-right"><button class="side-arrow" data-actor-id="${actor.id}" data-dir="right" aria-label="Flip actor to right">→</button></div>`
        : `<div class="msg-arrow-right"></div>`
      let bubbleStyle = ''
      if (!isRight) {
        bubbleStyle = `background:rgba(${colorRgb},0.10);border:1px solid rgba(${colorRgb},0.16);`
      }

      html += `
        <div class="msg-row ${isRight ? 'row-right' : 'row-left'}" data-msg-id="${msg.id}">
          ${leftHandle}
          ${leftArrow}
          <div class="msg-body">
            <div class="msg-content ${isRight ? 'right' : 'left'}">
              ${avatarEl}
              <div class="bubble-wrap">
                ${nameEl}
                <div class="bubble ${isRight ? 'right' : 'left'} ${grpClass}"
                     style="${bubbleStyle}"
                     data-msg-id="${msg.id}"
                     data-actor-id="${actor.id}"
                     title="${escHtml(msg.text)}">
                  ${msg.media ? `<img class="bubble-media" src="${escAttr(msg.media)}" alt="attachment" />` : ''}
                  ${msg.audio ? `<audio class="bubble-audio" controls src="${escAttr(msg.audio)}"></audio>` : ''}
                  ${msg.file_name ? `<div class="bubble-file"><div class="bubble-file-icon">FILE</div><div class="bubble-file-meta"><div class="bubble-file-name">${escHtml(msg.file_name)}</div><div class="bubble-file-sub">Attached file</div></div></div>` : ''}
                    ${textValue ? `<div class="bubble-text">${escHtml(textValue)}</div>` : ''}
                </div>
                ${statusHtml}
                ${reactions.length ? `<div class="bubble-reactions">${reactions.map(r => `<span class="reaction-pill">${escHtml(r)}</span>`).join('')}</div>` : ''}
                ${tsEl}
              </div>
            </div>
          </div>
          ${rightArrow}
          ${rightHandle}
        </div>`
    }
    html += '<div style="height:6px;"></div>'
  }

  return html
}

export function renderTypingIndicator(actor) {
  if (!actor) return ''
  const colorRgb = hexToRgb(actor.color)
  const avatar = actor.avatar
    ? `<div class="avatar" style="box-shadow:0 0 0 2px rgba(${colorRgb},0.3);"><img class="actor-avatar-img" src="${escAttr(actor.avatar)}" alt="${escAttr(actor.name || 'Actor')}" /></div>`
    : `<div class="avatar" style="background:${actor.color};box-shadow:0 0 0 2px rgba(${colorRgb},0.3);">${actor.name[0]}</div>`
  return `
    <div class="typing-row">
      ${avatar}
      <div class="typing-bubble" style="background:rgba(${colorRgb},0.10);border:1px solid rgba(${colorRgb},0.16);">
        <div class="typing-dot" style="background:rgba(${colorRgb},0.6);"></div>
        <div class="typing-dot" style="background:rgba(${colorRgb},0.6);"></div>
        <div class="typing-dot" style="background:rgba(${colorRgb},0.6);"></div>
      </div>
    </div>`
}

function groupMessages(messages) {
  const groups = []
  for (const msg of messages) {
    const last = groups[groups.length - 1]
    if (last && last.actor_id === msg.actor_id) {
      last.messages.push(msg)
    } else {
      groups.push({ actor_id: msg.actor_id, messages: [msg] })
    }
  }
  return groups
}

export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function formatMessageTime(ts) {
  const date = new Date(Number(ts || Date.now()))
  const hours = date.getHours()
  const mins = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${mins} ${ampm}`
}

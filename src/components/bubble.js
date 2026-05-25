/**
 * Renders message rows for a scene.
 * Groups consecutive messages from the same actor and applies
 * first/mid/last corner radius variants.
 */
export function renderMessages(messages, actors, onBubbleTap) {
  if (!messages.length) {
    return `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;">
      <p style="color:var(--t3);font-size:14px;text-align:center;">No messages yet.<br>Pick an actor below and start typing.</p>
    </div>`
  }

  const actorMap = Object.fromEntries(actors.map(a => [a.id, a]))
  const groups = groupMessages(messages)
  let html = ''

  for (const group of groups) {
    const actor = actorMap[group.actor_id]
    if (!actor) continue
    const isRight = actor.side === 'right'
    const colorRgb = hexToRgb(actor.color)

    for (let i = 0; i < group.messages.length; i++) {
      const msg = group.messages[i]
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
      const showName   = isFirst || isSolo

      const avatarEl = showAvatar
        ? `<div class="avatar" style="background:${actor.color};box-shadow:0 0 0 2px rgba(${colorRgb},0.32);">${actor.name[0].toUpperCase()}</div>`
        : `<div class="avatar ghost"></div>`

      const nameEl = showName && !isRight
        ? `<div class="bubble-sender" style="color:rgba(${colorRgb},0.62);">${actor.name}</div>`
        : ''

      let bubbleStyle = ''
      if (!isRight) {
        bubbleStyle = `background:rgba(${colorRgb},0.10);border:1px solid rgba(${colorRgb},0.16);`
      }

      html += `
        <div class="msg-row ${isRight ? 'right' : 'left'}">
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
              <div class="bubble-text">${escHtml(msg.text)}</div>
              ${msg.reaction ? `<div class="bubble-reaction" aria-label="Reaction">${escHtml(msg.reaction)}</div>` : ''}
            </div>
          </div>
        </div>`
    }
    html += '<div style="height:6px;"></div>'
  }

  return html
}

export function renderTypingIndicator(actor) {
  if (!actor) return ''
  const colorRgb = hexToRgb(actor.color)
  return `
    <div class="typing-row">
      <div class="avatar" style="background:${actor.color};box-shadow:0 0 0 2px rgba(${colorRgb},0.3);">${actor.name[0]}</div>
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
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

/* BLVCK Features — Global Chat UI
 * Version: 0.1.0
 *
 * This file intentionally does not contain Supabase credentials or assume a
 * database schema. Connect the backend by defining window.BLVCK_CHAT_ADAPTER
 * before this script runs, or dispatch `blvck:chat-adapter-ready` afterward.
 *
 * Adapter contract:
 *   getCurrentUser() -> { id: string, username: string } | null
 *   listMessages({ limit }) -> Promise<Array<{ id, user_id, username, content, created_at }>>
 *   sendMessage({ content }) -> Promise<void>
 *   subscribe(onMessage) -> (() => void) | { unsubscribe(): void }
 */
(function () {
  'use strict';

  if (window.BLVCK_FEATURES_CHAT_LOADED) return;
  window.BLVCK_FEATURES_CHAT_LOADED = true;

  const STYLE_ID = 'blvck-global-chat-styles';
  const ROOT_ID = 'blvck-global-chat';
  const MAX_MESSAGE_LENGTH = 500;
  const HISTORY_LIMIT = 60;

  const css = `
  #blvck-chat-launcher{position:fixed;right:20px;bottom:20px;z-index:2147482000;display:flex;align-items:center;gap:10px;padding:12px 17px;border:1px solid rgba(18,223,243,.35);border-radius:999px;background:rgba(8,13,19,.88);color:#f5fdff;font:600 13px/1.2 Inter,system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 8px 32px rgba(0,0,0,.35),0 0 22px rgba(18,223,243,.13);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);cursor:pointer;transition:transform .2s,border-color .2s,box-shadow .2s}
  #blvck-chat-launcher:hover{transform:translateY(-2px);border-color:rgba(18,223,243,.75);box-shadow:0 10px 36px rgba(0,0,0,.4),0 0 28px rgba(18,223,243,.2)}
  #blvck-chat-launcher .blvck-chat-dot{width:8px;height:8px;border-radius:50%;background:#12dff3;box-shadow:0 0 10px #12dff3}
  #${ROOT_ID}{position:fixed;right:20px;bottom:78px;z-index:2147482001;width:min(380px,calc(100vw - 28px));height:min(560px,calc(100dvh - 112px));display:none;flex-direction:column;overflow:hidden;border:1px solid rgba(18,223,243,.22);border-radius:22px;background:rgba(7,10,16,.94);color:#f5f7fb;font-family:Inter,system-ui,sans-serif;box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 36px rgba(18,223,243,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
  #${ROOT_ID}.is-open{display:flex;animation:blvckChatIn .18s ease-out}
  @keyframes blvckChatIn{from{opacity:0;transform:translateY(9px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
  #${ROOT_ID} *{box-sizing:border-box}
  #${ROOT_ID} .blvck-chat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 18px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(120deg,rgba(18,223,243,.09),transparent 70%)}
  #${ROOT_ID} .blvck-chat-title{font-size:15px;font-weight:750;letter-spacing:.12em}
  #${ROOT_ID} .blvck-chat-subtitle{margin-top:4px;color:#8995a5;font-size:11px}
  #${ROOT_ID} .blvck-chat-close{width:31px;height:31px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.05);color:#eafcff;font-size:19px;cursor:pointer}
  #${ROOT_ID} .blvck-chat-status{padding:8px 18px;color:#8d9aa9;font-size:11px;border-bottom:1px solid rgba(255,255,255,.05)}
  #${ROOT_ID} .blvck-chat-status[data-state="ready"]{color:#63e6c2}
  #${ROOT_ID} .blvck-chat-status[data-state="error"]{color:#ff9d9d}
  #${ROOT_ID} .blvck-chat-messages{flex:1;min-height:0;overflow:auto;padding:15px 13px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
  #${ROOT_ID} .blvck-chat-empty{margin:auto;max-width:245px;text-align:center;color:#84909f;font-size:12px;line-height:1.6}
  #${ROOT_ID} .blvck-chat-empty strong{display:block;margin-bottom:5px;color:#eafcff;font-size:14px}
  #${ROOT_ID} .blvck-chat-message{max-width:88%;align-self:flex-start;padding:9px 11px;border:1px solid rgba(255,255,255,.07);border-radius:13px 13px 13px 4px;background:rgba(255,255,255,.055);overflow-wrap:anywhere}
  #${ROOT_ID} .blvck-chat-message.is-own{align-self:flex-end;border-color:rgba(18,223,243,.2);border-radius:13px 13px 4px 13px;background:rgba(18,223,243,.09)}
  #${ROOT_ID} .blvck-chat-author{margin-bottom:4px;color:#54dbea;font-size:10px;font-weight:700;letter-spacing:.04em}
  #${ROOT_ID} .blvck-chat-message.is-own .blvck-chat-author{color:#9ceef5}
  #${ROOT_ID} .blvck-chat-body{white-space:pre-wrap;color:#e8edf3;font-size:12px;line-height:1.5}
  #${ROOT_ID} .blvck-chat-time{margin-top:5px;color:#758292;font-size:9px;text-align:right}
  #${ROOT_ID} .blvck-chat-compose{display:flex;align-items:flex-end;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.15)}
  #${ROOT_ID} .blvck-chat-input{flex:1;min-width:0;max-height:100px;resize:none;padding:11px 12px;border:1px solid rgba(255,255,255,.1);border-radius:13px;outline:none;background:rgba(255,255,255,.055);color:#fff;font:12px/1.4 Inter,system-ui,sans-serif}
  #${ROOT_ID} .blvck-chat-input:focus{border-color:rgba(18,223,243,.55);box-shadow:0 0 0 3px rgba(18,223,243,.08)}
  #${ROOT_ID} .blvck-chat-input:disabled{opacity:.5}
  #${ROOT_ID} .blvck-chat-send{height:39px;padding:0 14px;border:0;border-radius:12px;background:linear-gradient(135deg,#12dff3,#087dff);color:#031014;font-size:12px;font-weight:800;cursor:pointer}
  #${ROOT_ID} .blvck-chat-send:disabled{opacity:.4;cursor:not-allowed}
  #${ROOT_ID} .blvck-chat-footnote{padding:0 14px 10px;color:#667383;font-size:9px;text-align:center}
  @media(max-width:520px){#blvck-chat-launcher{right:13px;bottom:13px}#${ROOT_ID}{right:8px;bottom:65px;width:calc(100vw - 16px);height:min(580px,calc(100dvh - 82px));border-radius:19px}}
  `;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildUI() {
    if (document.getElementById(ROOT_ID)) return;
    addStyles();

    const launcher = el('button');
    launcher.id = 'blvck-chat-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open Global Chat');
    const dot = el('span', 'blvck-chat-dot');
    const label = el('span', '', 'GLOBAL CHAT');
    launcher.append(dot, label);

    const panel = el('section');
    panel.id = ROOT_ID;
    panel.setAttribute('aria-label', 'BLVCK Global Chat');
    panel.setAttribute('aria-live', 'polite');

    const head = el('div', 'blvck-chat-head');
    const titleWrap = el('div');
    titleWrap.append(el('div', 'blvck-chat-title', 'GLOBAL CHAT'), el('div', 'blvck-chat-subtitle', 'BLVCK community')); 
    const close = el('button', 'blvck-chat-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close chat');
    head.append(titleWrap, close);

    const status = el('div', 'blvck-chat-status', 'Waiting for BLVCK account connection…');
    status.dataset.state = 'pending';
    const messages = el('div', 'blvck-chat-messages');
    const empty = el('div', 'blvck-chat-empty');
    empty.append(el('strong', '', 'Your global chat starts here.'), document.createTextNode('Connect the BLVCK account backend to load messages and start chatting.'));
    messages.appendChild(empty);

    const compose = el('form', 'blvck-chat-compose');
    const input = el('textarea', 'blvck-chat-input');
    input.rows = 1;
    input.maxLength = MAX_MESSAGE_LENGTH;
    input.placeholder = 'Connect your account to chat…';
    input.disabled = true;
    const send = el('button', 'blvck-chat-send', 'SEND');
    send.type = 'submit';
    send.disabled = true;
    compose.append(input, send);
    const foot = el('div', 'blvck-chat-footnote', 'Be respectful • 500 characters max');
    panel.append(head, status, messages, compose, foot);
    document.body.append(launcher, panel);

    const state = { adapter: null, user: null, unsubscribe: null, busy: false, seen: new Set() };

    function setStatus(message, kind) {
      status.textContent = message;
      status.dataset.state = kind || 'pending';
    }

    function scrollToBottom() { messages.scrollTop = messages.scrollHeight; }

    function renderMessage(message) {
      if (!message || message.id && state.seen.has(String(message.id))) return;
      if (message.id) state.seen.add(String(message.id));
      const own = state.user && String(message.user_id) === String(state.user.id);
      const item = el('article', 'blvck-chat-message' + (own ? ' is-own' : ''));
      item.appendChild(el('div', 'blvck-chat-author', own ? 'YOU' : (message.username || 'BLVCK USER')));
      item.appendChild(el('div', 'blvck-chat-body', String(message.content || '')));
      if (message.created_at) {
        const date = new Date(message.created_at);
        if (!Number.isNaN(date.getTime())) item.appendChild(el('div', 'blvck-chat-time', date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
      }
      const placeholder = messages.querySelector('.blvck-chat-empty');
      if (placeholder) placeholder.remove();
      messages.appendChild(item);
      while (messages.children.length > HISTORY_LIMIT) messages.removeChild(messages.firstChild);
      scrollToBottom();
    }

    function setComposerEnabled(enabled) {
      input.disabled = !enabled;
      send.disabled = !enabled;
      input.placeholder = enabled ? 'Write a message…' : 'Sign in to chat…';
    }

    async function connect() {
      const adapter = window.BLVCK_CHAT_ADAPTER;
      if (!adapter || typeof adapter.getCurrentUser !== 'function' || typeof adapter.listMessages !== 'function' || typeof adapter.sendMessage !== 'function') {
        setStatus('Waiting for the BLVCK account + chat backend.', 'pending');
        setComposerEnabled(false);
        return;
      }
      state.adapter = adapter;
      try {
        state.user = await adapter.getCurrentUser();
        if (!state.user || !state.user.id || !state.user.username) {
          setStatus('Sign in to your BLVCK account to use Global Chat.', 'pending');
          setComposerEnabled(false);
          return;
        }
        setStatus('Connected as @' + state.user.username, 'ready');
        setComposerEnabled(true);
        const history = await adapter.listMessages({ limit: HISTORY_LIMIT });
        if (Array.isArray(history)) history.forEach(renderMessage);
        if (typeof adapter.subscribe === 'function' && !state.unsubscribe) {
          const unsub = adapter.subscribe(renderMessage);
          state.unsubscribe = typeof unsub === 'function' ? unsub : (unsub && typeof unsub.unsubscribe === 'function' ? () => unsub.unsubscribe() : null);
        }
      } catch (error) {
        console.error('[BLVCK chat] connection failed:', error);
        setStatus('Chat connection failed. Check the backend setup.', 'error');
        setComposerEnabled(false);
      }
    }

    launcher.addEventListener('click', () => {
      panel.classList.toggle('is-open');
      if (panel.classList.contains('is-open')) connect();
    });
    close.addEventListener('click', () => panel.classList.remove('is-open'));
    compose.addEventListener('submit', async event => {
      event.preventDefault();
      const content = input.value.trim();
      if (!content || content.length > MAX_MESSAGE_LENGTH || state.busy || !state.adapter || !state.user) return;
      state.busy = true;
      send.disabled = true;
      try {
        await state.adapter.sendMessage({ content });
        input.value = '';
        input.style.height = 'auto';
      } catch (error) {
        console.error('[BLVCK chat] message send failed:', error);
        setStatus('Message could not be sent. Try again.', 'error');
      } finally {
        state.busy = false;
        send.disabled = !state.user;
        input.focus();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        compose.requestSubmit();
      }
    });
    window.addEventListener('blvck:chat-adapter-ready', connect);
    window.addEventListener('blvck:auth-changed', connect);
    window.BLVCK_CHAT_UI = { open: () => { panel.classList.add('is-open'); connect(); }, close: () => panel.classList.remove('is-open'), refresh: connect };
  }

  function start() {
    if (document.body) buildUI();
    else document.addEventListener('DOMContentLoaded', buildUI, { once: true });
  }

  start();
})();
// BLVCK browser adapter. Keep this file public-key-only; never put server secrets here.
(() => {
  "use strict";
  const SUPABASE_URL = "https://teqctrceotdzzcxynlzb.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY"; // Add the public publishable key from Supabase Project Settings.
  const API = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/blvck-api";
  const TOKEN_KEY = "blvck_session_v1";
  let currentUser = null;

  async function request(action, payload = {}, needsAuth = false) {
    const token = sessionStorage.getItem(TOKEN_KEY) || "";
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " + (needsAuth && token ? token : SUPABASE_PUBLISHABLE_KEY)
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "BLVCK backend request failed.");
    return result;
  }

  function acceptSession(result) {
    sessionStorage.setItem(TOKEN_KEY, result.token);
    currentUser = result.user;
    window.dispatchEvent(new Event("blvck:auth-changed"));
    return currentUser;
  }
  async function getCurrentUser() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const result = await request("me", {}, true);
      currentUser = result.user;
      return currentUser;
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      currentUser = null;
      return null;
    }
  }
  async function login({ username, password }) {
    return acceptSession(await request("login", { username, password }));
  }
  async function signUp({ username, password }) {
    return acceptSession(await request("signup", { username, password }));
  }
  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    currentUser = null;
    window.dispatchEvent(new Event("blvck:auth-changed"));
  }

  async function claimOwner(setupToken) { return acceptSession(await request("owner-claim", { setupToken }, true)); }
  const authAdapter = { getCurrentUser, login, signUp, logout, claimOwner };
  const chatAdapter = {
    getCurrentUser,
    async listMessages({ limit = 60 } = {}) {
      const result = await request("chat-list", { limit }, true);
      return result.messages || [];
    },
    async sendMessage({ content }) {
      await request("chat-send", { content }, true);
    },
    subscribe(onMessage) {
      let stopped = false;
      let newestId = 0;
      const poll = async () => {
        if (stopped) return;
        try {
          const rows = await chatAdapter.listMessages({ limit: 100 });
          for (const row of rows) {
            const id = Number(row.id) || 0;
            if (id > newestId) { newestId = id; onMessage(row); }
          }
        } catch (error) {
          console.warn("[BLVCK chat polling]", error);
        }
      };
      poll();
      const timer = window.setInterval(poll, 5000);
      return () => { stopped = true; window.clearInterval(timer); };
    }
  };

  window.BLVCK_AUTH_ADAPTER = authAdapter;
  window.BLVCK_CHAT_ADAPTER = chatAdapter;
  window.BLVCK_BACKEND_READY = true;
  window.dispatchEvent(new Event("blvck:auth-adapter-ready"));
  window.dispatchEvent(new Event("blvck:chat-adapter-ready"));
  getCurrentUser().then(() => window.dispatchEvent(new Event("blvck:auth-changed")));
})();

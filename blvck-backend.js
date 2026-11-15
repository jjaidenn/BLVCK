// BLVCK browser adapter. Public publishable key only; never put server secrets here.
(() => {
  "use strict";
  const SUPABASE_URL = "https://teqctrceotdzzcxynlzb.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BIunSLO8Rlq1p0hjKa0FVA_ey5w0oMd";
  const API = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/blvck-api";
  const TOKEN_KEY = "blvck_session_v1";
  const CONFIGURED = !!SUPABASE_PUBLISHABLE_KEY;
  let currentUser = null;
  let lastMessageId = 0;
  async function request(action,payload={},needsAuth=false){
    if(!CONFIGURED)throw new Error("BLVCK backend is not configured.");
    const token=sessionStorage.getItem(TOKEN_KEY)||"";
    const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+(needsAuth&&token?token:SUPABASE_PUBLISHABLE_KEY)},body:JSON.stringify({action,...payload})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"BLVCK backend request failed.");
    return result;
  }
  function acceptSession(result){sessionStorage.setItem(TOKEN_KEY,result.token);currentUser=result.user;window.dispatchEvent(new Event("blvck:auth-changed"));return currentUser;}
  async function getCurrentUser(){
    const token=sessionStorage.getItem(TOKEN_KEY);if(!token)return null;
    try{const result=await request("me",{},true);currentUser=result.user;return currentUser;}
    catch{sessionStorage.removeItem(TOKEN_KEY);currentUser=null;return null;}
  }
  async function login({username,password}){return acceptSession(await request("login",{username,password}));}
  async function signUp({username,password}){return acceptSession(await request("signup",{username,password}));}
  function logout(){sessionStorage.removeItem(TOKEN_KEY);currentUser=null;lastMessageId=0;window.dispatchEvent(new Event("blvck:auth-changed"));}
  const authAdapter={getCurrentUser,login,signUp,logout};
  const chatAdapter={
    getCurrentUser,
    async listMessages({limit=60}={}){const result=await request("chat-list",{limit},true);const rows=result.messages||[];for(const row of rows)lastMessageId=Math.max(lastMessageId,Number(row.id)||0);return rows;},
    async sendMessage({content}){await request("chat-send",{content},true);},
    subscribe(onMessage){let stopped=false;const poll=async()=>{if(stopped)return;try{const result=await request("chat-list",{limit:100},true);const fresh=(result.messages||[]).filter(row=>(Number(row.id)||0)>lastMessageId);for(const row of fresh){lastMessageId=Math.max(lastMessageId,Number(row.id)||0);onMessage(row);}}catch(error){console.warn("[BLVCK chat polling]",error);}};poll();const timer=window.setInterval(poll,5000);return()=>{stopped=true;window.clearInterval(timer);};}
  };
  // Independent Railway service: public launcher/config API.
  const RAILWAY_API_BASE = "https://blvck-api-production.up.railway.app";
  const railwayRequest = async (path) => {
    const response = await fetch(RAILWAY_API_BASE + path, { headers: { "Accept": "application/json" }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "BLVCK API request failed.");
    return data;
  };
  const railwayAPI = {
    baseURL: RAILWAY_API_BASE,
    health: () => railwayRequest("/health"),
    getConfig: () => railwayRequest("/api/v1/config"),
    getLinks: () => railwayRequest("/api/v1/links")
  };
  window.BLVCK_API = railwayAPI;
  window.BLVCK_API_STATUS = { state: "connecting", config: null, links: [] };
  window.BLVCK_API_READY = railwayAPI.health()
    .then(async health => {
      const [config, linkResult] = await Promise.all([railwayAPI.getConfig(), railwayAPI.getLinks()]);
      window.BLVCK_API_STATUS = { state: "online", health, config, links: linkResult.links || [] };
      window.dispatchEvent(new CustomEvent("blvck:api-ready", { detail: window.BLVCK_API_STATUS }));
      return window.BLVCK_API_STATUS;
    })
    .catch(error => {
      window.BLVCK_API_STATUS = { state: "offline", error: error.message, config: null, links: [] };
      window.dispatchEvent(new CustomEvent("blvck:api-error", { detail: window.BLVCK_API_STATUS }));
      console.warn("[BLVCK Railway API]", error);
      throw error;
    });
  window.BLVCK_BACKEND_READY=CONFIGURED;
  window.BLVCK_AUTH_ADAPTER=authAdapter;
  window.BLVCK_CHAT_ADAPTER=chatAdapter;
  window.dispatchEvent(new Event("blvck:auth-adapter-ready"));
  window.dispatchEvent(new Event("blvck:chat-adapter-ready"));
  getCurrentUser().then(()=>window.dispatchEvent(new Event("blvck:auth-changed")));
})();

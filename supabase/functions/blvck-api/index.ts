// BLVCK API — username/password auth + Global Chat.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function b64url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeB64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
const encoder = new TextEncoder();
async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function issueToken(account: { id: string; username: string; role: string }, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(encoder.encode(JSON.stringify({
    iss: "blvck", sub: account.id, username: account.username, role: account.role,
    iat: now, exp: now + 60 * 60 * 24 * 7,
  })));
  const input = header + "." + payload;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(input)));
  return input + "." + b64url(signature);
}
async function verifyToken(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const input = parts[0] + "." + parts[1];
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), decodeB64url(parts[2]), encoder.encode(input));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeB64url(parts[1])));
  if (payload.iss !== "blvck" || !payload.sub || !payload.username || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload as { sub: string; username: string; role: string; exp: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authSecret = Deno.env.get("BLVCK_AUTH_SECRET");
  if (!supabaseUrl || !serviceKey || !authSecret) {
    return json({ error: "BLVCK backend environment is incomplete." }, 503);
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "signup") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json({ error: "Username must be 3–20 letters, numbers, or underscores." }, 400);
      if (password.length < 8 || password.length > 128) return json({ error: "Password must be at least 8 characters." }, 400);
      const { data, error } = await db.rpc("blvck_register_account", { p_username: username, p_password: password });
      if (error || !data) return json({ error: "That username may already be taken, or the account could not be created." }, 409);
      const token = await issueToken(data, authSecret);
      return json({ token, user: data });
    }

    if (action === "login") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) return json({ error: "Enter your username and password." }, 400);
      const { data, error } = await db.rpc("blvck_verify_account", { p_username: username, p_password: password });
      if (error || !data) return json({ error: "Incorrect username or password." }, 401);
      const token = await issueToken(data, authSecret);
      return json({ token, user: data });
    }

    const bearer = req.headers.get("authorization") || "";
    const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    const user = token ? await verifyToken(token, authSecret) : null;
    if (!user) return json({ error: "Sign in to continue." }, 401);

    if (action === "me") {
      const { data, error } = await db.from("blvck_accounts").select("id,username,role").eq("id", user.sub).maybeSingle();
      if (error || !data) return json({ error: "Account no longer exists." }, 401);
      return json({ user: data });
    }

    if (action === "chat-list") {
      const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 100);
      const { data, error } = await db.from("blvck_messages")
        .select("id,user_id,content,created_at,blvck_accounts(username)")
        .order("created_at", { ascending: true }).limit(limit);
      if (error) throw error;
      return json({ messages: (data || []).map((m: any) => ({
        id: m.id, user_id: m.user_id, content: m.content, created_at: m.created_at,
        username: m.blvck_accounts?.username || "BLVCK USER",
      })) });
    }

    if (action === "chat-send") {
      const content = String(body.content || "").trim();
      if (!content || content.length > 500) return json({ error: "Messages must be 1–500 characters." }, 400);
      const { data, error } = await db.from("blvck_messages")
        .insert({ user_id: user.sub, content })
        .select("id,user_id,content,created_at").single();
      if (error) throw error;
      return json({ message: { ...data, username: user.username } });
    }

    if (action === "owner-claim") {
      const supplied = String(body.setupToken || "");
      const expected = Deno.env.get("BLVCK_OWNER_SETUP_TOKEN") || "";
      if (!expected || supplied.length !== expected.length) return json({ error: "Owner setup is unavailable." }, 403);
      const a = encoder.encode(supplied), b = encoder.encode(expected);
      let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      if (diff !== 0 || user.username.toLowerCase() !== "turner") return json({ error: "Owner setup was rejected." }, 403);
      const { data: owners, error: ownerCheckError } = await db.from("blvck_accounts").select("id").eq("role", "owner").limit(1);
      if (ownerCheckError) throw ownerCheckError;
      if (owners && owners.length) return json({ error: "An owner is already assigned." }, 409);
      const { data, error } = await db.from("blvck_accounts").update({ role: "owner" }).eq("id", user.sub).select("id,username,role").single();
      if (error) throw error;
      const newToken = await issueToken(data, authSecret);
      return json({ token: newToken, user: data });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("[BLVCK API]", error);
    return json({ error: "The request could not be completed." }, 500);
  }
});

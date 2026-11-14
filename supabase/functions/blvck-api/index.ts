// BLVCK API — username/password accounts + Global Chat.
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const encoder=new TextEncoder();
function b64url(bytes:Uint8Array){let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
function decodeB64url(value:string){const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}
async function hmacKey(secret:string){return crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
async function issueToken(account:{id:string;username:string;role:string},secret:string){
 const now=Math.floor(Date.now()/1000),header=b64url(encoder.encode(JSON.stringify({alg:"HS256",typ:"JWT"})));
 const payload=b64url(encoder.encode(JSON.stringify({iss:"blvck",sub:account.id,username:account.username,role:account.role,iat:now,exp:now+604800})));
 const input=header+"."+payload,signature=new Uint8Array(await crypto.subtle.sign("HMAC",await hmacKey(secret),encoder.encode(input)));
 return input+"."+b64url(signature);
}
async function verifyToken(token:string,secret:string){
 try{const parts=token.split(".");if(parts.length!==3)return null;
 const header=JSON.parse(new TextDecoder().decode(decodeB64url(parts[0])));if(header.alg!=="HS256"||header.typ!=="JWT")return null;
 const input=parts[0]+"."+parts[1],valid=await crypto.subtle.verify("HMAC",await hmacKey(secret),decodeB64url(parts[2]),encoder.encode(input));if(!valid)return null;
 const payload=JSON.parse(new TextDecoder().decode(decodeB64url(parts[1])));
 if(payload.iss!=="blvck"||!payload.sub||!payload.exp||payload.exp<Math.floor(Date.now()/1000))return null;
 return payload as {sub:string;username:string;role:string;exp:number};
 }catch{return null;}
}
const attempts=new Map<string,{start:number;count:number}>();
function rateLimited(req:Request){
 const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",now=Date.now(),current=attempts.get(ip);
 if(!current||now-current.start>60000){attempts.set(ip,{start:now,count:1});return false;}
 current.count++;return current.count>20;
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed."},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL");
 let serviceKey=Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!serviceKey){try{const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");serviceKey=keys.default||Object.values(keys)[0]||"";}catch{}}
 const authSecret=Deno.env.get("BLVCK_AUTH_SECRET")||serviceKey;
 if(!supabaseUrl||!serviceKey||!authSecret)return json({error:"BLVCK backend environment is incomplete."},503);
 const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(),action=String(body.action||"");
  if(action==="signup"||action==="login"){
   if(rateLimited(req))return json({error:"Too many attempts. Wait a minute and try again."},429);
   const username=String(body.username||"").trim(),password=String(body.password||"");
   if(!/^[A-Za-z0-9_]{3,20}$/.test(username))return json({error:"Username must be 3–20 letters, numbers, or underscores."},400);
   if(action==="signup"&&(password.length<8||password.length>128))return json({error:"Password must be 8–128 characters."},400);
   if(action==="login"&&(!password||password.length>128))return json({error:"Incorrect username or password."},401);
   const {data,error}=await db.rpc(action==="signup"?"blvck_register_account":"blvck_verify_account",{p_username:username,p_password:password});
   if(error||!data)return json({error:action==="signup"?"That username may already be taken, or the account could not be created.":"Incorrect username or password."},action==="signup"?409:401);
   return json({token:await issueToken(data,authSecret),user:data});
  }
  const bearer=req.headers.get("authorization")||"",token=bearer.startsWith("Bearer ")?bearer.slice(7):"",tokenUser=token?await verifyToken(token,authSecret):null;
  if(!tokenUser)return json({error:"Sign in to continue."},401);
  const {data:user,error:userError}=await db.from("blvck_accounts").select("id,username,role").eq("id",tokenUser.sub).maybeSingle();
  if(userError||!user)return json({error:"Account no longer exists."},401);
  if(action==="me")return json({user});
  if(action==="chat-list"){
   const limit=Math.min(Math.max(Number(body.limit)||60,1),100);
   const {data,error}=await db.from("blvck_messages").select("id,user_id,content,created_at,blvck_accounts(username)").order("created_at",{ascending:false}).limit(limit);
   if(error)throw error;
   return json({messages:(data||[]).map((m:any)=>({id:m.id,user_id:m.user_id,content:m.content,created_at:m.created_at,username:m.blvck_accounts?.username||"BLVCK USER"})).reverse()});
  }
  if(action==="chat-send"){
   const content=String(body.content||"").trim();if(!content||content.length>500)return json({error:"Messages must be 1–500 characters."},400);
   const {data,error}=await db.from("blvck_messages").insert({user_id:user.id,content}).select("id,user_id,content,created_at").single();
   if(error)throw error;return json({message:{...data,username:user.username}});
  }
  return json({error:"Unknown action."},400);
 }catch(error){console.error("[BLVCK API]",error);return json({error:"The request could not be completed."},500);}
});

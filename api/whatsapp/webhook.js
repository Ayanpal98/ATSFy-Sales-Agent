const crypto=require("crypto");
const BASE=()=>String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const KEY=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
function json(res,status,body){return res.status(status).setHeader("Cache-Control","no-store").json(body)}
function phoneDigits(v){return String(v||"").replace(/\D/g,"")}
async function readRaw(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks)}
function validSignature(raw,signature,secret){
 if(!signature||!secret||!signature.startsWith("sha256="))return false;
 const expected=Buffer.from("sha256="+crypto.createHmac("sha256",secret).update(raw).digest("hex"));
 const actual=Buffer.from(signature);
 return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
}
async function db(path,options={}){
 const r=await fetch(BASE()+"/rest/v1/"+path,{...options,headers:{apikey:KEY(),Authorization:"Bearer "+KEY(),"Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(12000)});
 const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{}
 if(!r.ok)throw new Error("Supabase request failed: "+r.status);
 return data;
}
function messageText(m){
 if(m.type==="text")return String(m.text?.body||"").slice(0,4000);
 if(m.type==="image")return "[Customer sent an image]";
 if(m.type==="document")return "[Customer sent a document]";
 if(m.type==="audio"||m.type==="voice")return "[Customer sent an audio message]";
 if(m.type==="video")return "[Customer sent a video]";
 if(m.type==="location")return "[Customer shared a location]";
 return "[Customer sent a "+String(m.type||"message").slice(0,40)+"]";
}
async function processMessage(m,profileName){
 const from=phoneDigits(m.from),id=String(m.id||"");if(!from||!id)return;
 const seen=await db("whatsapp_message_events?provider_message_id=eq."+encodeURIComponent(id)+"&select=id");
 if(Array.isArray(seen)&&seen.length)return;
 const leads=await db("leads?select=id,phone,name&order=created_at.desc&limit=500");
 const lead=(Array.isArray(leads)?leads:[]).find(x=>phoneDigits(x.phone)===from);
 let leadId=lead?.id||null;
 if(!leadId){
  const inserted=await db("leads",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
   name:String(profileName||"WhatsApp enquiry").slice(0,120),phone:from,source:"whatsapp",status:"new",consent_to_contact:false,whatsapp_opt_in:false,whatsapp_last_inbound_at:new Date().toISOString()
  })});
  leadId=Array.isArray(inserted)?inserted[0]?.id:null;
 }
 if(!leadId)return;
 const content=messageText(m);
 await db("whatsapp_message_events",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({provider_message_id:id,lead_id:leadId,direction:"inbound",from_number:from,message_body:content,provider_status:"received"})});
 await db("leads?id=eq."+encodeURIComponent(leadId),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({whatsapp_last_inbound_at:new Date().toISOString()})});
 await db("lead_activities",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({lead_id:leadId,activity_type:"whatsapp",direction:"inbound",content,actor_id:null})});
}
module.exports=async function handler(req,res){
 if(req.method==="GET"){
  const mode=req.query?.["hub.mode"]||req.query?.hub_mode,token=req.query?.["hub.verify_token"]||req.query?.hub_verify_token,challenge=req.query?.["hub.challenge"]||req.query?.hub_challenge;
  if(mode==="subscribe"&&token&&token===process.env.WHATSAPP_VERIFY_TOKEN)return res.status(200).send(String(challenge||""));
  return res.status(403).send("Forbidden");
 }
 if(req.method!=="POST"){res.setHeader("Allow","GET, POST");return json(res,405,{error:"Method not allowed."})}
 const raw=await readRaw(req);
 if(!validSignature(raw,req.headers["x-hub-signature-256"],process.env.WHATSAPP_APP_SECRET))return json(res,401,{error:"Invalid webhook signature."});
 if(!BASE()||!KEY())return json(res,503,{error:"Webhook storage is not configured."});
 try{
  const body=JSON.parse(raw.toString("utf8"));
  for(const entry of body.entry||[])for(const change of entry.changes||[]){
   const value=change.value||{},contacts=value.contacts||[];
   for(const m of value.messages||[]){
    const contact=contacts.find(c=>phoneDigits(c.wa_id)===phoneDigits(m.from));
    await processMessage(m,contact?.profile?.name||"WhatsApp enquiry");
   }
  }
  return json(res,200,{ok:true});
 }catch(error){console.error("WhatsApp webhook processing failed:",error?.name||"Error");return json(res,500,{error:"Webhook event could not be processed."})}
};
module.exports.config={api:{bodyParser:false}};

const MAX_TEXT = 4096;
function json(res,status,body){return res.status(status).setHeader("Cache-Control","no-store").json(body)}
function clean(v,max=MAX_TEXT){return typeof v==="string"?v.trim().slice(0,max):""}
async function admin(req){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY,header=String(req.headers.authorization||"");
 const token=header.startsWith("Bearer ")?header.slice(7):"";
 if(!url||!key||!token)return null;
 const r=await fetch(url.replace(/\/$/,"")+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token},signal:AbortSignal.timeout(10000)});
 if(!r.ok)return null;const user=await r.json().catch(()=>null);
 return user?.app_metadata?.role==="admin"?{url:url.replace(/\/$/,""),key,token,user}:null;
}
async function rest(s,path,options={}){
 const r=await fetch(s.url+"/rest/v1/"+path,{...options,headers:{apikey:s.key,Authorization:"Bearer "+s.token,"Content-Type":"application/json",...(options.headers||{})},signal:AbortSignal.timeout(12000)});
 const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{}
 if(!r.ok){const e=new Error("Database request failed.");e.status=r.status;throw e}return data;
}
function toE164(value){
 let digits=String(value||"").replace(/\D/g,"");
 if(digits.length===10)digits="91"+digits;
 return digits.length>=11&&digits.length<=15?digits:null;
}
module.exports=async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed."})}
 try{
  const s=await admin(req);if(!s)return json(res,401,{error:"Administrator authentication required."});
  const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  const leadId=clean(b.lead_id,36),message=clean(b.message);
  if(!/^[0-9a-f-]{36}$/i.test(leadId)||!message)return json(res,400,{error:"A lead and message are required."});
  const version=clean(process.env.WHATSAPP_API_VERSION,20),phoneId=clean(process.env.WHATSAPP_PHONE_NUMBER_ID,80),access=process.env.WHATSAPP_ACCESS_TOKEN;
  if(!/^v\d+\.\d+$/.test(version)||!/^\d+$/.test(phoneId)||!access)return json(res,503,{error:"WhatsApp Platform is not connected yet. Complete the approved Coexistence onboarding and configure the server-side credentials."});
  const leads=await rest(s,"leads?id=eq."+encodeURIComponent(leadId)+"&select=id,name,phone,whatsapp_opt_in,whatsapp_last_inbound_at");
  const lead=Array.isArray(leads)?leads[0]:null;if(!lead)return json(res,404,{error:"Lead not found."});
  const to=toE164(lead.phone);if(!to)return json(res,400,{error:"This lead does not have a valid phone number with a country code."});
  const lastInbound=lead.whatsapp_last_inbound_at?new Date(lead.whatsapp_last_inbound_at).getTime():0;
  if(!lastInbound||Date.now()-lastInbound>24*60*60*1000)return json(res,409,{error:"WhatsApp free-form replies are available only within 24 hours of the customer's latest WhatsApp message. An approved template is required outside that window."});
  const response=await fetch("https://graph.facebook.com/"+version+"/"+phoneId+"/messages",{
   method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},
   body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body:message}}),
   signal:AbortSignal.timeout(15000)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){console.error("WhatsApp send failed:",response.status,payload?.error?.code||"unknown");return json(res,502,{error:"WhatsApp could not send this message. Check the platform connection, recipient and messaging permissions."})}
  const providerId=payload.messages?.[0]?.id||null;
  await rest(s,"lead_activities",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({lead_id:leadId,activity_type:"whatsapp",direction:"outbound",content:"WhatsApp message sent by ATSFy administrator: "+message,actor_id:s.user.id})});
  if(providerId)await rest(s,"whatsapp_message_events",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({provider_message_id:providerId,lead_id:leadId,direction:"outbound",from_number:to,message_body:message,provider_status:"accepted"})}).catch(()=>{});
  return json(res,200,{ok:true,message:"WhatsApp message accepted by Meta for delivery.",message_id:providerId});
 }catch(error){console.error("WhatsApp admin send error:",error?.status||error?.name||"Error");return json(res,500,{error:"The WhatsApp message could not be sent. Please retry or use the manual WhatsApp hand-off."})}
};

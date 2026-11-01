const STATUSES = new Set(["new","contacted","qualified","proposal","negotiation","won","lost","not_interested"]);
const CHANNELS = new Set(["whatsapp","email","call","internal"]);
function json(res,status,body){return res.status(status).setHeader("Cache-Control","no-store").json(body)}
function parseBody(req){return typeof req.body==="string"?JSON.parse(req.body):req.body||{}}
function clean(v,max=2000){return typeof v==="string"?v.trim().slice(0,max):""}
async function auth(req){
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
module.exports=async function handler(req,res){
 if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return json(res,405,{error:"Method not allowed."})}
 try{
  const s=await auth(req);if(!s)return json(res,401,{error:"Administrator authentication required."});
  if(req.method==="GET"){
   const [leads,activities,followups,proposals,conversations]=await Promise.all([
    rest(s,"leads?select=id,created_at,updated_at,name,email,phone,company,industry,city,need,budget_range,timeline,source,status,lead_score,assigned_to,last_contact_at,next_follow_up_at,notes,lost_reason&order=created_at.desc&limit=300"),
    rest(s,"lead_activities?select=id,lead_id,activity_type,direction,content,outcome,actor_id,created_at&order=created_at.desc&limit=500"),
    rest(s,"followup_tasks?select=id,lead_id,due_at,channel,message_draft,status,approved_by,approved_at,sent_at,created_at&order=due_at.asc&limit=300"),
    rest(s,"proposals?select=id,lead_id,title,scope,price_min,price_max,currency,status,approved_by,approved_at,created_at&order=created_at.desc&limit=200"),
    rest(s,"conversations?select=id,lead_id,channel,summary,transcript,created_at&order=created_at.desc&limit=200")
   ]);
   return json(res,200,{leads,activities,followups,proposals,conversations});
  }
  const b=parseBody(req),kind=clean(b.kind,30);
  if(req.method==="POST"){
   const leadId=clean(b.lead_id,36);if(!/^[0-9a-f-]{36}$/i.test(leadId))return json(res,400,{error:"A valid lead is required."});
   if(kind==="activity"){
    const content=clean(b.content,4000),type=clean(b.activity_type,30)||"note";
    if(!content||!["note","call","email","whatsapp","meeting"].includes(type))return json(res,400,{error:"Enter a note or valid activity."});
    const row=await rest(s,"lead_activities",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,activity_type:type,direction:b.direction==="inbound"||b.direction==="outbound"?b.direction:null,content,actor_id:s.user.id})});
    return json(res,201,{item:Array.isArray(row)?row[0]:row});
   }
   if(kind==="followup"){
    const due=new Date(b.due_at);const channel=CHANNELS.has(b.channel)?b.channel:"internal";
    if(!Number.isFinite(due.getTime())||due.getTime()<Date.now()-60000)return json(res,400,{error:"Choose a valid future follow-up date and time."});
    const row=await rest(s,"followup_tasks",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,due_at:due.toISOString(),channel,message_draft:clean(b.message_draft,2000)||null,status:"pending"})});
    return json(res,201,{item:Array.isArray(row)?row[0]:row});
   }
   if(kind==="proposal"){
    const title=clean(b.title,180);const min=b.price_min===""||b.price_min==null?null:Number(b.price_min),max=b.price_max===""||b.price_max==null?null:Number(b.price_max);
    if(!title||((min!==null&&(!Number.isFinite(min)||min<0))||(max!==null&&(!Number.isFinite(max)||max<0)))||(min!==null&&max!==null&&max<min))return json(res,400,{error:"Enter a title and valid INR price range."});
    const scope={description:clean(b.scope,4000),deliverables:Array.isArray(b.deliverables)?b.deliverables.map(x=>clean(x,180)).filter(Boolean).slice(0,20):[],terms:"Draft only. Subject to ATSFy review and confirmation."};
    const row=await rest(s,"proposals",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,title,scope,price_min:min,price_max:max,currency:"INR",status:"draft"})});
    return json(res,201,{item:Array.isArray(row)?row[0]:row});
   }
   return json(res,400,{error:"Unsupported workspace action."});
  }
  const id=clean(b.id,36);if(!/^[0-9a-f-]{36}$/i.test(id))return json(res,400,{error:"A valid record ID is required."});
  if(kind==="lead"){
   const patch={};if(typeof b.status==="string"&&STATUSES.has(b.status))patch.status=b.status;
   if(typeof b.notes==="string")patch.notes=clean(b.notes,5000)||null;
   if(b.next_follow_up_at===null)patch.next_follow_up_at=null;else if(typeof b.next_follow_up_at==="string"&&Number.isFinite(new Date(b.next_follow_up_at).getTime()))patch.next_follow_up_at=new Date(b.next_follow_up_at).toISOString();
   if(!Object.keys(patch).length)return json(res,400,{error:"No valid lead changes supplied."});
   await rest(s,"leads?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
   return json(res,200,{ok:true});
  }
  if(kind==="followup"){
   if(!["approved","cancelled"].includes(b.status))return json(res,400,{error:"Follow-ups can only be approved or cancelled here."});
   await rest(s,"followup_tasks?id=eq."+encodeURIComponent(id)+"&status=eq.pending",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:b.status,approved_by:b.status==="approved"?s.user.id:null,approved_at:b.status==="approved"?new Date().toISOString():null})});
   return json(res,200,{ok:true});
  }
  if(kind==="proposal"){
   if(!["pending_approval","approved","rejected"].includes(b.status))return json(res,400,{error:"Invalid proposal review action."});
   await rest(s,"proposals?id=eq."+encodeURIComponent(id)+"&status=in.(draft,pending_approval)",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:b.status,approved_by:b.status==="approved"?s.user.id:null,approved_at:b.status==="approved"?new Date().toISOString():null})});
   return json(res,200,{ok:true});
  }
  return json(res,400,{error:"Unsupported workspace action."});
 }catch(error){console.error("Workspace API error:",error?.status||error?.name||"Error");return json(res,error?.status===400?400:500,{error:"The CRM workspace could not complete that request. Please refresh and try again."})}
};

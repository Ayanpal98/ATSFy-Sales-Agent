const STATUSES = new Set(["new","contacted","qualified","proposal","negotiation","won","lost","not_interested"]);
const CHANNELS = new Set(["whatsapp","email","call","internal"]);
const catalogue = require("../../catalogue.json");
const { catalogueOffers, validateQuote } = require("../../lib/pricing-guard");
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
   const [leads,activities,followups,proposals,conversations,insights]=await Promise.all([
    rest(s,"leads?select=id,created_at,updated_at,name,email,phone,company,industry,city,need,budget_range,timeline,source,status,lead_score,assigned_to,last_contact_at,next_follow_up_at,notes,lost_reason,whatsapp_opt_in,whatsapp_opt_in_at,whatsapp_last_inbound_at&order=created_at.desc&limit=300"),
    rest(s,"lead_activities?select=id,lead_id,activity_type,direction,content,outcome,actor_id,created_at&order=created_at.desc&limit=500"),
    rest(s,"followup_tasks?select=id,lead_id,due_at,channel,message_draft,status,approved_by,approved_at,sent_at,created_at&order=due_at.asc&limit=300"),
    rest(s,"proposals?select=id,lead_id,title,scope,price_min,price_max,currency,status,approved_by,approved_at,created_at&order=created_at.desc&limit=200"),
    rest(s,"conversations?select=id,lead_id,channel,summary,transcript,created_at&order=created_at.desc&limit=200"),
    rest(s,"agent_insights?select=id,insight_type,segment,observation,evidence_count,confidence,status,reviewed_by,reviewed_at,created_at&order=created_at.desc&limit=200")
   ]);
   return json(res,200,{leads,activities,followups,proposals,conversations,insights});
  }
  const b=parseBody(req),kind=clean(b.kind,30);
  if(req.method==="POST"){
   if(kind==="insights"){
    const rows=await rest(s,"leads?select=status,lead_score,industry,city,need,budget_range,timeline&limit=500");
    if(!Array.isArray(rows)||!rows.length)return json(res,400,{error:"Add a few leads before generating sales insights."});
    const total=rows.length,hot=rows.filter(x=>["qualified","proposal","negotiation"].includes(x.status));
    const low=rows.filter(x=>Number(x.lead_score||0)<50),scores=rows.map(x=>Number(x.lead_score||0));
    const average=Math.round(scores.reduce((a,v)=>a+v,0)/Math.max(1,scores.length));
    const sectors={};for(const row of rows){const sector=clean(row.industry,80);if(sector)sectors[sector]=(sectors[sector]||0)+1}
    const topSector=Object.entries(sectors).sort((a,b)=>b[1]-a[1])[0];
    const insights=[
     {insight_type:"pipeline_attention",segment:"Qualified pipeline",observation:hot.length+" of "+total+" recorded leads are in qualified, proposal or negotiation stages. Review these active opportunities and record a dated next step before increasing top-of-funnel activity.",evidence_count:total,confidence:0.85},
     {insight_type:"qualification_quality",segment:"Lead completeness",observation:low.length+" of "+total+" leads have a completeness score below 50/100; the average completeness score is "+average+"/100. Ask one focused follow-up question to capture missing budget, timeline or requirement details.",evidence_count:total,confidence:0.9}
    ];
    if(topSector)insights.push({insight_type:"sector_signal",segment:topSector[0],observation:topSector[0]+" is the most represented industry in the current lead set ("+topSector[1]+" of "+total+"). Consider testing a sector-specific landing message, then compare qualified-lead rates before changing the sales playbook.",evidence_count:topSector[1],confidence:Math.min(0.95,0.55+topSector[1]/Math.max(1,total)*0.4)});
    const saved=[];for(const insight of insights){const row=await rest(s,"agent_insights",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({...insight,status:"proposed"})});if(Array.isArray(row)&&row[0])saved.push(row[0])}
    await rest(s,"agent_runs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({run_type:"sales_insights",status:"succeeded",input_summary:"Aggregate analysis of "+total+" leads; no names or contact details used.",output_summary:"Generated "+saved.length+" reviewable insights." ,started_at:new Date().toISOString(),finished_at:new Date().toISOString()})});
    return json(res,201,{insights:saved,message:"Insights generated for human review. Nothing changes in the assistant until you approve an insight."});
   }
   const leadId=clean(b.lead_id,36);if(!/^[0-9a-f-]{36}$/i.test(leadId))return json(res,400,{error:"A valid lead is required."});
   if(kind==="activity"){
    const content=clean(b.content,4000),type=clean(b.activity_type,30)||"note";
    if(!content||!["note","call","email","whatsapp","meeting"].includes(type))return json(res,400,{error:"Enter a note or valid activity."});
    const row=await rest(s,"lead_activities",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,activity_type:type,direction:b.direction==="inbound"||b.direction==="outbound"?b.direction:null,content,actor_id:s.user.id})});
    if(["call","email","whatsapp","meeting"].includes(type)) await rest(s,"leads?id=eq."+encodeURIComponent(leadId),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_contact_at:new Date().toISOString()})});
    return json(res,201,{item:Array.isArray(row)?row[0]:row});
   }
   if(kind==="followup"){
    const due=new Date(b.due_at);const channel=CHANNELS.has(b.channel)?b.channel:"internal";
    if(!Number.isFinite(due.getTime())||due.getTime()<Date.now()-60000)return json(res,400,{error:"Choose a valid future follow-up date and time."});
    const row=await rest(s,"followup_tasks",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,due_at:due.toISOString(),channel,message_draft:clean(b.message_draft,2000)||null,status:"pending"})});
    return json(res,201,{item:Array.isArray(row)?row[0]:row});
   }
   if(kind==="proposal_generate"){
    const leads=await rest(s,"leads?id=eq."+encodeURIComponent(leadId)+"&select=id,name,company,industry,city,need,budget_range,timeline,status,lead_score");
    if(!Array.isArray(leads)||!leads.length)return json(res,404,{error:"Lead not found."});
    const lead=leads[0];
    const missing=[];
    if(!lead.need)missing.push("Confirm the exact requirement and desired outcome.");
    if(!lead.budget_range)missing.push("Confirm the approved budget range.");
    if(!lead.timeline)missing.push("Confirm the expected start date and delivery window.");
    if(!lead.company)missing.push("Confirm the business or organisation name.");
    const title=(lead.need?clean(lead.need,100):"Digital solution")+" — proposal draft";
    const scope={
     description:"Prepared from the lead record for internal ATSFy review. This is a working scope outline, not an AI-verified specification.\n\nClient: "+(lead.company||lead.name)+"\nIndustry: "+(lead.industry||"To confirm")+"\nLocation: "+(lead.city||"To confirm")+"\nRequirement: "+(lead.need||"Not yet captured")+"\nBudget shared: "+(lead.budget_range||"Not provided")+"\nTimeline shared: "+(lead.timeline||"Not provided"),
     deliverables:["Discovery and requirement confirmation","Finalised scope and deliverables after review","Implementation plan and milestones to be confirmed","Testing, handover and support terms to be confirmed"],
     assumptions:["No integrations, platforms or third-party costs are assumed until verified.","Delivery dates and technical feasibility require ATSFy review."],
     missing_information:missing,
     terms:"INTERNAL DRAFT ONLY. No price, discount, delivery commitment or customer offer has been approved. ATSFy must verify scope, feasibility, taxes, payment milestones and support terms before sharing."
    };
    const row=await rest(s,"proposals",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,title,scope,price_min:null,price_max:null,currency:"INR",status:"draft"})});
    const proposal=Array.isArray(row)?row[0]:null;
    if(!proposal?.id)return json(res,502,{error:"Proposal draft could not be confirmed as saved."});
    await rest(s,"lead_activities",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({lead_id:leadId,activity_type:"proposal",content:"A structured proposal outline was generated from the current CRM record. Pricing and commitments remain blank pending ATSFy review.",actor_id:s.user.id})});
    await rest(s,"agent_runs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({run_type:"proposal_draft",status:"succeeded",input_summary:"Prepared an internal proposal outline for one lead using CRM fields only.",output_summary:"Saved draft "+proposal.id+" with "+missing.length+" missing-information prompts.",started_at:new Date().toISOString(),finished_at:new Date().toISOString()})});
    return json(res,201,{item:proposal,message:"Proposal outline saved for ATSFy review. Pricing and commitments were intentionally left blank."});
   }
   if(kind==="proposal"){
    const title=clean(b.title,180);const min=b.price_min===""||b.price_min==null?null:Number(b.price_min),max=b.price_max===""||b.price_max==null?null:Number(b.price_max);
    if(!title||((min!==null&&(!Number.isFinite(min)||min<=0))||(max!==null&&(!Number.isFinite(max)||max<=0)))||(min!==null&&max!==null&&max<min)||(min===null)!==(max===null))return json(res,400,{error:"Enter a title and a complete positive INR price range, or leave both prices blank."});
    let pricing=null;
    if(min!==null){
     const offer=catalogueOffers(catalogue).find(x=>x.kind===b.catalogue_kind&&x.item_key===b.catalogue_key&&x.offer_tier===b.offer_tier);
     if(!offer)return json(res,400,{error:"A priced proposal must be linked to a fixed-price catalogue tier. Select the offer from Pricing catalogue first."});
     if(offer.list_price==null)return json(res,400,{error:"Custom-quote offers require separate founder review and cannot be priced through the standard proposal form."});
     const rules=await rest(s,"pricing_rules?item_kind=eq."+encodeURIComponent(offer.kind)+"&item_key=eq."+encodeURIComponent(offer.item_key)+"&offer_tier=eq."+encodeURIComponent(offer.offer_tier)+"&select=minimum_sell_price,max_discount_percent");
     const rule=Array.isArray(rules)&&rules[0]?rules[0]:null;
     const permissions=s.user.app_metadata?.permissions||[];
     const isFounder=s.user.app_metadata?.role==="founder"||permissions.includes("pricing_override");
     const overrideReason=clean(b.founder_override_reason,500);
     try{pricing=validateQuote({offer,rule,priceMin:min,priceMax:max,founderOverride:isFounder&&Boolean(overrideReason)})}catch(error){return json(res,409,{error:error.message})}
     if(pricing.founder_override&&!overrideReason)return json(res,403,{error:"A founder override requires a written reason."});
     if(pricing.founder_override){
      await rest(s,"pricing_rule_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
       rule_id:rule?.id||null,item_kind:offer.kind,item_key:offer.item_key,offer_tier:offer.offer_tier,
       action:"founder_override",previous_values:rule||null,
       new_values:{proposal_price_min:min,proposal_price_max:max,discount_percent:pricing.discount_percent,reason:overrideReason},
       actor_id:s.user.id
      })});
     }
    }
    const scope={description:clean(b.scope,4000),deliverables:Array.isArray(b.deliverables)?b.deliverables.map(x=>clean(x,180)).filter(Boolean).slice(0,20):[],pricing:pricing?{catalogue_kind:b.catalogue_kind,catalogue_key:b.catalogue_key,offer_tier:b.offer_tier,...pricing}:null,terms:"Draft only. Subject to ATSFy review and confirmation. No discount below the protected minimum sell price is permitted."};
    const row=await rest(s,"proposals",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({lead_id:leadId,title,scope,price_min:min,price_max:max,currency:"INR",status:"draft"})});
    return json(res,201,{item:Array.isArray(row)?row[0]:row});
   }
   return json(res,400,{error:"Unsupported workspace action."});
  }
  const id=clean(b.id,36);if(!/^[0-9a-f-]{36}$/i.test(id))return json(res,400,{error:"A valid record ID is required."});
  if(kind==="lead"){
   const current=await rest(s,"leads?id=eq."+encodeURIComponent(id)+"&select=status");
   if(!Array.isArray(current)||!current.length)return json(res,404,{error:"Lead not found."});
   const previousStatus=current[0].status;
   const patch={};if(typeof b.status==="string"&&STATUSES.has(b.status))patch.status=b.status;
   if(typeof b.notes==="string")patch.notes=clean(b.notes,5000)||null;
   if(b.next_follow_up_at===null)patch.next_follow_up_at=null;else if(typeof b.next_follow_up_at==="string"&&Number.isFinite(new Date(b.next_follow_up_at).getTime()))patch.next_follow_up_at=new Date(b.next_follow_up_at).toISOString();
   if(!Object.keys(patch).length)return json(res,400,{error:"No valid lead changes supplied."});
   await rest(s,"leads?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
   if(patch.status&&patch.status!==previousStatus) await rest(s,"lead_activities",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({lead_id:id,activity_type:"stage_change",content:"Stage changed from "+previousStatus.replaceAll("_"," ")+" to "+patch.status.replaceAll("_"," ")+".",actor_id:s.user.id})});
   return json(res,200,{ok:true});
  }
  if(kind==="insight"){
   if(!["approved","rejected"].includes(b.status))return json(res,400,{error:"Choose approve or reject."});
   await rest(s,"agent_insights?id=eq."+encodeURIComponent(id)+"&status=eq.proposed",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:b.status,reviewed_by:s.user.id,reviewed_at:new Date().toISOString()})});
   return json(res,200,{ok:true});
  }
  if(kind==="followup"){
   if(!["approved","cancelled"].includes(b.status))return json(res,400,{error:"Follow-ups can only be approved or cancelled here."});
   await rest(s,"followup_tasks?id=eq."+encodeURIComponent(id)+"&status=eq.pending",{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:b.status,approved_by:b.status==="approved"?s.user.id:null,approved_at:b.status==="approved"?new Date().toISOString():null})});
   return json(res,200,{ok:true});
  }
  if(kind==="proposal"){
   const allowed=["approved","rejected","sent","accepted"];
   if(!allowed.includes(b.status))return json(res,400,{error:"Invalid proposal lifecycle action."});
   const rows=await rest(s,"proposals?id=eq."+encodeURIComponent(id)+"&select=id,lead_id,status");
   if(!Array.isArray(rows)||!rows.length)return json(res,404,{error:"Proposal not found."});
   const proposal=rows[0],from=proposal.status;
   const transitions={draft:["approved","rejected"],pending_approval:["approved","rejected"],approved:["sent","rejected"],sent:["accepted","rejected"]};
   if(!(transitions[from]||[]).includes(b.status))return json(res,409,{error:"This proposal cannot move from "+from+" to "+b.status+"."});
   const patch={status:b.status};
   if(b.status==="approved"){patch.approved_by=s.user.id;patch.approved_at=new Date().toISOString();}
   const changed=await rest(s,"proposals?id=eq."+encodeURIComponent(id)+"&status=eq."+encodeURIComponent(from),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(patch)});
   if(!Array.isArray(changed)||changed.length!==1)return json(res,409,{error:"The proposal changed in another session. Refresh the CRM and try again."});
   if(b.status==="accepted"){
    const won=await rest(s,"leads?id=eq."+encodeURIComponent(proposal.lead_id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({status:"won"})});
    if(!Array.isArray(won)||won.length!==1)return json(res,500,{error:"Proposal was accepted, but the lead stage could not be confirmed. Please reconcile this record in the CRM."});
   }
   await rest(s,"lead_activities",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({lead_id:proposal.lead_id,activity_type:"proposal",content:"Proposal status changed from "+from+" to "+b.status+" by an administrator. "+(b.status==="accepted"?"Lead moved to won; record the commercial value separately.":"No customer message was sent automatically."),actor_id:s.user.id})});
   return json(res,200,{ok:true,status:b.status});
  }
  return json(res,400,{error:"Unsupported workspace action."});
 }catch(error){console.error("Workspace API error:",error?.status||error?.name||"Error");return json(res,error?.status===400?400:500,{error:"The CRM workspace could not complete that request. Please refresh and try again."})}
};

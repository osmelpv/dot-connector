// Pure, non-operative planning core. No filesystem, subprocess, network or authority.
import {z} from 'zod';
import {createHash} from 'node:crypto';
import path from 'node:path';
const label=z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const safePath=z.string().min(1).max(512).refine(s=>!/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(s));
const permissions=z.object({read_files:z.boolean().default(false),modify_files:z.boolean().default(false),execute:z.boolean().default(false),read_output:z.boolean().default(false)}).strict().default({});
const folder=z.object({platform:z.enum(['linux','windows']),path:safePath}).strict().refine(f=>{
 const api=f.platform==='windows'?path.win32:path.posix;
 return api.isAbsolute(f.path)&&api.normalize(f.path)===f.path&&(f.platform!=='windows'||/^[A-Za-z]:\\/.test(f.path));
});
export const profileFolderSchema = folder;
function folderKey(f){const api=f.platform==='windows'?path.win32:path.posix;let value=f.path;const root=api.parse(value).root;while(value.length>root.length&&value.endsWith(api.sep))value=value.slice(0,-1);return f.platform+':'+(f.platform==='windows'?value.toLowerCase():value);}
const profile=z.object({profileId:label,mode:z.enum(['Personal','Proyecto','Consulta']),folder,destination:z.object({kind:z.enum(['local','remote']),id:label}).strict(),permissions}).strict();
export const requestSchema=z.object({schemaVersion:z.literal(1),machineId:label,profiles:z.array(profile).min(1).max(8)}).strict().refine(r=>new Set(r.profiles.map(p=>p.profileId)).size===r.profiles.length&&new Set(r.profiles.map(p=>folderKey(p.folder))).size===r.profiles.length);
const assessed=z.object({profileId:label,namespace:z.string(),available:z.boolean(),folderVerified:z.boolean(),terminalInput:z.boolean(),isolation:z.object({required:z.boolean(),state:z.enum(['unavailable','not_required','verified']),backend:z.string().nullable()}).strict(),desiredInitial:z.object({process:z.literal('stopped'),connection:z.literal('disconnected')}).strict(),blockers:z.array(z.string())}).strict();
export const planSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('configuration-plan'),intent:requestSchema,assessment:z.object({profiles:z.array(assessed),blockers:z.array(z.string()),pendingActions:z.array(z.object({profileId:label,action:z.enum(['configure_profile','read_files','modify_files','execute','read_output','select_destination','verify_isolation']),approval:z.literal('pending')}).strict())}).strict(),approval:z.literal('pending'),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const digest=body=>createHash('sha256').update(canonical(body)).digest('hex');
function request(value){const result=requestSchema.safeParse(value);if(!result.success)throw Error('CONFIGURATOR_INVALID_REQUEST');
 for(const p of result.data.profiles)if(p.mode==='Consulta'&&(p.permissions.execute||p.permissions.modify_files))throw Error('QUERY_CAPABILITY_FORBIDDEN');
 return result.data;
}
function build(intent){
 const profiles=intent.profiles.map(p=>({profileId:p.profileId,namespace:intent.machineId+'/'+p.profileId,available:false,folderVerified:false,terminalInput:false,
  isolation:{required:p.mode==='Proyecto',state:p.mode==='Proyecto'?'unavailable':'not_required',backend:null},desiredInitial:{process:'stopped',connection:'disconnected'},
  blockers:['runtime_backend_unavailable',...(p.mode==='Proyecto'?['isolation_unavailable']:[]),...(p.mode==='Consulta'?['structured_query_backend_unavailable']:[]),...(p.destination.kind==='remote'?['destination_not_connected']:[])]}));
 const pendingActions=[];for(const p of intent.profiles){for(const action of ['configure_profile',...Object.keys(p.permissions).filter(k=>p.permissions[k]),...(p.destination.kind==='remote'?['select_destination']:[]),...(p.mode==='Proyecto'?['verify_isolation']:[])])pendingActions.push({profileId:p.profileId,action,approval:'pending'});}
 return {schemaVersion:1,kind:'configuration-plan',intent,assessment:{profiles,blockers:['apply_not_implemented','approval_channel_unavailable'],pendingActions},approval:'pending'};
}
export function createPlan(value){const body=build(request(value));return {...body,digest:digest(body)};}
export function validatePlan(value){
 const result=planSchema.safeParse(value);if(!result.success)throw Error('PLAN_INVALID_SCHEMA');
 if(canonical(value)!==canonical(result.data))throw Error('PLAN_CHANGED');
 const {digest:actual,...body}=result.data;if(digest(body)!==actual)throw Error('PLAN_CHANGED');
 if(canonical(build(request(body.intent)))!==canonical(body))throw Error('PLAN_POLICY_MISMATCH');
 return {valid:true,executable:false,approved:false,digest:actual,blockers:body.assessment.blockers};
}
export function reviewPlan(value){validatePlan(value);const lines=['CONFIGURATION PLAN — REVIEW ONLY',`SHA-256: ${value.digest}`,`Machine: ${value.intent.machineId}`,'Approval: pending; channel unavailable. Nothing is applied.'];
 for(const [i,p] of value.intent.profiles.entries()){const a=value.assessment.profiles[i];lines.push(`Profile ${p.profileId} (${p.mode}) — namespace ${a.namespace}`,`Folder (unverified): ${JSON.stringify(p.folder.path)} [${p.folder.platform}]`,`Destination (logical alias only): ${p.destination.kind}/${p.destination.id}`,`Requested capabilities: ${Object.entries(p.permissions).map(([k,v])=>k+'='+v).join(', ')}`,`Isolation: ${a.isolation.state}; required=${a.isolation.required}; available=false; terminalInput=false`,`Desired only: stopped/disconnected. Observed runtime: unknown.`,`Blockers: ${a.blockers.join(', ')}`);}
 lines.push('Pending approval actions:');for(const a of value.assessment.pendingActions)lines.push(`${a.profileId}: ${a.action} [pending]`);
 lines.push('No approval is accepted through stdin, flags or this digest.');return {digest:value.digest,text:lines.join('\n'),plan:value};
}
export function detectConfigurator(){return {scope:'planner_capabilities_only',platform:process.platform,commands:['detect','plan','validate','review','status','wizard','profiles.list','profiles.duplicate'],isolationBackend:null,approvalChannel:null,runtimeProbePerformed:false,filesystemProbePerformed:false,applyAvailable:false,credentialInputAccepted:false};}
export function statusPlan(plan){if(plan)validatePlan(plan);return {scope:'plan_only_not_runtime',configuration:plan?'draft':'not_loaded',approval:plan?'pending':'none',digest:plan?.digest??null,process:'unknown',connection:'unknown',evidence:'none',isolation:plan?.assessment.profiles.map(p=>({profileId:p.profileId,...p.isolation}))??[],executable:false};}
export function parsePlannerJson(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>32768)throw Error('CONFIGURATOR_INPUT_LIMIT');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('CONFIGURATOR_INVALID_JSON');}
 try{
  // Detect duplicate decoded keys before handing the bounded document to JSON.parse.
  const stack=[];for(const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]/g)){
   const t=token[0];if(t==='{'||t==='['){stack.push({object:t==='{',key:t==='{',keys:new Set()});if(stack.length>16)throw Error();}
   else if(t==='}'||t===']')stack.pop();
   else if(t===','){const top=stack.at(-1);if(top?.object)top.key=true;}
   else if(t===':'){const top=stack.at(-1);if(top?.object)top.key=false;}
   else{const top=stack.at(-1);if(top?.object&&top.key){const key=JSON.parse(t);if(top.keys.has(key)||['__proto__','constructor','prototype'].includes(key))throw Error();top.keys.add(key);top.key=false;}}
  }
  return JSON.parse(text);
 }catch{throw Error('CONFIGURATOR_INVALID_JSON');}
}

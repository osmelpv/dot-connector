// Interactive presentation only. The shared planner owns every policy decision.
import {listProfiles, duplicateProfile} from './profile-plans.mjs';
import {createInterface} from 'node:readline/promises';
import {createPlan,validatePlan,reviewPlan,detectConfigurator,statusPlan} from './configurator.mjs';

// Folder hints classify a rejected answer without echoing it. The example is
// chosen from fixed candidates so it never collides with declared folders.
function folderGuide(machineId, platform, declared) {
  const ids = new Set(declared.map(profile => profile.profileId));
  let probeId = 'folder_probe';
  while (ids.has(probeId)) probeId += '_';
  const probe = path => ({profileId: probeId, mode: 'Personal', folder: {platform, path}, destination: {kind: 'local', id: 'local-preview'}, permissions: {}});
  const fits = (path, others) => {
    try { createPlan({schemaVersion: 1, machineId, profiles: [...others, probe(path)]}); return true; } catch { return false; }
  };
  const base = platform === 'windows' ? 'C:\\Projects\\Example' : '/projects/example';
  const candidates = [base, ...Array.from({length: 8}, (_, i) => `${base}-${i + 2}`)];
  const sample = candidates.find(candidate => fits(candidate, declared)) ?? candidates.at(-1);
  const name = platform === 'windows' ? 'Windows' : 'Linux';
  let duplicate = false;
  const hint = () => duplicate
    ? `That folder is already declared in this draft. Use a different normalized absolute ${name} path, for example ${sample}. The folder is not inspected.`
    : `Use a normalized absolute ${name} path, for example ${sample}; no .. segments. The folder is not inspected.`;
  // question() resets before every attempt, so an answer rejected before
  // classification (control or bidi characters) never inherits a stale result.
  hint.reset = () => { duplicate = false; };
  return {classify(path) { duplicate = fits(path, []) && !fits(path, declared); }, hint};
}

export async function runWizard({ask,write,plan:existingPlan}) {
  if(existingPlan !== undefined)validatePlan(existingPlan);
  const question=async (prompt,valid,hint="Choose one of the options shown in this prompt.")=>{
    for(let attempt=0;attempt<3;attempt++){
      hint.reset?.();
      const raw=await ask(prompt+' (:cancel to cancel): ');
      if(raw===null||raw===undefined||(typeof raw==='string'&&raw.trim()===':cancel'))throw Error('CONFIGURATOR_CANCELLED');
      if(typeof raw!=='string'||Buffer.byteLength(raw)>1024)throw Error('CONFIGURATOR_INPUT_LIMIT');
      const answer=raw.trim();
      if(!/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(raw)&&valid(answer))return answer;
      write('Invalid answer. '+(typeof hint==='function'?hint():hint));
    }
    throw Error('CONFIGURATOR_INVALID_ANSWER');
  };
  const detected=detectConfigurator();
  if(detected.applyAvailable||detected.credentialInputAccepted)throw Error('CONFIGURATOR_POLICY_CHANGED');
  write('Configuration draft only. No OS isolation or access activation is available.');
  write('Implemented: detect, plan, validate, review, status and draft export. Unavailable: apply, remote connection, permission grants and OS isolation. Do not enter secrets.');
  write('Personal, Proyecto and Consulta are draft-only modes. None creates a connection or grants access.');
  if(existingPlan !== undefined)return editProfilePlan(existingPlan,question,write);
  const label=s=>/^[A-Za-z0-9_-]{1,64}$/.test(s);
  const machineId=await question('Machine label (letters, digits, _ or -; no discovery)',label,'Use 1-64 letters, digits, _ or -; for example local.');
  const profiles=[];
  do {
    const profileId=await question('Profile name (unique label)',s=>label(s)&&!profiles.some(p=>p.profileId===s),'Use a unique name with 1-64 letters, digits, _ or -; for example review.');
    const mode={'1':'Personal','2':'Proyecto','3':'Consulta'}[await question('Mode: 1 Personal; 2 Proyecto (isolation unavailable); 3 Consulta (query backend unavailable)',s=>['1','2','3'].includes(s))];
    const platform=await question('Project folder platform: linux or windows',s=>['linux','windows'].includes(s));
    const base={profileId,mode,destination:{kind:'local',id:'local-preview'},permissions:{}};
    const guide=folderGuide(machineId,platform,profiles);
    const folderPath=await question('Project folder: normalized absolute path; not inspected',s=>{
      try{createPlan({schemaVersion:1,machineId,profiles:[...profiles,{...base,folder:{platform,path:s}}]});return true;}catch{guide.classify(s);return false;}
    },guide.hint);
    const privacy=await question('Privacy intent: 1 no capabilities requested; 2 local read-only files/output requested (not granted). Remote sharing unavailable',s=>['1','2'].includes(s));
    profiles.push({...base,folder:{platform,path:folderPath},permissions:privacy==='2'?{read_files:true,read_output:true}:{}});
    if(profiles.length===8){write('Maximum eight profiles reached; review follows.');break;}
    if(await question('Add another profile? yes or no',s=>['yes','no'].includes(s))==='no')break;
  }while(true);
  const plan=createPlan({schemaVersion:1,machineId,profiles});
  return reviewAndExport(plan,question,write);
}

async function reviewAndExport(plan, question, write) {
  const validation = validatePlan(plan);
  const review = reviewPlan(plan);
  const status = statusPlan(plan);
  if (!validation.valid || validation.approved || validation.executable || status.executable) {
    throw Error('CONFIGURATOR_POLICY_CHANGED');
  }
  write(review.text);
  write('Privacy selections describe future intent only. No declared project files inspected, shared or changed. All profiles unavailable; approval pending; actual runtime unknown.');
  await question('Type EXPORT to return this validated draft, or :cancel. EXPORT is not approval', answer => answer === 'EXPORT', 'Type EXPORT exactly to return the draft, or :cancel to leave.');
  write('Plan generated; no connection created. JSON is on stdout. Review the saved draft with node scripts/configure.mjs review --file /absolute/draft.json --human; see docs/USER-QUICKSTART.md for saving without overwriting.');
  return plan;
}

async function editProfilePlan(original, question, write) {
  let draft = structuredClone(original);
  for (;;) {
    const listing = listProfiles(draft);
    write('Draft profiles — no active permissions or connections:');
    for (const profile of listing.profiles) {
      write(profile.profileId + ' (' + profile.mode + ') — folder ' + JSON.stringify(profile.folder.path) + ' [' + profile.folder.platform + '], unverified; unavailable');
    }
    const full = listing.profiles.length >= 8;
    if (full) write('Maximum eight profiles reached. Duplication unavailable; export or cancel.');
    // Case-insensitive menu choice; the final EXPORT confirmation stays exact.
    const action = (await question('Action: duplicate or export', answer => answer.toLowerCase() === 'export' || (!full && answer.toLowerCase() === 'duplicate'))).toLowerCase();
    if (action === 'export') return reviewAndExport(draft, question, write);

    const from = await question('Source profile ID', answer => listing.profiles.some(profile => profile.profileId === answer), 'Choose a source profile ID from the displayed list.');
    const name = await question('New profile name (unique label)', answer => /^[A-Za-z0-9_-]{1,64}$/.test(answer) && !listing.profiles.some(profile => profile.profileId === answer), 'Use a unique name with 1-64 letters, digits, _ or -.');
    const platform = await question('New folder platform: linux or windows', answer => ['linux', 'windows'].includes(answer));
    let candidate;
    const guide = folderGuide(draft.intent.machineId, platform, draft.intent.profiles);
    await question('New normalized absolute folder, distinct from existing folders; not inspected', answer => {
      try {
        candidate = duplicateProfile(draft, {schemaVersion: 1, from, name, folder: {platform, path: answer}});
        return true;
      } catch { guide.classify(answer); return false; }
    }, guide.hint);
    draft = candidate;
    write('Draft copy prepared. Capabilities reset to false; destination reset to local/local-preview. No permissions granted. Nothing saved.');
  }
}

export async function interactiveWizard(input=process.stdin,output=process.stderr,existingPlan=undefined) {
  if(!input.isTTY||!output.isTTY)throw Error('CONFIGURATOR_TTY_REQUIRED');
  const abort=new AbortController();let failure=null,total=0;
  const watched=['data','keypress','newListener'];
  const previous=new Map(watched.map(name=>[name,new Set(input.listeners(name))]));
  const rl=createInterface({input,output,terminal:true,historySize:0});
  // readline's emitKeypressEvents helper can retain its data listener after close.
  // Reclaim only listeners this private interface installed, never caller listeners.
  const installed=watched.flatMap(name=>input.listeners(name).filter(fn=>!previous.get(name).has(fn)).map(fn=>[name,fn]));
  const cancel=()=>{failure??=Error('CONFIGURATOR_CANCELLED');abort.abort();rl.close();};
  const bound=chunk=>{total+=Buffer.byteLength(chunk);if(total>32768){failure=Error('CONFIGURATOR_INPUT_LIMIT');cancel();}};
  const error=()=>{failure=Error('CONFIGURATOR_IO_FAILED');cancel();};
  rl.on('SIGINT',cancel);rl.on('close',cancel);input.prependListener('data',bound);input.on('error',error);
  try {
    return await runWizard({plan:existingPlan,ask:async prompt=>{
      if(failure)throw failure;
      try{return await rl.question(prompt,{signal:abort.signal});}catch{throw failure??Error('CONFIGURATOR_CANCELLED');}
    },write:text=>output.write(text+'\n')});
  }finally{rl.removeListener('SIGINT',cancel);rl.removeListener('close',cancel);input.removeListener('data',bound);input.removeListener('error',error);rl.close();for(const [name,fn] of installed)input.removeListener(name,fn);}
}

import path from 'node:path';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {spawn} from 'node:child_process';
import {nativeTargetSchema,normalizeUtf16} from './native-reader.mjs';
export async function humanCommand(action,options){
 if(process.platform!=='win32'||!process.stdin.isTTY)throw Error('HUMAN_WINDOWS_TERMINAL_REQUIRED');
 const root=options['--native-root'];if(!root||!path.isAbsolute(root))throw Error('EXPLICIT_NATIVE_ROOT_REQUIRED');
 if(action==='select'){
  const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(root,'manual-native-mcp.mjs'),'--select-only'],{stdio:['inherit',process.stderr,process.stderr],windowsHide:true,shell:false});p.once('error',reject);p.once('close',resolve);});
  if(code!==0)throw Error('HUMAN_SELECTION_REFUSED');
  return {selected:true,target:nativeTargetSchema.parse(JSON.parse(await readFile(path.join(root,'target.json'),'utf8')))};
 }
 const operationId=options['--operation'],kind=options['--kind'],text=options['--text'];
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(operationId??'')||!['paste','submit'].includes(kind)||typeof text!=='string'||!text.length||text.length>256||/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(text))throw Error('INVALID_HUMAN_OPERATION');
 normalizeUtf16(text);
 const target=nativeTargetSchema.parse(JSON.parse(await readFile(path.join(root,'target.json'),'utf8')));await access(path.join(root,'server.lock'));
 const prompt=createInterface({input:process.stdin,output:process.stderr});
 try{
  process.stderr.write(JSON.stringify({target,operationId,kind,text})+'\n');
  if(await prompt.question(`Type ARM ${kind.toUpperCase()} for exactly this operation: `)!==`ARM ${kind.toUpperCase()}`)throw Error('NOT_ARMED');
  const expiresAtMs=Date.now()+15000;
  await writeFile(path.join(root,'control.json'),JSON.stringify({paused:false,operationId,kind,text,expiresAtMs}));
  return {authorized:true,operationId,kind,expiresAtMs,warning:'Focus the selected synthetic terminal. No input was sent; focus/send remains non-atomic.'};
 }finally{prompt.close();}
}

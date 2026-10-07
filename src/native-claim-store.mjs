import {mkdir,open,readFile,lstat,realpath,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
// Cooperative local-filesystem mutex. A crash/uncertain operation leaves its guard.
// No expiry, PID-based reclamation, retry loop, recursive removal or lock stealing.
export class AtomicClaimFile {
 constructor(file){if(!path.isAbsolute(file))throw Error('ABSOLUTE_CLAIM_REQUIRED');this.file=file;}
 async compareExchange(_key,expected,next){
  if(![expected,next].every(v=>v===null||(typeof v==='string'&&Buffer.byteLength(v)<=8192)))throw Error('CLAIM_LIMIT');
  if(expected!==null&&next!==null)throw Error('CLAIM_REPLACEMENT_FORBIDDEN');
  const dir=path.dirname(this.file);await mkdir(dir,{recursive:true});
  if((await lstat(dir)).isSymbolicLink()||(process.platform==='win32'?path.resolve(await realpath(dir)).toLowerCase():await realpath(dir))!==(process.platform==='win32'?path.resolve(dir).toLowerCase():path.resolve(dir)))throw Error('CLAIM_DIRECTORY_ALIAS');
  const guard=this.file+'.guard';await mkdir(guard); // EEXIST is a hard refusal.
  // Deliberately no finally cleanup on errors: a partial commit stays quarantined.
  let actual=null;
  try{const st=await lstat(this.file);if(!st.isFile()||st.isSymbolicLink()||st.size>8192||st.nlink!==1)throw Error('CLAIM_FILE_INVALID');actual=await readFile(this.file,'utf8');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(actual!==expected){await rmdir(guard);return false;}
  if(next===null){if(actual!==null)await unlink(this.file);}
  else{
   // Legacy clients use wx and ignore our guard. Publish with wx too:
   // never rename over a concurrently created legacy reservation.
   const handle=await open(this.file,'wx',0o600);
   try{await handle.writeFile(next);await handle.sync();}finally{await handle.close();}
  }
  await rmdir(guard);
  return true;
 }
}

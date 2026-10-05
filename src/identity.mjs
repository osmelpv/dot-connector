import {readFile} from 'node:fs/promises';
import path from 'node:path';
export function windowsEnv(values,base=process.env) {
  const names=new Set(Object.keys(values));
  const forwarded=(base.WSLENV??'').split(':').filter(v=>v&&!names.has(v.split('/')[0]));
  return {...base,...values,WSLENV:[...forwarded,...[...names].map(n=>n+'/w')].join(':')};
}
export function validateIdentity(s,actual,cliExe) {
  if(!Number.isInteger(s.guiPid)||s.guiPid<=0||!/^\d+$/.test(s.guiStartTicks??'')||!/^dot-connector-[a-f0-9-]{36}$/.test(s.className??''))throw Error('invalid GUI identity');
  for(const field of ['guiPid','guiStartTicks','guiExecutable','className','socketPath'])if(s[field]!==actual[field])throw Error('GUI identity changed: '+field);
  if(path.win32.basename(s.socketPath)!==`gui-sock-${s.guiPid}`||!path.win32.isAbsolute(s.socketPath))throw Error('socket does not belong to GUI PID');
  if(path.win32.basename(s.guiExecutable).toLowerCase()!=='wezterm-gui.exe')throw Error('unexpected GUI executable');
  if(path.win32.basename(cliExe).toLowerCase()!=='wezterm.exe')throw Error('unexpected CLI executable');
  const windowsCli=cliExe.replace(/^\/mnt\/([a-z])\//,(_,drive)=>drive.toUpperCase()+':/');
  if(path.win32.normalize(path.win32.dirname(windowsCli)).toLowerCase()!==path.win32.normalize(path.win32.dirname(s.guiExecutable)).toLowerCase())throw Error('CLI and GUI executable directories differ');
  if(!Number.isInteger(s.paneId)||s.paneId<0||!Number.isInteger(s.windowId)||s.windowId<0)throw Error('invalid pane identity');
}
export async function readGuiIdentity(s,invoke) {
  if(!Number.isInteger(s.guiPid)||s.guiPid<=0)throw Error('invalid GUI PID');
  const script=await readFile(new URL('../scripts/read-gui-identity.ps1',import.meta.url),'utf8');
  const exe=process.env.DOT_POWERSHELL??(process.platform==='win32'?'powershell.exe':'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=await invoke(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],'',windowsEnv({DOT_GUI_PID:String(s.guiPid)}));
  return JSON.parse(result.replace(/^\uFEFF/,''));
}

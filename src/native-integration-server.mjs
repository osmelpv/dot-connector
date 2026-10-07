import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {createNativeMcpServer} from './native-mcp-server.mjs';
// User-launched Windows-only experimental MCP route. Not imported by plugin-server.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {NativeWorkerSupervisor} from './native-supervisor.mjs';
import {NativeControl} from './native-control.mjs';
import {bindNativeLifecycle} from './native-lifecycle.mjs';
if(process.platform!=='win32'||!['--human-launched','--bridge-check'].includes(process.argv[2]))throw Error('Manual Windows launch required; no WSL or automatic fallback.');
const root=path.dirname(fileURLToPath(import.meta.url));
if(process.argv[2]==='--bridge-check'){
 const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 const check=new McpServer({name:'dot-windows-bridge-check',version});
 check.tool('terminal_status','Verify Windows stdio bridge without terminal access.',{},async()=>({content:[{type:'text',text:JSON.stringify({version,mode:'windows-bridge-check',platform:process.platform,node:process.version,target:null,nativeCalls:false,capabilities:{terminalRead:false,terminalInput:false}})}]}));
 await check.connect(new StdioServerTransport());
}else{
const target=JSON.parse(await readFile(path.join(root,'target.json'),'utf8'));
const provider=new NativeWorkerSupervisor({nativeHostPath:path.join(root,'DotConnector.NativeControl.exe'),hostMode:'read'});
const control=new NativeControl({target,provider,stateDir:root,claimsDir:path.join(homedir(),'.dot-connector','native-target-claims')});
const server=createNativeMcpServer(control),transport=new StdioServerTransport();
const lifecycle=bindNativeLifecycle({control,server,transport,input:process.stdin,signals:process,onFailure:()=>{process.exitCode=1;}});
try{await control.open();if(control.closing)throw Error('native startup cancelled');await server.connect(transport);}
catch{await lifecycle.shutdown();process.exitCode=1;}

}

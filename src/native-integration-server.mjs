import {createNativeMcpServer} from './native-mcp-server.mjs';
// User-launched Windows-only experimental MCP route. Not imported by plugin-server.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {NativeWorkerSupervisor} from './native-supervisor.mjs';
import {NativeControl} from './native-control.mjs';
if(process.platform!=='win32'||process.argv[2]!=='--human-launched')throw Error('Manual Windows launch required; no WSL or automatic fallback.');
const root=path.dirname(fileURLToPath(import.meta.url));
const target=JSON.parse(await readFile(path.join(root,'target.json'),'utf8'));
const provider=new NativeWorkerSupervisor({nativeHostPath:path.join(root,'DotConnector.NativeControl.exe'),hostMode:'read'});
const control=new NativeControl({target,provider,stateDir:root,claimsDir:path.join(homedir(),'.dot-connector','native-target-claims')});
await control.open();
const server=createNativeMcpServer(control);
await server.connect(new StdioServerTransport());

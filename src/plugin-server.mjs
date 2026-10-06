// Diagnostic-only plugin entrypoint. Never import the terminal or native workers here.
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {readFile} from 'node:fs/promises';
if (process.versions.node.split('.')[0] !== '22') throw Error('This WSL plugin release requires the existing Node 22 runtime.');
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const server=new McpServer({name:'dot-connector',version});
server.tool('terminal_status','Report installed version and unavailable terminal capabilities. Does not inspect a terminal or application.',{},async()=>({content:[{type:'text',text:JSON.stringify({version,mode:'installation-check',target:null,paused:true,capabilities:{terminalRead:false,terminalInput:false,nativeControl:false},reason:'Runtime/target integration is not enabled by plugin installation.',evidence:{nativeRead:'user-reported manual PASS',nativeWrite:'user-reported manual PASS without Enter',dotNativeRoundtrip:false}})}]}));
await server.connect(new StdioServerTransport());

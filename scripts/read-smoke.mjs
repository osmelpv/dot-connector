import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const client=new Client({name:'local-read-probe',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],env:{...process.env}}));
try {
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);};
  const status=await call('terminal_status');
  const snapshot=await call('terminal_snapshot',{paneId:status.paneId});
  console.log(JSON.stringify({transport:'real local MCP stdio via executor; not native cloud registration',paneId:snapshot.paneId,windowId:snapshot.windowId,text:snapshot.text,readOnly:true},null,2));
} finally {await client.close();}

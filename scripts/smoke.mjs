import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {randomUUID} from 'node:crypto';
const client=new Client({name:'local-smoke-not-dot',version:'0.1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:['src/server.mjs'],env:{...process.env}}));
try{
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);};
 const status=await call('terminal_status');const paneId=status.paneId;
 const snapshot=()=>call('terminal_snapshot',{paneId});
 let s=await snapshot();
 const input=async(kind,extra={})=>call('terminal_input',{paneId,snapshotId:s.snapshotId,operationId:randomUUID(),kind,...extra});
 await input('paste',{text:"printf 'DOT_CONNECTOR_ROUNDTRIP_OK\\n'"});
 s=await snapshot();await input('submit');
 let result;
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,200));result=await snapshot();if(result.text.split(/\r?\n/).some(l=>l.trim()==='DOT_CONNECTOR_ROUNDTRIP_OK'))break;}
 if(!result.text.split(/\r?\n/).some(l=>l.trim()==='DOT_CONNECTOR_ROUNDTRIP_OK'))throw Error('Marker not observed as output');
 console.log(JSON.stringify({transport:'real MCP stdio client, NOT dot registration',status,result},null,2));
}finally{await client.close();}

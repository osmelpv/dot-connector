#!/usr/bin/env node
// Explicit experimental entrypoint; installed plugin manifest remains diagnostic-only.
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {createSyntheticSession} from '../src/tmux-session.mjs';
import {SnapshotBridge,serveHumanView} from '../src/tmux-bridge.mjs';
import {BoundedMcpStdio} from '../src/bounded-mcp-stdio.mjs';
import {registerBridgeTools} from '../src/tmux-bridge-mcp.mjs';
import {readConfig,configProblem} from '../src/private-config.mjs';
import {publishInstance} from '../src/human-instances.mjs';
import {createBridgeRuntime} from '../src/bridge-runtime.mjs';

const args=process.argv.slice(2),orderedOutput=args.at(-1)==='--ordered-output-v2';if(orderedOutput)args.pop();
let [flag,machineId,projectId,...extra]=args;
let configFile;
if(flag==='--experimental-synthetic'&&machineId==='--config'&&projectId&&!extra.length){
 try{configFile=projectId;const config=await readConfig(configFile);machineId=config.machineId;projectId=config.projectId;}
 catch(e){console.error(JSON.stringify({ok:false,error:configProblem(e)}));process.exit(2);}
}
if(flag!=='--experimental-synthetic'||extra.length||!machineId||!projectId){
  console.error('Explicit opt-in required: --experimental-synthetic MACHINE_LABEL SYNTHETIC_PROJECT_LABEL');process.exitCode=2;
} else {
  const session=await createSyntheticSession({machineId,projectId,orderedOutput}),bridge=new SnapshotBridge(session);
  const transport=new BoundedMcpStdio(),server=new McpServer({name:'dot-snapshot-bridge-experimental',version:'0.1.0'});
  const {ready,close}=createBridgeRuntime({bridge,transport,server,serve:serveHumanView,publish:publishInstance,register:registerBridgeTools,configFile,
    onReady:local=>console.error(JSON.stringify({event:'ready',humanSocket:local.socketPath,binding:bridge.binding,paused:true,...(session.orderedOutput?{orderedOutput:session.orderedOutput.identity}:{})})),
    onCleanupError:()=>console.error('INSTANCE_CLEANUP_FAILED'),
    onClosed:result=>{console.error(JSON.stringify({event:'closed',result,retainedState:session.dir}));process.exitCode=result.verified?0:1;}});
  server.server.onclose=()=>{void close();};
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
  try {
    await ready;
  } catch {console.error('BRIDGE_START_FAILED');await close();process.exitCode=1;}
}

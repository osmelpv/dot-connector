#!/usr/bin/env node
// Explicit fixture-only HTML export: no process creation, PTY, input or network.
import {Readable} from 'node:stream';
import {OrderedOutputJournal,OrderedOutputReceiver} from '../src/ordered-output.mjs';
import {attachOrderedOutputSource} from '../src/ordered-output-source.mjs';
if(process.argv.length!==3||process.argv[2]!=='--fixtures-only'){
 console.error('Usage: node scripts/ordered-output-demo.mjs --fixtures-only > output-demo.html');process.exitCode=2;
}else{
 const identity={machineId:'fixture',projectId:'synthetic',incarnation:'demo-only',session:'memory',pane:'output',streamEpoch:'fixture-1'};
 const journal=new OrderedOutputJournal(identity),views=['human','agent'].map(label=>({label,client:journal.connect(label),receiver:new OrderedOutputReceiver(identity),frames:[]}));
 const bytes=Buffer.from('Fixture output only\r\nUTF-8: 🧪\nLiteral controls: \x1b[2J\x1b]52;c;YQ==\x07\nNo terminal replies or input.\n');
 const source=Readable.from(Array.from(bytes,b=>Buffer.from([b])),{objectMode:false});
 const adapter=attachOrderedOutputSource({source,journal,chunkBytes:1,onAvailable:()=>{for(const v of views){const frame=v.client.read(v.receiver.cursor());v.receiver.accept(frame);v.frames.push(frame);}}});
 if((await adapter.done).status!=='eof')throw Error('FIXTURE_SOURCE_FAILED');
 const payload=JSON.stringify(views.map(({label,frames})=>({label,frames}))).replaceAll('<','\\u003c');journal.close();
 const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Salida compartida — fixture literal</title>
<style>body{font:16px system-ui;background:#111827;color:#e5e7eb;margin:32px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{background:#1f2937;padding:20px;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:10px}small{color:#93c5fd}</style>
<h1>Dos vistas · mismo fixture</h1><p>Solo lectura literal. No es un emulador VT. No hay PTY activa, credenciales, red ni entrada.</p><button id="replay">Reproducir fixture</button><p id="status"></p><main><section><h2>Humano</h2><small id="human-meta"></small><pre id="human"></pre></section><section><h2>Agente</h2><small id="agent-meta"></small><pre id="agent"></pre></section></main>
<script type="application/json" id="fixture-data">${payload}</script>
<script>
const data=JSON.parse(document.getElementById('fixture-data').textContent);
function literal(text){return Array.from(text,c=>/[\\x00-\\x09\\x0b-\\x1f\\x7f-\\x9f\\u202a-\\u202e\\u2066-\\u2069]/.test(c)?'\\\\u'+c.codePointAt(0).toString(16).padStart(4,'0'):c).join('');}
function replay(){let outputs=[];for(const view of data){const decoder=new TextDecoder('utf-8'),parts=[];let offset=0,seq=0;for(const frame of view.frames){if(frame.seq!==seq+1||frame.start!==offset)throw Error('Fixture discontinuity');seq=frame.seq;offset=frame.end;if(frame.kind==='data')parts.push(decoder.decode(Uint8Array.from(atob(frame.data),c=>c.charCodeAt(0)),{stream:true}));}parts.push(decoder.decode());const text=literal(parts.join(''));outputs.push(text);document.getElementById(view.label).textContent=text;document.getElementById(view.label+'-meta').textContent='epoch '+view.frames[0].identity.streamEpoch+' · offset '+offset+' · EOF';}document.getElementById('status').textContent=outputs[0]===outputs[1]?'Verificado: las dos vistas reciben los mismos bytes.':'Error: vistas diferentes';}
document.getElementById('replay').addEventListener('click',replay);replay();
</script></html>`;
 process.stdout.write(html+'\n');
}

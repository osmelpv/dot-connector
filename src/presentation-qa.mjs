import {OutputPresentation} from './output-presentation.mjs';
export function presentationQaHtml(fixture){
 if(fixture.source!=='test-owned-pty'||JSON.stringify(fixture.geometry)!=='[80,24]'||fixture.views?.length!==2)throw Error('TEST_PTY_FIXTURE_REQUIRED');
 for(const [i,v] of fixture.views.entries()){
  if(v.label!==(i?'agent':'human')||!Array.isArray(v.frames)||v.frames.length<3||v.frames.length>1024)throw Error('TEST_PTY_FIXTURE_REQUIRED');
  const p=new OutputPresentation(v.frames[0].identity);for(const f of v.frames)p.accept(f);if(p.view().state!=='eof')throw Error('TEST_PTY_EOF_REQUIRED');
 }
 if(JSON.stringify(fixture.views[0].frames)!==JSON.stringify(fixture.views[1].frames))throw Error('TEST_PTY_VIEWS_DIFFER');
 const payload=JSON.stringify(fixture).replaceAll('<','\\u003c');if(payload.length>262144)throw Error('TEST_PTY_FIXTURE_LIMIT');
 return `<!doctype html><html lang="es"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>QA PTY sintética — transcripción limitada</title>
<style>body{font:16px system-ui;background:#111827;color:#e5e7eb;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}section{background:#1f2937;padding:20px;border-radius:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;min-height:140px}small{display:block;color:#93c5fd;overflow-wrap:anywhere}button{margin:4px;padding:10px}#notice{color:#fcd34d}</style>
<h1>Dos vistas de una PTY de prueba</h1><p>Transcripción filtrada; NO emulador VT. Grabación sintética, sin conexión viva. CSI/OSC/DCS descartados, sin clipboard, enlaces, títulos ni respuestas de entrada.</p>
<button id="replay">Releer desde inicio</button><button id="gap">Simular hueco en agente</button><button id="resize">Solicitar 120×40 (rechazado)</button><p id="notice"></p><main><section><h2>Humano</h2><small id="human-meta"></small><pre id="human"></pre></section><section><h2>Agente</h2><small id="agent-meta"></small><pre id="agent"></pre></section></main>
<script type="application/json" id="data">${payload}</script><script>
const OutputPresentation=${OutputPresentation.toString()};
const fixture=JSON.parse(document.getElementById('data').textContent);
const views=fixture.views.map(v=>({...v,p:new OutputPresentation(v.frames[0].identity)}));
function draw(v){const s=v.p.view();document.getElementById(v.label).textContent=s.text;document.getElementById(v.label+'-meta').textContent=s.state+' · offset '+s.offset+' · seq '+s.seq+' · 80×24 fijo · controles omitidos '+s.omittedControls+' · epoch '+s.identity.streamEpoch;}
function replay(){for(const v of views){v.p.resync();for(const f of v.frames)v.p.accept(f);draw(v);}document.getElementById('notice').textContent='Mismos frames, identidad y offsets. EOF verificado; no pantalla VT.';}
document.getElementById('replay').addEventListener('click',replay);
document.getElementById('gap').addEventListener('click',()=>{const v=views[1];v.p.resync();v.p.accept(v.frames[0]);try{v.p.accept(v.frames[2]);}catch{}draw(v);document.getElementById('notice').textContent='Hueco: vista del agente borrada. Releer desde inicio exige el prefijo completo.';});
document.getElementById('resize').addEventListener('click',()=>{try{views[0].p.resize(120,40);}catch{document.getElementById('notice').textContent='Resize deshabilitado. La PTY de prueba se verificó a 80×24; cambiar el ancho del navegador solo cambia el layout.';}});
replay();</script></html>`;
}

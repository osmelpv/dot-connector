import test from 'node:test';
import assert from 'node:assert/strict';
import xterm from '@xterm/xterm';
import {XtermObserver} from '../src/xterm-observer.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'pty',pane:'output',streamEpoch:'guard'},geometry={atSeq:0,atOffset:0,columns:80,rows:24};
test('capture guards cancel paste/mouse/keyboard/default actions before simulated renderer listeners',()=>{
 let fallthrough=0;class TestMountedTerminal extends xterm.Terminal{open(element){for(const type of XtermObserver.inputEvents)element.addEventListener(type,()=>{fallthrough++;});}}
 const v=new XtermObserver(TestMountedTerminal,identity,geometry),root=new EventTarget();try{v.open(root);for(const type of XtermObserver.inputEvents){const event=new Event(type,{cancelable:true});assert.equal(root.dispatchEvent(event),false);assert.equal(event.defaultPrevented,true);}assert.equal(fallthrough,0);assert.equal(v.status().blockedDomEvents,XtermObserver.inputEvents.length);assert.equal(v.status().forwardedInputBytes,0);}finally{v.close();}
 // Native EventTarget verifies listener ordering/cancellation, not actual browser gestures.
});

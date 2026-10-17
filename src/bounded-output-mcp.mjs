import {BoundedMcpStdio} from './bounded-mcp-stdio.mjs';
// Supplied streams only: never spawn, attach or own a remote process.
// Bounds incoming MCP response lines BEFORE JSON/schema validation.
export class BoundedOutputMcp extends BoundedMcpStdio {
 constructor(input,output){if(!input||!output)throw Error('OUTPUT_STREAMS_REQUIRED');super(input,output,{outputReader:true});}
}

import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const pack=JSON.parse(execFileSync(npm,['pack','--dry-run','--ignore-scripts','--json'],{encoding:'utf8'}))[0];
const allowed=/^(package\.json|\.codex-plugin\/plugin\.json|\.mcp\.json|\.agents\/plugins\/marketplace\.json|README\.md|src\/(?:[^/]+\.mjs|native-(?:uia-(?:provider|host)|control-host|manual-(?:probe|writer))\.cs)|profiles\/[^/]+\.json|scripts\/(?:[^/]+\.mjs|start-terminal\.ps1|read-gui-identity\.ps1)|test\/[^/]+\.test\.mjs|docs\/[^/]+\.md)$/;
const secrets=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{20,}/,/\bgithub_pat_[A-Za-z0-9_]{20,}/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/,/\bAKIA[A-Z0-9]{16}\b/];
let total=0;
for(const file of pack.files){if(!allowed.test(file.path))throw Error(`Not on package allowlist: ${file.path}`);if(file.size>100000)throw Error(`Unexpected large file: ${file.path}`);const data=await readFile(file.path,'utf8');if(secrets.some(r=>r.test(data)))throw Error(`Possible secret in ${file.path}`);if(/(?:\/home\/[a-z0-9_-]+\/projects\/|[A-Z]:\\Users\\[^\\]+\\|libfile_[a-f0-9]{20,}|https:\/\/\S+[?&]sig=)/.test(data))throw Error(`Local session data in ${file.path}`);total+=file.size;}
const pkg=JSON.parse(await readFile('package.json'));if(!pkg.private||pkg.license!=='UNLICENSED')throw Error('Keep npm publishing disabled and do not imply an open-source license');
console.log(JSON.stringify({name:pack.name,version:pack.version,files:pack.files.map(f=>f.path),unpackedBytes:total,secretScan:'heuristic only; review diff before push'},null,2));

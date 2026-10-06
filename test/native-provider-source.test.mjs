import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('native source audit guard: only reviewed read/query Win32 imports and no input or history fallback',async()=>{
  const source=await readFile(new URL('../src/native-uia-provider.cs',import.meta.url),'utf8');
  const imports=[...source.matchAll(/\[DllImport\("([^"]+)"[^\]]*\)\]\s*static extern \w+ (\w+)\(/g)].map(m=>`${m[1]}:${m[2]}`).sort();
  assert.deepEqual(imports,[
    'user32.dll:GetForegroundWindow','user32.dll:GetWindowThreadProcessId','user32.dll:IsWindowVisible','user32.dll:IsIconic','user32.dll:OpenInputDesktop','user32.dll:GetUserObjectInformation','user32.dll:CloseDesktop',
    'kernel32.dll:OpenProcess','kernel32.dll:CloseHandle','advapi32.dll:OpenProcessToken','advapi32.dll:GetTokenInformation','advapi32.dll:GetSidSubAuthorityCount','advapi32.dll:GetSidSubAuthority',
  ].sort());
  assert.equal((source.match(/DllImport/g)??[]).length,imports.length);
  assert.doesNotMatch(source,/\b(DocumentRange|SendInput|SetFocus|SetForegroundWindow|SetWindowsHookEx|SwitchDesktop|Clipboard|HttpClient|WebClient|Socket|Assembly\.Load|Process\.Start)\b/);
  assert.doesNotMatch(source,/\.GetText\(\s*-1\s*\)/);
  assert.match(source,/GetText\(remaining\)/);
  assert.match(source,/GetVisibleRanges\(\)/);
});

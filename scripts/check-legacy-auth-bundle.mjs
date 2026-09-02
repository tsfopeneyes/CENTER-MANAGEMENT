import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=resolve(root,process.argv[2]||'dist');
const rel=relative(root,output);
if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Build output must be a workspace subdirectory');
const assets=join(output,'assets');
const files=readdirSync(assets).filter(file=>file.endsWith('.js'));
assert.ok(files.length,'Build first');
const bundle=files.map(file=>readFileSync(join(assets,file),'utf8')).join('\n');
for(const marker of ['account-auth','VITE_ACCOUNT_AUTH_LOCAL_ENABLED','새 인증 서버는 아직 운영에 적용하지 않았습니다']) {
 assert.ok(!bundle.includes(marker),'Deferred authentication leaked into release: '+marker);
}
for(const marker of ['get_login_candidates','ensure-auth-link']) assert.ok(bundle.includes(marker),'Existing login path missing: '+marker);
console.log('PASS: existing login retained; deferred account-auth excluded from release.');

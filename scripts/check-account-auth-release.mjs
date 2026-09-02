import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

const assets=path.resolve('dist/assets');
const files=(await readdir(assets)).filter(name=>/\.js$/.test(name));
const source=(await Promise.all(files.map(name=>readFile(path.join(assets,name),'utf8')))).join('\n');
for(const required of ['/functions/v1/account-auth','session-status','password_change_required']){
    if(!source.includes(required))throw Error('Secure account release marker missing: '+required);
}
for(const forbidden of ['VITE_ACCOUNT_AUTH_LOCAL_ENABLED','새 인증 서버는 아직 운영에 적용하지 않았습니다']){
    if(source.includes(forbidden))throw Error('Deferred/development auth marker present');
}
console.log('PASS secure account release bundle: server routes present, deferred development path absent');

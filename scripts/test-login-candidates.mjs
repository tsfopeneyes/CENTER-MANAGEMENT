import assert from 'node:assert/strict';
import {createLoginCandidateService} from '../supabase/functions/_shared/loginCandidateService.mjs';
import {createLoginCandidateHandler} from '../supabase/functions/_shared/loginCandidateHandler.mjs';

const profileId=crypto.randomUUID();let quota=true;
const service=createLoginCandidateService({readiness:async()=>true,keyFor:async(kind,value)=>kind+':'+value,
    store:{async consumeLimit(){return quota;},async findCandidatesByName(key){assert.equal(key,'name:가상회원');return [{profileId,name:'가상회원',school:'가상고',userGroup:'청소년',password:'must-not-spread'}];}}});
let result=await service({protocol:1,name:' 가상회원 '},{clientKey:'trusted'});assert.deepEqual(result.candidates,[{profileId,name:'가상회원',school:'가상고',userGroup:'청소년'}]);
quota=false;await assert.rejects(()=>service({protocol:1,name:'가상회원'},{clientKey:'trusted'}),error=>error.code==='try_later');quota=true;
const handler=createLoginCandidateHandler({candidates:service,resolveClientKey:async()=> 'trusted',allowedOrigins:['https://app.example']});
const response=await handler(new Request('https://auth.example/candidates',{method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json'},body:JSON.stringify({protocol:1,name:'가상회원'})}));
assert.equal(response.status,200);assert.ok(!(await response.text()).includes('password'));
const oversized=await handler(new Request('https://auth.example/candidates',{method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json'},body:JSON.stringify({protocol:1,name:'가'.repeat(1100)})}));
assert.equal(oversized.status,413);
console.log('PASS login candidates: current duplicate-choice display fields only, keyed quotas, no password/phone/auth identifiers');

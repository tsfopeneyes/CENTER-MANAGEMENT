import {LoginError,normalizeLoginName} from './loginSecurity.mjs';

export function createLoginCandidateService({store,keyFor,readiness=async()=>false}){
    return async(input,{clientKey}={})=>{
        if(!input||typeof input!=='object'||Array.isArray(input)||input.protocol!==1||Object.keys(input).some(k=>!['protocol','name'].includes(k))||
            typeof input.name!=='string'||input.name.length>80||typeof clientKey!=='string'||!clientKey||clientKey.length>200)
            throw new LoginError('invalid_request',400);
        const name=normalizeLoginName(input.name);if(!name||/[\u0000-\u001f\u007f]/.test(name))throw new LoginError('invalid_request',400);
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        const clientLimitKey=await keyFor('candidate-client',clientKey),subjectLimitKey=await keyFor('candidate-name',name),nameKey=await keyFor('name',name);
        let rows;
        if(store.findCandidatesPrepared){const prepared=await store.findCandidatesPrepared(nameKey,clientLimitKey,subjectLimitKey);
            if(!prepared.allowed)throw new LoginError('try_later',429);rows=prepared.candidates;
        }else{
            if(!await store.consumeLimit(clientLimitKey,20)||!await store.consumeLimit(subjectLimitKey,10))throw new LoginError('try_later',429);
            rows=await store.findCandidatesByName(nameKey);
        }
        return {protocol:1,status:'ok',candidates:rows.map(row=>({profileId:row.profileId,name:row.name,school:row.school,userGroup:row.userGroup}))};
    };
}

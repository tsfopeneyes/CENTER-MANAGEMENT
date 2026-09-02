import {getAccountAuthClient,isAccountAuthEnabled} from '../auth/accountAuthRuntime.js';

const pending=new Map();

// The secure server owns the whole transaction. There is deliberately no RPC
// or direct-table fallback after activation: a partial browser migration can
// duplicate points, lose activity rows or delete the wrong profile.
export const mergeUserStats=async(sourceProfileId,targetProfileId)=>{
    if(!sourceProfileId||!targetProfileId||sourceProfileId===targetProfileId)
        return {success:false,error:'병합할 계정을 다시 확인해주세요.'};
    if(!isAccountAuthEnabled())return {success:false,error:'안전한 계정 병합 서버가 아직 활성화되지 않았습니다.'};
    const key=`${sourceProfileId}:${targetProfileId}`;
    const requestId=pending.get(key)||crypto.randomUUID();pending.set(key,requestId);
    try{await getAccountAuthClient().members.merge({requestId,sourceProfileId,targetProfileId});pending.delete(key);return {success:true};}
    catch(error){return {success:false,error:error?.message||'계정 병합을 완료하지 못했습니다.'};}
};

export const listPendingGuestLinks=async()=>{
    if(!isAccountAuthEnabled())return [];
    const result=await getAccountAuthClient().members.listReviews();
    return Array.isArray(result?.reviews)?result.reviews:[];
};

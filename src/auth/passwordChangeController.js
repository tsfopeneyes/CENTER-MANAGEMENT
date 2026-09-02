import {AuthOperationError} from './loginTransport.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const token=value=>typeof value==='string'&&value.length>0&&value.length<=8192;

// Applies the server-issued replacement session in place, so a successful
// password change does not navigate away or discard the user's current screen.
export function createPasswordChangeController({auth,change,resolveSession,exclusive,now=Date.now}){
    if(!auth?.getSession||!auth?.setSession||![change,resolveSession,exclusive].every(fn=>typeof fn==='function'))
        throw new Error('Explicit password change dependencies required');
    return async({profileId,newPassword},{signal}={})=>exclusive(async()=>{
        if(!uuid(profileId)||typeof newPassword!=='string'||newPassword.length<6||newPassword.length>128||!newPassword.trim())
            throw new AuthOperationError('invalid_request');
        const before=await auth.getSession();
        const current=before?.data?.session;
        if(before?.error||!token(current?.access_token))throw new AuthOperationError('invalid_login');
        const result=await change({action:'change-self',protocol:1,profileId,newPassword},{signal,accessToken:current.access_token});
        if(result?.protocol!==1||result.status!=='session_replaced'||result.profileId!==profileId||!uuid(result.authUserId)||
            !token(result.session?.access_token)||!token(result.session?.refresh_token)||!Number.isFinite(result.session?.expires_at)||
            result.session.expires_at*1000<=now()+30000)throw new AuthOperationError('account_changed');
        const proof=await resolveSession(result.session.access_token,{signal});
        if(proof?.protocol!==1||proof.decision!=='retain'||proof.profileId!==profileId||proof.authUserId!==result.authUserId||
            !uuid(proof.sessionId)||!Number.isFinite(proof.validUntil)||proof.validUntil<=now())throw new AuthOperationError('account_changed');
        const applied=await auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});
        if(applied?.error||applied?.data?.user?.id!==result.authUserId||applied?.data?.session?.user?.id!==result.authUserId)
            throw new AuthOperationError('session_apply_failed');
        const after=await auth.getSession();
        if(after?.error||after?.data?.session?.user?.id!==result.authUserId||after.data.session.access_token!==applied.data.session.access_token)
            throw new AuthOperationError('account_changed');
        const finalProof=await resolveSession(after.data.session.access_token,{signal});
        if(finalProof?.decision!=='retain'||finalProof.profileId!==profileId||finalProof.authUserId!==result.authUserId)
            throw new AuthOperationError('account_changed');
        return {status:'saved',profileId};
    },{signal});
}

import {AuthOperationError} from './loginTransport.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

// One existing administrator confirmation click becomes two protected server
// operations internally. No phone number or temporary value is returned.
export function createAdminResetController({auth,credentials,exclusive,now=Date.now}){
    if(!auth?.getSession||typeof credentials!=='function'||typeof exclusive!=='function')throw new Error('Explicit administrator reset dependencies required');
    return async({profileId},{signal}={})=>exclusive(async()=>{
        if(!uuid(profileId))throw new AuthOperationError('invalid_request');
        const current=await auth.getSession(),accessToken=current?.data?.session?.access_token;
        if(current?.error||typeof accessToken!=='string'||!accessToken||accessToken.length>8192)throw new AuthOperationError('invalid_login');
        const confirmed=await credentials({action:'confirm-reset',protocol:1,profileId},{signal,accessToken});
        if(confirmed?.protocol!==1||confirmed.status!=='reset_confirmed'||!uuid(confirmed.confirmationId)||
            !Number.isFinite(confirmed.validUntil)||confirmed.validUntil<=now())throw new AuthOperationError('account_changed');
        const reset=await credentials({action:'reset',protocol:1,profileId,confirmationId:confirmed.confirmationId},{signal,accessToken});
        if(reset?.protocol!==1||reset.status!=='password_change_required')throw new AuthOperationError('account_changed');
        return {status:'password_change_required'};
    },{signal});
}

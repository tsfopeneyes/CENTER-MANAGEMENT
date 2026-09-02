import {LoginError,isProfileId} from './loginSecurity.mjs';

export function createCredentialConfirmationService({store,limits,keyFor,authorize,readiness=async()=>false,lifetimeMs}){
    if(!store?.create||typeof authorize!=='function'||!Number.isFinite(lifetimeMs)||lifetimeMs<60000||lifetimeMs>900000)
        throw new Error('Explicit reset confirmation configuration required');
    return async(input,context={})=>{
        if(!input||typeof input!=='object'||Array.isArray(input)||input.protocol!==1||
            Object.keys(input).some(key=>!['protocol','profileId'].includes(key))||!isProfileId(input.profileId)||
            typeof context.accessToken!=='string'||!context.accessToken||context.accessToken.length>8192||
            typeof context.clientKey!=='string'||!context.clientKey||context.clientKey.length>200)throw new LoginError('invalid_request',400);
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        if(!await limits.consumeLimit(await keyFor('credential-client',context.clientKey),20)||
            !await limits.consumeLimit(await keyFor('account',input.profileId),5))throw new LoginError('try_later',429);
        const principal=await authorize({accessToken:context.accessToken,action:'credentials.reset',targetProfileId:input.profileId});
        if(!principal||!isProfileId(principal.actorProfileId))throw new LoginError('forbidden',403);
        const confirmation=await store.create({id:crypto.randomUUID(),profileId:input.profileId,
            actorProfileId:principal.actorProfileId,lifetimeMs});
        if(!isProfileId(confirmation?.id)||!Number.isFinite(confirmation.validUntil))throw new LoginError('temporarily_unavailable',503);
        return {protocol:1,status:'reset_confirmed',confirmationId:confirmation.id,validUntil:confirmation.validUntil};
    };
}

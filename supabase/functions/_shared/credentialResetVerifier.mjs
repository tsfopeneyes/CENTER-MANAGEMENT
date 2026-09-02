import {LoginError,isProfileId} from './loginSecurity.mjs';

// The confirmation row must be created by a separate administrator-facing
// identity-check action. This verifier only reads it and never trusts role,
// phone, actor or expiry values supplied by the reset request.
export function createCredentialResetVerifier({authorize,loadConfirmation,now=Date.now}){
    if(typeof authorize!=='function'||typeof loadConfirmation!=='function')throw new Error('Reset authorization dependencies required');
    return async({profileId,confirmationId},context={})=>{
        if(!isProfileId(profileId)||!isProfileId(confirmationId)||typeof context.accessToken!=='string')
            throw new LoginError('forbidden',403);
        const principal=await authorize({accessToken:context.accessToken,action:'credentials.reset',targetProfileId:profileId});
        if(!principal||!isProfileId(principal.actorProfileId)||!isProfileId(principal.authUserId))throw new LoginError('forbidden',403);
        const record=await loadConfirmation({confirmationId,profileId,actorProfileId:principal.actorProfileId});
        if(!record||record.id!==confirmationId||record.profileId!==profileId||record.actorProfileId!==principal.actorProfileId||
            record.purpose!=='password_reset'||!Number.isFinite(record.validUntil)||record.validUntil<=now()||
            !record.account||record.account.profileId!==profileId||!isProfileId(record.account.authUserId)||
            !Number.isSafeInteger(record.account.credentialVersion)||typeof record.phoneLast4!=='string'||!/^[0-9]{4}$/.test(record.phoneLast4))
            throw new LoginError('forbidden',403);
        return Object.freeze({allowed:true,actorId:principal.actorProfileId,confirmationId,validUntil:record.validUntil,
            phoneLast4:record.phoneLast4,account:Object.freeze({...record.account})});
    };
}

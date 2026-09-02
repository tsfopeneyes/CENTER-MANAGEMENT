import {LoginError,isProfileId} from './loginSecurity.mjs';

// Preserves the current screen on success by issuing and assuring a replacement
// session. Existing sessions become unusable through the credential epoch.
export function createSelfPasswordService({store,limits,keyFor,authorize,passwordPolicy,adminAuth,gateway,verifyToken,
    grantAssurance,discardSession,readiness=async()=>false,assuranceTtlMs,now=Date.now}){
    if(!store||typeof store.readActive!=='function'||typeof store.reserve!=='function'||typeof store.complete!=='function'||
        typeof authorize!=='function'||typeof grantAssurance!=='function'||typeof discardSession!=='function'||
        !Number.isFinite(assuranceTtlMs)||assuranceTtlMs<60000||assuranceTtlMs>2592000000)
        throw new Error('Explicit self password dependencies required');
    const unavailable=()=>new LoginError('temporarily_unavailable',503);
    const abort=signal=>{if(signal?.aborted)throw unavailable();};
    return async(input,context={})=>{
        if(!input||typeof input!=='object'||Array.isArray(input)||input.protocol!==1||
            Object.keys(input).some(key=>!['protocol','profileId','newPassword'].includes(key))||!isProfileId(input.profileId)||
            typeof input.newPassword!=='string'||input.newPassword.length<6||input.newPassword.length>128||!input.newPassword.trim()||
            typeof context.accessToken!=='string'||!context.accessToken||context.accessToken.length>8192||
            typeof context.clientKey!=='string'||!context.clientKey||context.clientKey.length>200)throw new LoginError('invalid_request',400);
        if(!await readiness())throw unavailable();abort(context.signal);
        if(!await limits.consumeLimit(await keyFor('credential-client',context.clientKey),20)||
            !await limits.consumeLimit(await keyFor('account',input.profileId),5))throw new LoginError('try_later',429);
        if(await passwordPolicy(input.newPassword,{purpose:'permanent'})!==true)throw new LoginError('password_policy',400);
        const principal=await authorize({accessToken:context.accessToken,action:'credentials.change-self',targetProfileId:input.profileId});
        const account=await store.readActive(input.profileId);
        if(!account||principal?.actorProfileId!==input.profileId||principal?.authUserId!==account.authUserId)throw new LoginError('forbidden',403);
        abort(context.signal);
        const operation=await store.reserve({id:crypto.randomUUID(),account,kind:'self_change',actorId:principal.actorProfileId});
        let issued,assured=false;
        try{
            const changed=await adminAuth.updateUserById(account.authUserId,{password:input.newPassword});
            if(changed?.error||changed?.data?.user?.id!==account.authUserId)throw unavailable();
            abort(context.signal);
            issued=await gateway.signIn(account.loginEmail,input.newPassword,{signal:context.signal});
            if(typeof issued?.access_token!=='string'||!issued.access_token||issued.access_token.length>8192||
                typeof issued.refresh_token!=='string'||!issued.refresh_token||issued.refresh_token.length>8192||
                issued.user?.id!==account.authUserId||!Number.isFinite(issued.expires_at)||issued.expires_at*1000<=now()+30000)throw unavailable();
            const replacement=await verifyToken(issued.access_token,{signal:context.signal});
            if(!replacement||replacement.authUserId!==account.authUserId||!isProfileId(replacement.sessionId)||
                replacement.live!==true||replacement.isAnonymous!==false||!Number.isFinite(replacement.expiresAt)||replacement.expiresAt<=now()+30000)
                throw unavailable();
            abort(context.signal);await store.complete(operation);
            const expected={...account,credentialVersion:operation.credentialVersion};
            await grantAssurance(expected,replacement,Math.min(replacement.expiresAt,now()+assuranceTtlMs),{signal:context.signal});
            assured=true;
            return {protocol:1,status:'session_replaced',profileId:input.profileId,authUserId:account.authUserId,
                session:{access_token:issued.access_token,refresh_token:issued.refresh_token,expires_at:issued.expires_at}};
        }catch(error){
            if(issued?.access_token&&!assured)try{await discardSession(issued.access_token);}catch{/* assurance still denies it */}
            if(error instanceof LoginError)throw error;throw unavailable();
        }
    };
}

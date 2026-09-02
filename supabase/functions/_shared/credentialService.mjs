import {LoginError,isProfileId} from './loginSecurity.mjs';

// verifyReset authoritatively checks the current administrator and the
// server-recorded, one-use identity confirmation. No request role/contact claim.
export function createCredentialService({store,limits,keyFor,passwordHasher,adminAuth,verifyReset,
    readiness=async()=>false,passwordPolicy=async()=>false,temporaryTtlMs,now=Date.now}){
    if(!passwordHasher||typeof passwordHasher.hash!=='function'||typeof passwordHasher.verify!=='function'||
        !Number.isFinite(temporaryTtlMs)||temporaryTtlMs<60000||temporaryTtlMs>2592000000)
        throw new Error('A password hasher and explicit temporary lifetime are required');
    const unavailable=()=>new LoginError('temporarily_unavailable',503);
    const aborted=signal=>{if(signal?.aborted)throw unavailable();};
    const quota=async(profileId,context)=>{
        if(!await readiness()||typeof context.clientKey!=='string'||!context.clientKey||context.clientKey.length>200)throw unavailable();
        aborted(context.signal);
        if(!await limits.consumeLimit(await keyFor('credential-client',context.clientKey),20)||
            !await limits.consumeLimit(await keyFor('account',profileId),5))throw new LoginError('try_later',429);
    };
    const writePermanent=async(reservation,password,signal)=>{
        aborted(signal);
        const result=await adminAuth.updateUserById(reservation.authUserId,{password});
        if(result?.error||result?.data?.user?.id!==reservation.authUserId)throw unavailable();
        aborted(signal);await store.complete(reservation);
        return {protocol:1,status:'login_required'};
    };
    const exact=(input,keys)=>{
        if(!input||typeof input!=='object'||Array.isArray(input)||input.protocol!==1||!isProfileId(input.profileId)||
            Object.keys(input).some(key=>!keys.includes(key)))throw new LoginError('invalid_request',400);
    };
    return {
        async reset(input,context={}){
            exact(input,['protocol','profileId','confirmationId']);
            if(!isProfileId(input.confirmationId))throw new LoginError('invalid_request',400);
            await quota(input.profileId,context);
            const verified=await verifyReset?.({profileId:input.profileId,confirmationId:input.confirmationId},context);
            if(!verified||verified.allowed!==true||!isProfileId(verified.actorId)||
                verified.account?.profileId!==input.profileId||!isProfileId(verified.account?.authUserId)||
                !Number.isSafeInteger(verified.account?.credentialVersion)||verified.confirmationId!==input.confirmationId||
                !Number.isFinite(verified.validUntil)||verified.validUntil<=now()||
                typeof verified.phoneLast4!=='string'||!/^[0-9]{4}$/.test(verified.phoneLast4))throw new LoginError('forbidden',403);
            // Four digits are a one-use server credential, never the native Auth
            // password. The adapter must use a reviewed slow password KDF.
            const temporaryDigest=await passwordHasher.hash(verified.phoneLast4,{purpose:'temporary',profileId:input.profileId});
            if(typeof temporaryDigest!=='string'||temporaryDigest.length<32||temporaryDigest.length>512)throw unavailable();
            aborted(context.signal);
            const reservation=await store.reserve({id:crypto.randomUUID(),account:verified.account,kind:'admin_reset',
                actorId:verified.actorId,confirmationId:verified.confirmationId,temporaryTtlMs,temporaryDigest});
            try{await store.complete(reservation);return {protocol:1,status:'password_change_required'};}
            catch{throw unavailable();}
        },
        async changeTemporary(input,context={}){
            exact(input,['protocol','profileId','temporaryPassword','newPassword']);
            if(typeof input.temporaryPassword!=='string'||!/^[0-9]{4}$/.test(input.temporaryPassword)||
                typeof input.newPassword!=='string'||input.newPassword.length<6||input.newPassword.length>128||
                !input.newPassword.trim()||input.newPassword===input.temporaryPassword)throw new LoginError('invalid_request',400);
            await quota(input.profileId,context);
            if(await passwordPolicy(input.newPassword,{purpose:'permanent'})!==true)throw new LoginError('password_policy',400);
            const account=await store.readTemporary(input.profileId);
            if(!account)throw new LoginError('invalid_login',401);
            try{
                if(await passwordHasher.verify(input.temporaryPassword,account.temporaryDigest,
                    {purpose:'temporary',profileId:input.profileId})!==true)throw new LoginError('invalid_login',401);
                aborted(context.signal);
                const reservation=await store.reserve({id:crypto.randomUUID(),account,kind:'temporary_change',actorId:account.authUserId});
                return await writePermanent(reservation,input.newPassword,context.signal);
            }catch(error){
                if(error instanceof LoginError)throw error;
                throw unavailable();
            }
        }
    };
}

import {LoginError, invalidLogin, validateLogin, isProfileId} from './loginSecurity.mjs';

// Business operation for both initial login and in-place reconfirmation.
// No production wiring: readiness must confirm the legacy paths are closed and
// all protected operations enforce the private account/assurance contract.
export function createLoginService({store, gateway, verifyToken, keyFor, legacyBridge, readiness = async () => false,
    assuranceTtlMs, now = Date.now}) {
    if (!legacyBridge?.verify || !legacyBridge?.providerPassword || !Number.isFinite(assuranceTtlMs) || assuranceTtlMs < 300000 || assuranceTtlMs > 90 * 86400000) {
        throw new Error('An explicit assurance lifetime is required');
    }
    return async (rawInput, {clientKey, signal,timings} = {}) => {
        const totalStarted=performance.now();let stageStarted=totalStarted,currentStage='db';
        const mark=name=>{if(Array.isArray(timings))timings.push([name,Math.max(0,Math.round(performance.now()-stageStarted))]);stageStarted=performance.now();};
        const input = validateLogin(rawInput);
        if (!clientKey || typeof clientKey !== 'string' || clientKey.length > 200 || !await readiness()) {
            throw new LoginError('temporarily_unavailable',503);
        }
        const checkAbort = () => { if (signal?.aborted) throw new LoginError('temporarily_unavailable',503); };
        checkAbort();
        // clientKey comes from trusted ingress, NOT a request body or unverified
        // X-Forwarded-For header. All modes also share a resolved-account quota.
        const clientLimitKey=await keyFor('client',clientKey);
        const subjectKey = await keyFor(input.profileId ? 'profile-input' : 'name-input',input.profileId || input.name);
        let candidates,prepared=false;
        if(input.profileId&&store.prepareByProfile){
            const result=await store.prepareByProfile(input.profileId,clientLimitKey,subjectKey,await keyFor('account',input.profileId));
            if(!result.allowed)throw new LoginError('try_later',429);candidates=result.candidates;prepared=true;
        }else if(!input.profileId&&store.prepareByLookup){
            const result=await store.prepareByLookup(await keyFor('name',input.name),input.phone?await keyFor('phone',input.phone):null,
                clientLimitKey,subjectKey);
            if(!result.allowed)throw new LoginError('try_later',429);candidates=result.candidates;
        }else{
            if(!await store.consumeLimit(clientLimitKey,20)||!await store.consumeLimit(subjectKey,10))throw new LoginError('try_later',429);
            candidates=input.action==='reconfirm'||input.profileId?await store.findByProfile(input.profileId):
                await store.findByLookup(await keyFor('name',input.name),input.phone?await keyFor('phone',input.phone):null);
        }
        // Do not try multiple members' passwords or return a roster. The UI can
        // offer optional registered-phone input to everyone for disambiguation.
        if(candidates.length!==1){
            if(input.action==='login'&&!input.profileId)throw new LoginError(candidates.length===0?'name_not_found':'selection_required',candidates.length===0?404:409);
            throw invalidLogin();
        }
        const account = candidates[0];
        if (!prepared&&!await store.consumeLimit(await keyFor('account',account.profileId),5)) throw new LoginError('try_later',429);
        if (!isProfileId(account.profileId) || !isProfileId(account.authUserId) ||
            account.status !== 'active' || account.mappingVerified !== true || account.enabled !== true ||
            !['legacy_bridge','supabase_password'].includes(account.credentialMode) || !account.loginEmail ||
            !Number.isSafeInteger(account.credentialVersion) || account.credentialVersion < 1) throw invalidLogin();
        let providerPassword=input.password;
        if(account.credentialMode==='legacy_bridge'){
            if(!await legacyBridge.verify(input.password,account.legacyDigest))throw invalidLogin();
            providerPassword=await legacyBridge.providerPassword(account.profileId,account.legacyDigest);
        } else if(account.legacyDigest!==null && account.legacyDigest!==undefined)throw invalidLogin();
        mark('db');
        checkAbort();
        let created, granted = false;
        try {
            currentStage='auth';
            try{created=await gateway.signIn(account.loginEmail,providerPassword,{signal});}finally{mark('auth');}
            checkAbort();
            if (typeof created?.access_token !== 'string' || !created.access_token || created.access_token.length > 8192 ||
                typeof created.refresh_token !== 'string' || !created.refresh_token || created.refresh_token.length > 8192 ||
                created.user?.id !== account.authUserId) throw invalidLogin();
            currentStage='session';
            let principal;
            try{principal=verifyToken.created
                ? await verifyToken.created(created.access_token,account.authUserId,{signal})
                : await verifyToken(created.access_token,{signal});}finally{mark('session');}
            if (!principal || principal.authUserId !== account.authUserId || !isProfileId(principal.sessionId) || principal.live !== true ||
                principal.isAnonymous !== false || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= now() + 30000) throw invalidLogin();
            // A reset credential must never become a general application session.
            // The restricted password-change flow is a separate operation.
            if (account.mustChangePassword !== false) throw new LoginError('password_change_required',403);
            checkAbort();
            const validUntil = now() + assuranceTtlMs;
            // The store locks and rechecks the CURRENT connection, credential
            // version, email, reset flag and live session, then commits evidence.
            currentStage='assurance';
            try{await store.grantAssurance(account,principal,validUntil,{signal});}finally{mark('assurance');}
            granted = true;
            checkAbort();
            if(Array.isArray(timings))timings.push(['total',Math.max(0,Math.round(performance.now()-totalStarted))]);
            return {protocol:1,profileId:account.profileId,authUserId:account.authUserId,
                session:{access_token:created.access_token,refresh_token:created.refresh_token,
                    expires_at:principal.expiresAt / 1000}};
        } catch (error) {
            if(Array.isArray(timings))timings.push([`failed${currentStage}`,0],['total',Math.max(0,Math.round(performance.now()-totalStarted))]);
            if (created?.access_token) {
                try { await gateway.discardCreatedSession(created.access_token); } catch { /* no tokens/logs; live checks still required */ }
            }
            // Evidence may exist if COMMIT succeeded but its response was lost.
            // Do not retry the login or delete data; the created session is revoked
            // when possible. Its evidence never bypasses live-session checks.
            if (granted || !(error instanceof LoginError)) throw new LoginError('temporarily_unavailable',503);
            throw error;
        }
    };
}

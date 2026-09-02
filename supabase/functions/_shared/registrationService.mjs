import {LoginError,isProfileId} from './loginSecurity.mjs';

// Staged signup orchestration. Member writes require an explicitly supplied
// transactional finalizer. Without it this remains preparation only.
export function createRegistrationService({store,limits,keyFor,adminAuth,gateway,verifyToken,
    verifyEnrollment,readiness=async()=>false,passwordPolicy=async()=>false,
    loginDomain,lifetimeMs,finalizeMembership,now=Date.now}) {
    if(typeof loginDomain!=='string' || loginDomain.length>190 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(loginDomain) ||
        !Number.isFinite(lifetimeMs) || lifetimeMs<60000 || lifetimeMs>86400000)throw new Error('Explicit registration configuration required');
    const unavailable=()=>new LoginError('temporarily_unavailable',503);
    const abort=(signal)=>{if(signal?.aborted)throw unavailable();};
    return async(input,context={})=>{
        if(!input || typeof input!=='object' || Array.isArray(input) || input.protocol!==1 ||
            Object.keys(input).some(k=>!['protocol','requestSecret','password','details','enrollmentId'].includes(k)) ||
            typeof input.requestSecret!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.requestSecret) ||
            !isProfileId(input.enrollmentId) || typeof input.password!=='string' || input.password.length<6 ||
            input.password.length>128 || !input.password.trim() ||
            !input.details || typeof input.details!=='object' || Array.isArray(input.details))throw new LoginError('invalid_request',400);
        if(typeof context.clientKey!=='string' || !context.clientKey || context.clientKey.length>200 || !await readiness())throw unavailable();
        abort(context.signal);
        if(!await limits.consumeLimit(await keyFor('registration-client',context.clientKey),10))throw new LoginError('try_later',429);
        // Trusted server verifier must validate ALL submitted fields, current terms,
        // guardian requirements, and non-replayed enrollment ownership evidence.
        // It must never approve existing-member/guest merging by name or phone.
        const verified=await verifyEnrollment?.({enrollmentId:input.enrollmentId,details:input.details},context);
        if(!verified || verified.allowed!==true || verified.enrollmentId!==input.enrollmentId ||
            typeof verified.identity!=='string' || !verified.identity || verified.identity.length>256 ||
            typeof verified.canonicalDetails!=='string' || !verified.canonicalDetails || verified.canonicalDetails.length>16384 ||
            !Number.isFinite(verified.validUntil) || verified.validUntil<=now())throw new LoginError('registration_review_required',409);
        if(await passwordPolicy(input.password,{purpose:'permanent'})!==true)throw new LoginError('password_policy',400);
        const identityKey=await keyFor('registration-identity',verified.identity);
        if(!await limits.consumeLimit(await keyFor('registration-attempt',identityKey),5))throw new LoginError('try_later',429);
        const requestKey=await keyFor('registration-request',input.requestSecret);
        const detailsKey=await keyFor('registration-details',verified.canonicalDetails);
        abort(context.signal);
        let created,createdAuthUserId;
        try {
            const id=crypto.randomUUID();
            const operation=await store.reserve({id,requestKey,identityKey,detailsKey,
                loginEmail:id+'@'+loginDomain,lifetimeMs});
            abort(context.signal);
            if(await store.claim(operation)) {
                // Only the winner of the durable CAS may invoke createUser once.
                // No retry even when the provider rejects or its response is lost.
                abort(context.signal);
                const result=await adminAuth.createUser({email:operation.loginEmail,password:input.password,email_confirm:true,
                    app_metadata:{registration_operation:operation.id}});
                if(result?.error || !isProfileId(result?.data?.user?.id))throw unavailable();
                createdAuthUserId=result.data.user.id;
            }
            abort(context.signal);
            let authUserId=createdAuthUserId;
            if(!authUserId){
                const found=await adminAuth.findUserByEmail?.(operation.loginEmail,operation.id);
                if(found?.error)throw unavailable();
                authUserId=found?.data?.user?.id;
            }
            if(!authUserId)throw new LoginError('registration_pending',409);
            // Request secret alone is NOT account ownership. Fresh standard Auth
            // password proof is required on BOTH normal and recovered attempts.
            created=await gateway.signIn(operation.loginEmail,input.password,{signal:context.signal});
            abort(context.signal);
            if(typeof created?.access_token!=='string' || !created.access_token || created.access_token.length>8192 ||
                created.user?.id!==authUserId)throw new LoginError('invalid_login',401);
            const principal=await verifyToken(created.access_token,{signal:context.signal});
            if(!principal || principal.authUserId!==authUserId || !isProfileId(principal.sessionId) ||
                principal.live!==true || principal.isAnonymous!==false || !Number.isFinite(principal.expiresAt) ||
                principal.expiresAt<=now()+30000)throw new LoginError('invalid_login',401);
            abort(context.signal);
            await store.markReady(operation,authUserId);
            if(finalizeMembership) {
                abort(context.signal);
                const completed=await finalizeMembership({operationId:operation.id,requestSecret:input.requestSecret,
                    submission:input.details,accessToken:created.access_token},{signal:context.signal});
                if(completed?.protocol!==1 || completed.status!=='registered')throw unavailable();
                return {protocol:1,status:completed.status};
            }
            // No IDs/aliases/tokens/registration secrets returned. A separate,
            // transactional member finalization must run before signup is complete.
            return {protocol:1,status:'membership_pending'};
        } catch(error) {
            if(error instanceof LoginError)throw error;
            throw unavailable();
        } finally {
            if(created?.access_token)try{await gateway.discardCreatedSession(created.access_token);}catch{/* readiness requires unassured-session denial */}
        }
    };
}

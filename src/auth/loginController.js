import {AuthOperationError} from './loginTransport.js';
const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const token=value=>typeof value==='string' && value.length>0 && value.length<=8192;

// Same-origin tabs must share this lock name. No unsafe fallback on unsupported
// browsers; a reviewed alternative is needed before enabling the staged path.
export function createBrowserAuthLock({locks=globalThis.navigator?.locks,name}={}) {
    if(!locks?.request || typeof name!=='string' || !name)throw new Error('Shared authentication lock required');
    return (work,{signal}={})=>locks.request(name,{mode:'exclusive',signal},work);
}

// No React state/storage/navigation dependencies. Existing UI can await login or
// reconfirm before changing its member profile. Failed attempts never sign out
// the current SDK session. invalidate() fences an external account/context change.
export function createLoginController({auth,login,readProfile,discardCreatedSession,exclusive,now=Date.now}) {
    if(!auth?.setSession || !auth?.getSession || !auth?.signOut ||
        ![login,readProfile,discardCreatedSession,exclusive].every(fn=>typeof fn==='function'))throw new Error('Explicit auth dependencies required');
    let revision=0,tail=Promise.resolve(),active=null;
    const invalidate=()=>{revision++;active?.abort();};
    const enqueue=(work)=>{
        invalidate();const version=revision,abort=new AbortController();active=abort;
        const current=()=>{if(version!==revision || abort.signal.aborted)throw new AuthOperationError('cancelled');};
        const next=tail.then(()=>{current();return exclusive(()=>work(current,abort.signal),{signal:abort.signal});});
        // SDK writes cannot be aborted. Do not release the queue until a pending
        // SDK mutation settles, even if a later intent superseded this operation.
        tail=next.catch(()=>{});
        return next.catch(error=>{throw error instanceof AuthOperationError?error:new AuthOperationError('temporarily_unavailable');})
            .finally(()=>{if(active===abort)active=null;});
    };
    const signIn=(input)=>{
        const mode=input?.action;
        const invalidInitial=mode==='login'&&(input.profileId!==undefined?!uuid(input.profileId):
            (typeof input.name!=='string'||!input.name.trim()||input.name.length>80||
                (input.phone!==undefined&&(typeof input.phone!=='string'||input.phone.length>24))));
        if(!['login','reconfirm'].includes(mode) || typeof input.password!=='string' || !input.password || input.password.length>128 ||
            invalidInitial ||
            (mode==='reconfirm' && !uuid(input.profileId)))return Promise.reject(new AuthOperationError('invalid_request'));
        // Snapshot only the allowed fields; later form edits and role/hash fields
        // cannot alter an in-flight request. Password is never persisted/logged.
        const body=mode==='login'?(uuid(input.profileId)?{action:mode,protocol:1,profileId:input.profileId,password:input.password}:
            {action:mode,protocol:1,name:input.name,password:input.password,...(input.phone?{phone:input.phone}:{})}):
            {action:mode,protocol:1,profileId:input.profileId,password:input.password};
        return enqueue(async(current,signal)=>{
            let issued,applyStarted=false;
            const timingStarted=performance.now(),timing={};let timingStage=timingStarted;
            const mark=name=>{timing[name]=Math.round(performance.now()-timingStage);timingStage=performance.now();};
            try {
                current();issued=await login(body,{signal});current();mark('login');
                if(issued?.protocol!==1 || !uuid(issued.profileId) || !uuid(issued.authUserId) ||
                    !token(issued.session?.access_token) || !token(issued.session?.refresh_token) ||
                    !Number.isFinite(issued.session.expires_at) || issued.session.expires_at*1000<=now()+30000 ||
                    (mode==='reconfirm' && issued.profileId!==body.profileId))throw new AuthOperationError('account_changed');
                // SDK persistence and its returned promise are not atomic. A
                // rejected promise can still leave this session installed.
                applyStarted=true;
                const result=await auth.setSession({access_token:issued.session.access_token,refresh_token:issued.session.refresh_token});
                current();mark('sdk');
                if(result?.error || result?.data?.user?.id!==issued.authUserId || result?.data?.session?.user?.id!==issued.authUserId)
                    throw new AuthOperationError('session_apply_failed');
                const snapshot=await auth.getSession();current();
                if(snapshot?.error || snapshot?.data?.session?.user?.id!==issued.authUserId ||
                    snapshot.data.session.access_token!==result.data.session.access_token)throw new AuthOperationError('account_changed');
                // Reading the own-profile projection validates the exact token
                // installed by the SDK, its live Auth session and the assurance
                // written by login. Separate pre/post session probes duplicated
                // those same server checks and added two network round trips.
                const loaded=await readProfile({action:'read',protocol:1,profileId:issued.profileId},
                    {accessToken:snapshot.data.session.access_token,signal});current();mark('profile');
                if(loaded?.protocol!==1||loaded.status!=='ok'||loaded.profile?.id!==issued.profileId)throw new AuthOperationError('account_changed');
                // Cross-tab events may arrive after the server validated the
                // captured token. Read the SDK again before returning a profile.
                const latest=await auth.getSession();current();
                if(latest?.error || latest?.data?.session?.user?.id!==issued.authUserId ||
                    latest.data.session.access_token!==snapshot.data.session.access_token)
                    throw new AuthOperationError('account_changed');
                console.info('[account-auth-timing]',JSON.stringify({stage:'login-total',...timing,total:Math.round(performance.now()-timingStarted)}));
                return {profileId:issued.profileId,authUserId:issued.authUserId,profile:loaded.profile};
            } catch(error) {
                console.info('[account-auth-timing]',JSON.stringify({stage:'login-client-error',...timing,total:Math.round(performance.now()-timingStarted),code:error?.code||'unexpected'}));
                // Cleanup is token-specific and must NOT call shared SDK signOut.
                // Never restore old tokens after an ambiguous SDK write.
                if(!applyStarted && token(issued?.session?.access_token))try{await discardCreatedSession(issued.session.access_token);}catch{/* no secrets; server assurance/live checks remain required */}
                throw error;
            }
        });
    };
    return {
        login:input=>signIn({...input,action:'login'}),
        reconfirm:input=>signIn({...input,action:'reconfirm'}),
        logout:()=>enqueue(async(current)=>{
            current();const result=await auth.signOut({scope:'local'});current();
            if(result?.error)throw new AuthOperationError('temporarily_unavailable');
            return {status:'signed_out'};
        }),
        invalidate
    };
}

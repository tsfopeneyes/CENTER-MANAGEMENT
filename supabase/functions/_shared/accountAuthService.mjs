import {createSessionService} from './sessionService.mjs';
import {createSessionReadStore} from './sessionReadStore.mjs';
import {createVerifiedSessionReader} from './verifiedSession.mjs';
import {createLoginKey} from './loginSecurity.mjs';
import {createPasswordGateway} from './passwordGateway.mjs';
import {createLoginStore} from './loginStore.mjs';
import {createLoginService} from './loginService.mjs';
import {createLoginHandler} from './loginHandler.mjs';
import {createCredentialHandler} from './credentialHandler.mjs';
import {createProfileHandler} from './profileHandler.mjs';
import {createRegistrationHandler} from './registrationHandler.mjs';
import {createLoginCandidateService} from './loginCandidateService.mjs';
import {createLoginCandidateHandler} from './loginCandidateHandler.mjs';
import {createMediaUploadHandler} from './mediaUploadHandler.mjs';
import {createMemberAdminHandler} from './memberAdminHandler.mjs';

// Composition only, not a deployable entry point. Caller must supply separate
// least-privilege pools, trusted ingress identity and verified rollout readiness.
export function resolveAccountAuthRoute(pathname,basePath=''){
    if(typeof pathname!=='string'||typeof basePath!=='string'||
        (basePath!==''&&(!basePath.startsWith('/')||basePath.endsWith('/')||basePath.includes('?')||basePath.includes('#'))))
        throw new Error('Explicit account auth base path required');
    const routes=new Map([[basePath+'/health','health'],[basePath+'/session','session'],[basePath+'/login','login'],[basePath+'/credentials','credentials'],
        [basePath+'/profile','profile'],[basePath+'/register','register'],[basePath+'/uploads','uploads'],[basePath+'/members','members']]);
    routes.set(basePath+'/candidates','candidates');
    return routes.get(pathname)||null;
}

export async function createAccountAuthService({readerPool, loginPool, supabaseUrl, publishableKey,
    lookupSecret,legacyBridge, resolveClientKey, readiness, assuranceTtlMs, allowedOrigins,credentialService=null,profileService=null,registrationService=null,uploadService=null,memberAdminService=null,
    basePath='',fetcher = fetch}) {
    const status = createSessionService({pool:readerPool,supabaseUrl,publishableKey,allowedOrigins,fetcher});
    const gateway = createPasswordGateway({supabaseUrl,publishableKey,fetcher});
    const read = createSessionReadStore((text,values)=>readerPool.query(text,values));
    const verifyToken = createVerifiedSessionReader({supabaseUrl,publishableKey,fetcher,loadLiveSession:read.loadLiveSession});
    const loginStore=createLoginStore(loginPool),keyFor=await createLoginKey(lookupSecret);
    const login = createLoginService({store:loginStore,gateway,verifyToken,legacyBridge,
        keyFor,readiness,assuranceTtlMs});
    const loginHttp = createLoginHandler({login,resolveClientKey,allowedOrigins});
    const candidateHttp=createLoginCandidateHandler({candidates:createLoginCandidateService({store:loginStore,keyFor,readiness}),resolveClientKey,allowedOrigins});
    const credentialChanges=credentialService?createCredentialHandler({credentials:credentialService,resolveClientKey,allowedOrigins}):null;
    const profiles=profileService?createProfileHandler({profiles:profileService,allowedOrigins}):null;
    const registration=registrationService?createRegistrationHandler({register:registrationService,resolveClientKey,allowedOrigins}):null;
    const uploads=uploadService?createMediaUploadHandler({upload:uploadService,resolveClientKey,allowedOrigins}):null;
    const members=memberAdminService?createMemberAdminHandler({members:memberAdminService,allowedOrigins}):null;
    return async request => {
        // An Edge/HTTP adapter can mount these exact paths after readiness checks.
        const route=resolveAccountAuthRoute(new URL(request.url).pathname,basePath);
        if(route==='health'){
            if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers:{'Cache-Control':'no-store'}});
            try{const ready=await readiness();return Response.json({protocol:1,service:'account-auth',ready:ready===true},
                {status:ready===true?200:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
            catch{return Response.json({protocol:1,service:'account-auth',ready:false},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
        }
        if (route === 'session') return status(request);
        if (route === 'login') return loginHttp(request);
        if (route === 'candidates') return candidateHttp(request);
        if (route === 'credentials' && credentialChanges) return credentialChanges(request);
        if (route === 'profile' && profiles) return profiles(request);
        if (route === 'register' && registration) return registration(request);
        if (route === 'uploads' && uploads) return uploads(request);
        if (route === 'members' && members) return members(request);
        return Response.json({error:'not_found'},{status:404,headers:{'Cache-Control':'no-store'}});
    };
}

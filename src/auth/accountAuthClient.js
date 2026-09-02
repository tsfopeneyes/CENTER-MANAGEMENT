import {createLoginTransport} from './loginTransport.js';
import {createSessionTransport} from './sessionTransport.js';
import {createCredentialTransport} from './credentialTransport.js';
import {createSessionDiscardTransport} from './sessionDiscardTransport.js';
import {createLoginController,createBrowserAuthLock} from './loginController.js';
import {createSessionCoordinator} from './sessionCoordinator.js';
import {createPasswordChangeController} from './passwordChangeController.js';
import {createAdminResetController} from './adminResetController.js';
import {createProfileTransport} from './profileTransport.js';
import {createRegistrationTransport} from './registrationTransport.js';
import {createRegistrationController} from './registrationController.js';
import {createLoginCandidateTransport} from './loginCandidateTransport.js';
import {createMediaUploadTransport} from './mediaUploadTransport.js';
import {createMemberAdminTransport} from './memberAdminTransport.js';

// Constructed only after server/database readiness is proven. Merely importing
// this file does not change the current app, session, storage or navigation.
export function createAccountAuthClient({baseUrl,supabaseUrl,publishableKey,auth,locks=globalThis.navigator?.locks,
    fetcher=fetch,origin=globalThis.location?.origin}){
    if(typeof baseUrl!=='string'||!baseUrl)throw new Error('Invalid account auth base URL');
    const base=baseUrl.startsWith('/')?new URL(baseUrl,origin):new URL(baseUrl);
    if(base.username||base.password||base.search||base.hash||base.pathname.endsWith('/')||
        (base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname))))
        throw new Error('Invalid account auth base URL');
    const endpoint=suffix=>base.href+suffix;
    const resolveSession=createSessionTransport({endpoint:endpoint('/session'),publishableKey,fetcher});
    const login=createLoginTransport({endpoint:endpoint('/login'),publishableKey,fetcher});
    const credentials=createCredentialTransport({endpoint:endpoint('/credentials'),publishableKey,fetcher});
    const profile=createProfileTransport({endpoint:endpoint('/profile'),publishableKey,fetcher});
    const register=createRegistrationTransport({endpoint:endpoint('/register'),publishableKey,fetcher});
    const candidates=createLoginCandidateTransport({endpoint:endpoint('/candidates'),publishableKey,fetcher});
    const upload=createMediaUploadTransport({endpoint:endpoint('/uploads'),publishableKey,fetcher});
    const members=createMemberAdminTransport({endpoint:endpoint('/members'),publishableKey,auth,fetcher});
    const discardCreatedSession=createSessionDiscardTransport({supabaseUrl,publishableKey,fetcher});
    const exclusive=createBrowserAuthLock({locks,name:'center-account-auth'});
    return Object.freeze({
        createSessionCoordinator:expectedProfileId=>createSessionCoordinator({auth,resolveSession,expectedProfileId}),
        login:createLoginController({auth,login,readProfile:profile,discardCreatedSession,exclusive}),
        password:createPasswordChangeController({auth,change:credentials,resolveSession,exclusive}),
        adminReset:createAdminResetController({auth,credentials,exclusive}),profile,
        registration:createRegistrationController({register}),candidates,upload,members
    });
}

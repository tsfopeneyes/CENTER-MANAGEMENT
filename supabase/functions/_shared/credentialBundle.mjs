import {createCredentialStore} from './credentialStore.mjs';
import {createCredentialResetStore} from './credentialResetStore.mjs';
import {createCredentialResetVerifier} from './credentialResetVerifier.mjs';
import {createCredentialConfirmationStore} from './credentialConfirmationStore.mjs';
import {createCredentialConfirmationService} from './credentialConfirmationService.mjs';
import {createCredentialService} from './credentialService.mjs';
import {createSelfPasswordService} from './selfPasswordService.mjs';
import {createTemporaryCredentialHasher} from './temporaryCredentialHasher.mjs';

// Wires the credential paths without constructing pools, secrets or admin SDKs.
// The deployable adapter must supply separately authenticated least-privilege
// pools and server-only secrets.
export function createCredentialBundle({credentialPool,confirmationPool,limits,keyFor,authorize,adminAuth,gateway,
    verifyToken,grantAssurance,discardSession,readiness,passwordPolicy,pepper,kdfIterations=310000,
    temporaryTtlMs,confirmationTtlMs,assuranceTtlMs,now=Date.now}){
    const store=createCredentialStore(credentialPool);
    const loadConfirmation=createCredentialResetStore((text,values)=>credentialPool.query(text,values));
    const verifyReset=createCredentialResetVerifier({authorize,loadConfirmation,now});
    const passwordHasher=createTemporaryCredentialHasher({pepper,iterations:kdfIterations});
    const credentials=createCredentialService({store,limits,keyFor,passwordHasher,adminAuth,verifyReset,
        readiness,passwordPolicy,temporaryTtlMs,now});
    const confirmReset=createCredentialConfirmationService({store:createCredentialConfirmationStore(confirmationPool),
        limits,keyFor,authorize,readiness,lifetimeMs:confirmationTtlMs});
    const changeSelf=createSelfPasswordService({store,limits,keyFor,authorize,passwordPolicy,adminAuth,gateway,verifyToken,
        grantAssurance,discardSession,readiness,assuranceTtlMs,now});
    return Object.freeze({confirmReset,reset:credentials.reset,changeTemporary:credentials.changeTemporary,changeSelf});
}

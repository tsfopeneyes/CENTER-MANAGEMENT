import {createRoleBoundPool} from './roleBoundPool.mjs';
import {createSessionReadStore,createSessionSnapshot} from './sessionReadStore.mjs';
import {createVerifiedSessionReader} from './verifiedSession.mjs';
import {createAccountAuthorization} from './accountAuthorization.mjs';
import {createLoginStore} from './loginStore.mjs';
import {createLoginKey} from './loginSecurity.mjs';
import {createPasswordGateway} from './passwordGateway.mjs';
import {createAdminAuthGateway} from './adminAuthGateway.mjs';
import {createCredentialBundle} from './credentialBundle.mjs';
import {createProfileBundle} from './profileBundle.mjs';
import {createAccountAuthService} from './accountAuthService.mjs';
import {createRegistrationBundle} from './registrationBundle.mjs';
import {createStorageGateway} from './storageGateway.mjs';
import {createMediaUploadService} from './mediaUploadService.mjs';
import {createLegacyCredentialBridge} from './legacyCredentialBridge.mjs';
import {createMemberAdminService} from './memberAdminService.mjs';
import {createAccountMergeService} from './accountMergeService.mjs';

export async function createAccountAuthRuntime({basePool,supabaseUrl,publishableKey,serviceRoleKey,lookupSecret,legacyBridgeSecret,pepper,
    resolveClientKey,readiness,allowedOrigins,basePath='/functions/v1/account-auth',temporaryTtlMs=86400000,
    confirmationTtlMs=300000,assuranceTtlMs=86400000,kdfIterations=310000,passwordPolicy,
    termsVersion,loginDomain,registrationTtlMs=3600000,fetcher=fetch}){
    if(!basePool?.connect||typeof readiness!=='function'||typeof passwordPolicy!=='function')throw new Error('Explicit account runtime dependencies required');
    const readerPool=createRoleBoundPool(basePool,'account_session_reader');
    const loginPool=createRoleBoundPool(basePool,'account_login_worker');
    const credentialPool=createRoleBoundPool(basePool,'account_credential_worker');
    const confirmationPool=createRoleBoundPool(basePool,'account_confirmation_writer');
    const profilePool=createRoleBoundPool(basePool,'account_profile_worker');
    const registrationPool=createRoleBoundPool(basePool,'account_registration_worker');
    const membershipPool=createRoleBoundPool(basePool,'account_membership_worker');
    const memberAdminPool=createRoleBoundPool(basePool,'account_member_admin_worker');
    const mergePool=createRoleBoundPool(basePool,'account_merge_worker');
    const sessionRead=createSessionReadStore((text,values)=>readerPool.query(text,values));
    const verifyToken=createVerifiedSessionReader({supabaseUrl,publishableKey,fetcher,loadLiveSession:sessionRead.loadLiveSession});
    const authorize=createAccountAuthorization({snapshot:createSessionSnapshot(readerPool),verifyToken});
    const keyFor=await createLoginKey(lookupSecret),loginStore=createLoginStore(loginPool);
    const legacyBridge=await createLegacyCredentialBridge(legacyBridgeSecret);
    const gateway=createPasswordGateway({supabaseUrl,publishableKey,fetcher});
    const adminAuth=createAdminAuthGateway({supabaseUrl,serviceRoleKey,fetcher});
    const credentialService=createCredentialBundle({credentialPool,confirmationPool,limits:loginStore,keyFor,authorize,
        adminAuth,gateway,verifyToken,grantAssurance:loginStore.grantAssurance,discardSession:gateway.discardCreatedSession,
        readiness,passwordPolicy,pepper,kdfIterations,temporaryTtlMs,confirmationTtlMs,assuranceTtlMs});
    const profileService=createProfileBundle({pool:profilePool,verifyToken,readiness,profileImageOrigin:new URL(supabaseUrl).origin});
    const registrationService=createRegistrationBundle({registrationPool,membershipPool,limits:loginStore,keyFor,adminAuth,
        gateway,verifyToken,readiness,passwordPolicy,termsVersion,loginDomain,lifetimeMs:registrationTtlMs});
    const uploadService=createMediaUploadService({authorize,limits:loginStore,keyFor,
        gateway:createStorageGateway({supabaseUrl,serviceRoleKey,fetcher}),readiness});
    const setRole=createMemberAdminService({pool:memberAdminPool,authorize,readiness});
    const mergeService=createAccountMergeService({pool:mergePool,authorize,readiness});
    const memberAdminService=Object.freeze({setRole,...mergeService});
    return createAccountAuthService({readerPool,loginPool,supabaseUrl,publishableKey,lookupSecret,legacyBridge,resolveClientKey,readiness,
        assuranceTtlMs,allowedOrigins,credentialService,profileService,registrationService,uploadService,memberAdminService,basePath,fetcher});
}

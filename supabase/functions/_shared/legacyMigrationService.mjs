import {LoginError,isProfileId} from './loginSecurity.mjs';

const encoder=new TextEncoder(),hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
export function createLegacyMigrationService({store,bridge,adminAuth,readiness=async()=>false}){
    if(!store?.read||!store?.prepare||!store?.complete||!store?.prepareRollback||!store?.completeRollback||!bridge?.providerPassword||!adminAuth?.updateUserById)throw new Error('Migration dependencies required');
    const migrate=async profileId=>{
        if(!isProfileId(profileId)||!await readiness())throw new LoginError('temporarily_unavailable',503);
        const current=await store.read(profileId);if(!current)throw new LoginError('account_changed',409);
        const legacyDigest=current.legacyDigest||await normalizeLegacyCredential(current.publicCredential);
        const matches=async(value,expected)=>value===null?current.legacyDigest===expected:
            await normalizeLegacyCredential(value)===expected;
        const prepared=await store.prepare(profileId,legacyDigest,matches);
        const providerPassword=await bridge.providerPassword(profileId,legacyDigest);
        const changed=await adminAuth.updateUserById(prepared.authUserId,{password:providerPassword});
        if(changed?.error||changed?.data?.user?.id!==prepared.authUserId)throw new LoginError('temporarily_unavailable',503);
        await store.complete(prepared,matches);
        return {status:'migrated',profileId};
    };
    migrate.rollback=async profileId=>{
        if(!isProfileId(profileId)||!await readiness())throw new LoginError('temporarily_unavailable',503);
        const prepared=await store.prepareRollback(profileId);
        const changed=await adminAuth.updateUserById(prepared.authUserId,{password:prepared.legacyDigest});
        if(changed?.error||changed?.data?.user?.id!==prepared.authUserId)throw new LoginError('temporarily_unavailable',503);
        await store.completeRollback(prepared);return {status:'rolled_back',profileId};
    };
    migrate.batch=async(limit=25)=>{
        if(!store.listPending||!await readiness())throw new LoginError('temporarily_unavailable',503);
        const rows=await store.listPending(limit);let migrated=0;
        for(const row of rows){await migrate(row.profileId);migrated++;}
        return {status:'complete',migrated,remaining:rows.length===limit};
    };
    return migrate;
}

// Separate helper keeps legacy values out of orchestration logs and allows the
// store test/operator adapter to normalize before the durable prepare call.
export async function normalizeLegacyCredential(value){
    if(typeof value!=='string'||!value||value.length>512)throw new LoginError('account_changed',409);
    return /^[a-f0-9]{64}$/.test(value)?value:await digest(value);
}

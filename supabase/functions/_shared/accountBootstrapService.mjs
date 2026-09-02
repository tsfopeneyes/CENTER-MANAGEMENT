import {normalizeLegacyCredential} from './legacyMigrationService.mjs';
import {normalizeLoginName} from './loginSecurity.mjs';

// Existing guest/temporary profiles that already have a mapped Auth account and
// credential remain login-capable. Unmapped/blank-credential visit records are
// skipped naturally; only withdrawn profiles are excluded.
const excluded=row=>row.status==='withdrawn';
const canonicalRole=row=>row.isMaster===true||row.role==='admin'||row.userGroup==='관리자'?'admin':
    ['staff','Rok'].includes(row.role)||row.userGroup==='STAFF'?'staff':'member';

export function createAccountBootstrapService({store,keyFor,readiness=async()=>false,now=Date.now}){
    if(!store?.readBatch||!store?.bootstrap||typeof keyFor!=='function')throw new Error('Bootstrap dependencies required');
    return async()=>{
        if(!await readiness())throw new Error('Bootstrap is not ready');let after=null,bootstrapped=0,skipped=0;
        for(;;){const rows=await store.readBatch(after,50);if(!rows.length)break;
            for(const row of rows){after=row.profileId;
                if(excluded(row)||row.isAnonymous!==false||row.bannedUntil&&new Date(row.bannedUntil).getTime()>now()||
                    typeof row.email!=='string'||!row.email||typeof row.name!=='string'||!row.name.trim()||
                    typeof row.phone!=='string'||!row.phone||typeof row.publicCredential!=='string'||!row.publicCredential){skipped++;continue;}
                const legacyDigest=await normalizeLegacyCredential(row.publicCredential);
                await store.bootstrap({profileId:row.profileId,authUserId:row.authUserId,email:row.email,
                    nameKey:await keyFor('name',normalizeLoginName(row.name)),phoneKey:await keyFor('phone',row.phone.replace(/[\s()-]/g,'')),legacyDigest,
                    canonicalRole:canonicalRole(row)});bootstrapped++;
            }
            if(rows.length<50)break;
        }
        return {status:'complete',bootstrapped,skipped};
    };
}

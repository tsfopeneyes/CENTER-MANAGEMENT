import {LoginError} from './loginSecurity.mjs';

export function createLegacyMigrationStore(pool){
    const transaction=async work=>{const client=await pool.connect();let committed=false,discard=false;try{
        try{await client.query('BEGIN');}catch(error){discard=true;throw error;}await client.query("SET LOCAL statement_timeout='5s'");
        const result=await work(client.query.bind(client));await client.query('COMMIT');committed=true;return result;
    }finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain migration transaction'):undefined);}};
    return {
        async listPending(limit=25){
            if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new LoginError('temporarily_unavailable',503);
            const {rows}=await pool.query(`SELECT a.profile_id::text AS "profileId"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                WHERE a.status='active' AND a.mapping_verified AND i.enabled AND i.credential_mode='legacy_pending'
                ORDER BY a.profile_id LIMIT $1`,[limit]);
            return rows;
        },
        async read(profileId){const {rows}=await pool.query(`SELECT a.profile_id::text AS "profileId",a.auth_user_id::text AS "authUserId",
            i.credential_mode AS "credentialMode",u.password AS "publicCredential",legacy.password_digest AS "legacyDigest"
            FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
            JOIN public.users u ON u.id=a.profile_id LEFT JOIN account_security.legacy_credentials legacy USING(profile_id)
            WHERE a.profile_id=$1::uuid`,[profileId]);return rows[0]||null;},
        prepare(profileId,digest,matches){return transaction(async query=>{
            const {rows}=await query(`SELECT a.profile_id::text AS "profileId",a.auth_user_id::text AS "authUserId",a.status,
                a.mapping_verified AS "mappingVerified",i.login_email AS "loginEmail",i.credential_mode AS "credentialMode",
                u.password AS "publicCredential",legacy.password_digest AS "legacyDigest"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                JOIN public.users u ON u.id=a.profile_id LEFT JOIN account_security.legacy_credentials legacy USING(profile_id)
                WHERE a.profile_id=$1::uuid FOR UPDATE OF i,u`,[profileId]);const row=rows[0];
            if(rows.length!==1||row.status!=='active'||row.mappingVerified!==true||!row.loginEmail||
                !['legacy_pending','legacy_bridge'].includes(row.credentialMode)||
                (row.legacyDigest&&row.legacyDigest!==digest)||!(await matches(row.publicCredential,digest)))throw new LoginError('account_changed',409);
            if(!row.legacyDigest)await query(`INSERT INTO account_security.legacy_credentials(profile_id,password_digest) VALUES($1,$2)`,[profileId,digest]);
            if(row.credentialMode!=='legacy_pending')await query(`UPDATE account_security.login_identifiers SET credential_mode='legacy_pending' WHERE profile_id=$1`,[profileId]);
            return {...row,legacyDigest:digest,credentialMode:'legacy_pending'};
        });},
        complete(expected,matches){return transaction(async query=>{
            const {rows}=await query(`SELECT a.auth_user_id::text AS "authUserId",i.credential_mode AS "credentialMode",
                legacy.password_digest AS "legacyDigest",u.password AS "publicCredential"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                JOIN account_security.legacy_credentials legacy USING(profile_id) JOIN public.users u ON u.id=a.profile_id
                WHERE a.profile_id=$1::uuid FOR UPDATE OF i,u`,[expected.profileId]);const row=rows[0];
            if(rows.length!==1||row.authUserId!==expected.authUserId||row.legacyDigest!==expected.legacyDigest||
                !['legacy_pending','legacy_bridge'].includes(row.credentialMode)||!(await matches(row.publicCredential,row.legacyDigest)))
                throw new LoginError('account_changed',409);
            await query(`UPDATE account_security.login_identifiers SET credential_mode='legacy_bridge' WHERE profile_id=$1`,[expected.profileId]);
            await query(`UPDATE public.users SET password=NULL WHERE id=$1`,[expected.profileId]);
            return {status:'migrated'};
        });},
        prepareRollback(profileId){return transaction(async query=>{
            const {rows}=await query(`SELECT a.profile_id::text AS "profileId",a.auth_user_id::text AS "authUserId",
                i.credential_mode AS "credentialMode",legacy.password_digest AS "legacyDigest"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                JOIN account_security.legacy_credentials legacy USING(profile_id)
                WHERE a.profile_id=$1::uuid FOR UPDATE OF i`,[profileId]);const row=rows[0];
            if(rows.length!==1||!['legacy_bridge','legacy_pending'].includes(row.credentialMode))throw new LoginError('account_changed',409);
            if(row.credentialMode!=='legacy_pending')await query(`UPDATE account_security.login_identifiers SET credential_mode='legacy_pending' WHERE profile_id=$1`,[profileId]);
            return {...row,credentialMode:'legacy_pending'};
        });},
        completeRollback(expected){return transaction(async query=>{
            const {rows}=await query(`SELECT a.auth_user_id::text AS "authUserId",i.credential_mode AS "credentialMode",
                legacy.password_digest AS "legacyDigest" FROM account_security.accounts a
                JOIN account_security.login_identifiers i USING(profile_id) JOIN account_security.legacy_credentials legacy USING(profile_id)
                WHERE a.profile_id=$1::uuid FOR UPDATE OF i`,[expected.profileId]);const row=rows[0];
            if(rows.length!==1||row.authUserId!==expected.authUserId||row.credentialMode!=='legacy_pending'||row.legacyDigest!==expected.legacyDigest)
                throw new LoginError('account_changed',409);
            await query(`UPDATE public.users SET password=$2 WHERE id=$1`,[expected.profileId,expected.legacyDigest]);return {status:'rolled_back'};
        });}
    };
}

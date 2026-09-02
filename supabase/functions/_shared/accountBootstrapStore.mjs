import {LoginError} from './loginSecurity.mjs';

export function createAccountBootstrapStore(pool){
    const transaction=async work=>{const client=await pool.connect();let committed=false,discard=false;try{
        try{await client.query('BEGIN');}catch(error){discard=true;throw error;}await client.query("SET LOCAL statement_timeout='5s'");
        const result=await work(client.query.bind(client));await client.query('COMMIT');committed=true;return result;
    }finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain bootstrap transaction'):undefined);}};
    return {
        async readBatch(after=null,limit=50){const {rows}=await pool.query(`SELECT u.id::text AS "profileId",u.auth_user_id::text AS "authUserId",
            u.name,u.phone,u.password AS "publicCredential",u.user_group AS "userGroup",u.role,u.status,u.preferences,u.is_master AS "isMaster",
            au.email,au.is_anonymous AS "isAnonymous",au.banned_until AS "bannedUntil"
            -- Older valid accounts use the profile UUID itself as the Auth UUID
            -- and therefore have a null auth_user_id compatibility column.
            FROM public.users u JOIN auth.users au ON au.id=COALESCE(u.auth_user_id,u.id)
            WHERE ($1::uuid IS NULL OR u.id>$1::uuid) ORDER BY u.id LIMIT $2`,[after,limit]);return rows;},
        bootstrap(record){return transaction(async query=>{
            await query(`INSERT INTO account_security.accounts(profile_id,auth_user_id,mapping_verified,status,credential_version,must_change_password)
                VALUES($1,$2,true,'active',1,false) ON CONFLICT(profile_id) DO NOTHING`,[record.profileId,record.authUserId]);
            await query(`INSERT INTO account_security.login_identifiers(profile_id,login_email,name_key,phone_key,credential_mode,enabled)
                VALUES($1,$2,$3,$4,'legacy_pending',true) ON CONFLICT(profile_id) DO NOTHING`,
                [record.profileId,record.email,record.nameKey,record.phoneKey]);
            await query(`INSERT INTO account_security.legacy_credentials(profile_id,password_digest) VALUES($1,$2) ON CONFLICT(profile_id) DO NOTHING`,
                [record.profileId,record.legacyDigest]);
            await query(`INSERT INTO account_security.account_roles(profile_id,role,enabled) VALUES($1,$2,true) ON CONFLICT(profile_id) DO NOTHING`,
                [record.profileId,record.canonicalRole]);
            const {rows}=await query(`SELECT a.auth_user_id::text AS "authUserId",a.mapping_verified AS "mappingVerified",a.status,
                a.credential_version AS "credentialVersion",a.must_change_password AS "mustChangePassword",i.login_email AS "loginEmail",
                i.name_key AS "nameKey",i.phone_key AS "phoneKey",i.credential_mode AS "credentialMode",i.enabled,
                legacy.password_digest AS "legacyDigest",r.role,r.enabled AS "roleEnabled"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                JOIN account_security.legacy_credentials legacy USING(profile_id) JOIN account_security.account_roles r USING(profile_id)
                WHERE a.profile_id=$1`,[record.profileId]);const saved=rows[0];
            if(rows.length!==1||saved.authUserId!==record.authUserId||saved.mappingVerified!==true||saved.status!=='active'||
                saved.credentialVersion!==1||saved.mustChangePassword!==false||saved.loginEmail!==record.email||saved.nameKey!==record.nameKey||
                saved.phoneKey!==record.phoneKey||saved.credentialMode!=='legacy_pending'||saved.enabled!==true||
                saved.legacyDigest!==record.legacyDigest||saved.role!==record.canonicalRole||saved.roleEnabled!==true)
                throw new LoginError('account_changed',409);
            return {status:'bootstrapped'};
        });}
    };
}

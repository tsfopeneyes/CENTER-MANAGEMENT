import {LoginError,isProfileId} from './loginSecurity.mjs';

// Returns the current user's own explicit profile projection. Passwords,
// credential links, raw Auth metadata and arbitrary database columns are absent.
export function createProfileReadService({pool,verifyToken,readiness=async()=>false,now=Date.now}){
    return async({accessToken,profileId},{signal}={})=>{
        if(!isProfileId(profileId)||typeof accessToken!=='string'||!accessToken||accessToken.length>8192)
            throw new LoginError('invalid_request',400);
        const abort=()=>{if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);};
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);abort();
        const principal=await verifyToken(accessToken,{signal});
        if(!principal||!isProfileId(principal.authUserId)||!isProfileId(principal.sessionId)||principal.live!==true||
            principal.isAnonymous!==false||!Number.isFinite(principal.expiresAt)||principal.expiresAt<=now())
            throw new LoginError('invalid_login',401);
        const client=await pool.connect();let committed=false,discard=false;
        try{
            try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
            await client.query("SET LOCAL statement_timeout='3s'");await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
            await client.query("SELECT set_config('app.profile_id',$1,true)",[profileId]);abort();
            const {rows}=await client.query(`SELECT u.id,u.name,u.gender,u.school,u.church,u.birth,u.phone,u.phone_back4,
                u.user_group,u.status,u.guardian_name,u.guardian_phone,u.guardian_relation,u.preferences,u.bio,u.profile_image_url,
                CASE WHEN r.enabled AND r.role IN ('admin','staff') THEN r.role ELSE 'user' END AS role
                FROM public.users u JOIN account_security.accounts a ON a.profile_id=u.id
                JOIN account_security.session_assurances sa ON sa.profile_id=a.profile_id AND sa.auth_user_id=a.auth_user_id
                LEFT JOIN account_security.account_roles r ON r.profile_id=a.profile_id
                WHERE u.id=$3::uuid AND a.auth_user_id=$1::uuid AND sa.session_id=$2::uuid
                AND a.mapping_verified AND a.status='active' AND NOT a.must_change_password
                AND sa.status='trusted' AND sa.credential_version=a.credential_version
                AND to_timestamp($4::double precision/1000)>clock_timestamp()`,
                [principal.authUserId,principal.sessionId,profileId,principal.expiresAt]);
            if(rows.length!==1)throw new LoginError('forbidden',403);
            abort();await client.query('COMMIT');committed=true;return {protocol:1,status:'ok',profile:rows[0]};
        }catch(error){if(error instanceof LoginError)throw error;throw new LoginError('temporarily_unavailable',503);}
        finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain transaction'):undefined);}
    };
}

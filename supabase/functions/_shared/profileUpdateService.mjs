import {LoginError,isProfileId} from './loginSecurity.mjs';
import {validateSelfProfileUpdate} from './accountAuthorization.mjs';
import {normalizeProfileSchool} from './registrationForm.mjs';

// Standard profile metadata only. No role restriction is added: any verified
// active member (including staff/admin) can edit their own profile as before.
export function createProfileUpdateService({pool,verifyToken,readiness=async()=>false,profileImageOrigin,now=Date.now}) {
    return async({accessToken,profileId,updates},{signal}={})=>{
        if(!isProfileId(profileId) || typeof accessToken!=='string' || !accessToken || accessToken.length>8192)throw new LoginError('invalid_request',400);
        const patch=validateSelfProfileUpdate(updates);
        if(Object.hasOwn(patch,'profileImageUrl')){
            let url;try{url=new URL(patch.profileImageUrl);}catch{throw new LoginError('invalid_request',400);}
            if(url.origin!==profileImageOrigin||url.username||url.password||url.search||url.hash||
                !url.pathname.startsWith(`/storage/v1/object/public/avatars/profiles/${profileId}/`))throw new LoginError('invalid_request',400);
        }
        const abort=()=>{if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);};
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        abort();
        const principal=await verifyToken(accessToken,{signal});
        if(!principal || !isProfileId(principal.authUserId) || !isProfileId(principal.sessionId) ||
            principal.live!==true || principal.isAnonymous!==false || !Number.isFinite(principal.expiresAt) || principal.expiresAt<=now())
            throw new LoginError('invalid_login',401);
        abort();
        const client=await pool.connect();let committed=false,discard=false;
        try {
            try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
            await client.query("SET LOCAL statement_timeout='3s'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
            await client.query("SELECT set_config('app.profile_id',$1,true)",[profileId]);
            abort();
            // Authorization is part of this UPDATE, not just a previous HTTP
            // check. No application role, cached name or body user ID is trusted.
            const {rows}=await client.query(`UPDATE public.users u SET
                school=CASE WHEN $5::boolean THEN $6::text ELSE u.school END,
                church=CASE WHEN $7::boolean THEN $8::text ELSE u.church END,
                bio=CASE WHEN $9::boolean THEN $10::text ELSE u.bio END,
                preferences=CASE WHEN $11::boolean THEN COALESCE(u.preferences,'{}'::jsonb)
                    || jsonb_build_object('is_school_church',$12::boolean) ELSE u.preferences END,
                profile_image_url=CASE WHEN $13::boolean THEN $14::text ELSE u.profile_image_url END
                WHERE u.id=$3::uuid AND (NOT $11::boolean OR u.preferences IS NULL OR jsonb_typeof(u.preferences)='object')
                AND EXISTS(SELECT 1 FROM account_security.accounts a
                    JOIN account_security.session_assurances s ON s.profile_id=a.profile_id AND s.auth_user_id=a.auth_user_id
                    WHERE a.profile_id=u.id AND a.auth_user_id=$1::uuid AND s.session_id=$2::uuid
                    AND a.mapping_verified AND a.status='active' AND NOT a.must_change_password
                    AND s.status='trusted' AND s.credential_version=a.credential_version
                    AND s.valid_until>clock_timestamp() AND to_timestamp($4::double precision/1000)>clock_timestamp())
                RETURNING u.id,u.school,u.church,u.bio,u.profile_image_url,u.preferences->'is_school_church' AS "isSchoolChurch"`,
                [principal.authUserId,principal.sessionId,profileId,principal.expiresAt,
                    Object.hasOwn(patch,'school'),Object.hasOwn(patch,'school')?normalizeProfileSchool(patch.school.trim()):null,
                    Object.hasOwn(patch,'church'),patch.church??null,Object.hasOwn(patch,'bio'),patch.bio??null,
                    Object.hasOwn(patch,'isSchoolChurch'),patch.isSchoolChurch??null,
                    Object.hasOwn(patch,'profileImageUrl'),patch.profileImageUrl??null]);
            if(rows.length!==1)throw new LoginError('forbidden',403);
            abort();await client.query('COMMIT');committed=true;
            return {protocol:1,status:'saved',profile:rows[0]};
        }catch(error){
            if(error instanceof LoginError)throw error;
            throw new LoginError('temporarily_unavailable',503);
        }finally{
            if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}
            client.release(discard?new Error('Uncertain transaction'):undefined);
        }
    };
}

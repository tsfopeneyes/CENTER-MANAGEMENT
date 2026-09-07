import {LoginError,isProfileId} from './loginSecurity.mjs';

export function createMemberWithdrawalService({pool,authorize,readiness=async()=>false}){
    return async({accessToken,profileId},{signal}={})=>{
        if(!isProfileId(profileId))throw new LoginError('invalid_request',400);
        if(!await readiness()||signal?.aborted)throw new LoginError('temporarily_unavailable',503);
        const actor=await authorize({accessToken,action:'members.manage',targetProfileId:profileId});
        if(actor.actorProfileId===profileId)throw new LoginError('forbidden',403);
        const client=await pool.connect();let committed=false,discard=false;
        try{
            try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
            await client.query("SET LOCAL statement_timeout='5s'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout='7s'");
            await client.query("SELECT set_config('app.target_profile_id',$1,true)",[profileId]);
            const liveActor=(await client.query(`SELECT 1 FROM account_security.account_roles
                WHERE profile_id=$1 AND enabled AND role='admin'`,[actor.actorProfileId])).rows.length;
            if(liveActor!==1)throw new LoginError('forbidden',403);

            const target=await client.query(`SELECT u.id,u.user_group,a.profile_id AS account_profile_id
                FROM public.users u LEFT JOIN account_security.accounts a ON a.profile_id=u.id
                WHERE u.id=$1 FOR UPDATE OF u`,[profileId]);
            if(target.rows.length!==1)throw new LoginError('invalid_request',400);
            if(['STAFF','관리자'].includes(target.rows[0].user_group))throw new LoginError('forbidden',403);

            if(target.rows[0].account_profile_id){
                await client.query(`UPDATE account_security.login_identifiers SET enabled=false WHERE profile_id=$1`,[profileId]);
                await client.query(`UPDATE account_security.account_roles SET enabled=false WHERE profile_id=$1`,[profileId]);
                await client.query(`UPDATE account_security.session_assurances SET status='revoked' WHERE profile_id=$1`,[profileId]);
                await client.query(`DELETE FROM account_security.temporary_credentials WHERE profile_id=$1`,[profileId]);
                await client.query(`DELETE FROM account_security.legacy_credentials WHERE profile_id=$1`,[profileId]);
                await client.query(`UPDATE account_security.accounts SET status='blocked',must_change_password=true,
                    credential_version=credential_version+1 WHERE profile_id=$1`,[profileId]);
            }

            const label=`삭제된 회원 (${profileId.slice(0,8)})`;
            const changed=await client.query(`UPDATE public.users SET
                name=$2,gender=NULL,school=NULL,church=NULL,birth=NULL,phone='',phone_back4='',password=NULL,
                guardian_name=NULL,guardian_phone=NULL,guardian_relation=NULL,profile_image_url=NULL,fcm_token=NULL,
                bio=NULL,grade=NULL,memo=NULL,auth_user_id=NULL,status='withdrawn',
                preferences=jsonb_build_object('withdrawn_at',clock_timestamp(),'anonymized',true)
                WHERE id=$1 RETURNING id`,[profileId,label]);
            if(changed.rows.length!==1)throw new LoginError('account_changed',409);
            if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);
            await client.query('COMMIT');committed=true;
            return {protocol:1,status:'withdrawn',profileId};
        }catch(error){if(error instanceof LoginError)throw error;throw new LoginError('temporarily_unavailable',503);}
        finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain transaction'):undefined);}
    };
}

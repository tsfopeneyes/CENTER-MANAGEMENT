import {LoginError,isProfileId} from './loginSecurity.mjs';

export function createMemberAdminService({pool,authorize,readiness=async()=>false}){
    return async({accessToken,profileId,admin},{signal}={})=>{
        if(!isProfileId(profileId)||typeof admin!=='boolean')throw new LoginError('invalid_request',400);
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);
        const actor=await authorize({accessToken,action:'members.manage',targetProfileId:profileId});
        const client=await pool.connect();let committed=false,discard=false;
        try{
            try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
            await client.query("SET LOCAL statement_timeout='3s'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
            await client.query("SELECT set_config('app.target_profile_id',$1,true)",[profileId]);
            const liveActor=(await client.query(`SELECT 1 FROM account_security.account_roles
                WHERE profile_id=$1 AND enabled AND role='admin'`,[actor.actorProfileId])).rows.length;
            if(liveActor!==1)throw new LoginError('forbidden',403);
            const publicRole=admin?'admin':'user',canonicalRole=admin?'admin':'staff';
            const changed=await client.query(`UPDATE public.users SET role=$2 WHERE id=$1 AND user_group='STAFF' RETURNING id`,
                [profileId,publicRole]);
            if(changed.rows.length!==1)throw new LoginError('invalid_request',400);
            const role=await client.query(`UPDATE account_security.account_roles SET role=$2,enabled=true
                WHERE profile_id=$1 RETURNING profile_id`,[profileId,canonicalRole]);
            if(role.rows.length!==1)throw new LoginError('account_changed',409);
            const account=await client.query(`SELECT profile_id FROM account_security.accounts
                WHERE profile_id=$1 AND mapping_verified AND status='active'`,[profileId]);
            if(account.rows.length!==1)throw new LoginError('account_changed',409);
            if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);
            await client.query('COMMIT');committed=true;
            return {protocol:1,status:'saved',profileId,role:publicRole};
        }catch(error){if(error instanceof LoginError)throw error;throw new LoginError('temporarily_unavailable',503);}
        finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain transaction'):undefined);}
    };
}

import {LoginError} from './loginSecurity.mjs';

export function createCredentialConfirmationStore(pool){
    if(!pool?.connect)throw new Error('Confirmation pool required');
    return {
        async create({id,profileId,actorProfileId,lifetimeMs}){
            const client=await pool.connect();let committed=false,discard=false;
            try{
                try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
                await client.query("SET LOCAL statement_timeout='3s'");
                await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
                await client.query("SELECT set_config('app.actor_profile_id',$1,true)",[actorProfileId]);
                const {rows}=await client.query(`INSERT INTO account_security.credential_confirmations
                    (id,profile_id,actor_profile_id,purpose,valid_until)
                    VALUES($1,$2,$3,'password_reset',clock_timestamp()+($4 * interval '1 millisecond'))
                    RETURNING id,extract(epoch FROM valid_until)*1000 AS "validUntil"`,[id,profileId,actorProfileId,lifetimeMs]);
                if(rows.length!==1)throw new LoginError('forbidden',403);
                await client.query('COMMIT');committed=true;return {id:rows[0].id,validUntil:Number(rows[0].validUntil)};
            }catch(error){if(error instanceof LoginError)throw error;throw new LoginError('temporarily_unavailable',503);}
            finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain transaction'):undefined);}
        }
    };
}

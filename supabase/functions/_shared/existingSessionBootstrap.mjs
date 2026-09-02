export function createExistingSessionBootstrap({pool,readiness=async()=>false,graceMs=86400000,now=Date.now}){
    if(!pool?.connect||!Number.isFinite(graceMs)||graceMs<300000||graceMs>7*86400000)throw new Error('Session bootstrap dependencies required');
    return async()=>{
        if(!await readiness())throw new Error('Session bootstrap is not ready');const client=await pool.connect();let committed=false,discard=false;
        try{try{await client.query('BEGIN');}catch(error){discard=true;throw error;}await client.query("SET LOCAL statement_timeout='10s'");
            const saved=await client.query(`INSERT INTO account_security.session_assurances
                (session_id,auth_user_id,profile_id,credential_version,status,valid_until)
                SELECT s.id,a.auth_user_id,a.profile_id,a.credential_version,'trusted',to_timestamp($1::double precision/1000)
                FROM account_security.accounts a JOIN auth.sessions s ON s.user_id=a.auth_user_id
                JOIN auth.users au ON au.id=a.auth_user_id
                WHERE a.mapping_verified AND a.status='active' AND NOT a.must_change_password
                AND (s.not_after IS NULL OR s.not_after>clock_timestamp()) AND au.is_anonymous=false
                AND (au.banned_until IS NULL OR au.banned_until<=clock_timestamp())
                ON CONFLICT(session_id) DO NOTHING RETURNING session_id`,[now()+graceMs]);
            await client.query('COMMIT');committed=true;return {status:'complete',seeded:saved.rows.length};
        }finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain session bootstrap'):undefined);}
    };
}

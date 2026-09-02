// Binds a privileged server connection to one reviewed NOLOGIN role only
// inside a transaction. No application query can run before SET LOCAL ROLE.
export function createRoleBoundPool(pool,role){
    if(!pool?.connect||typeof role!=='string'||!/^account_(?:session_reader|login_worker|credential_worker|confirmation_writer|registration_worker|membership_worker|profile_worker|migration_worker|bootstrap_worker|member_admin_worker|merge_worker)$/.test(role))
        throw new Error('Reviewed database role required');
    const quoted='"'+role+'"';
    const connect=async()=>{
        const base=await pool.connect();let active=false,released=false;
        return {
            async query(text,values){
                if(released)throw new Error('Connection released');
                const command=typeof text==='string'?text.trim().replace(/;$/,'').toUpperCase():'';
                if(command==='BEGIN'||command==='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'){
                    if(active)throw new Error('Transaction already active');
                    const result=await base.query(text);
                    try{await base.query(`SET LOCAL ROLE ${quoted}`);active=true;return result;}
                    catch(error){try{await base.query('ROLLBACK');}catch{/* caller discards */}throw error;}
                }
                if(!active)throw new Error('Role-bound query requires a transaction');
                const result=await base.query(text,values);
                if(command==='COMMIT'||command==='ROLLBACK')active=false;
                return result;
            },
            release(error){released=true;base.release(error);}
        };
    };
    return {
        connect,
        async query(text,values){
            const client=await connect();let committed=false,discard=false;
            try{await client.query('BEGIN');const result=await client.query(text,values);await client.query('COMMIT');committed=true;return result;}
            finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain role transaction'):undefined);}
        }
    };
}

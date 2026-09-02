// Direct parameterized SELECTs only. No public-table fallback, RPC, credential
// mutation or migration. A missing private schema is an error, never approval.
// query must be a request-scoped transaction client, not a shared Pool.query.
export function createSessionReadStore(query) {
    const single = async (sql, values) => {
        const {rows} = await query(sql, values);
        if (rows.length > 1) throw new Error('Ambiguous account connection');
        return rows[0] || null;
    };
    return {
        loadRole: profileId => single(`
            SELECT profile_id::text AS "profileId",role,enabled
            FROM account_security.account_roles WHERE profile_id=$1::uuid`,[profileId]),
        // /auth/v1/user has already validated the bearer and its signed
        // session_id. Keep this adapter shape for callers without granting a
        // custom database role access to Supabase's managed auth schema.
        loadLiveSession: async (sessionId, authUserId) =>
            ({sessionId,authUserId,live:true}),
        loadAccount: authUserId => single(`
            SELECT auth_user_id::text AS "authUserId", profile_id::text AS "profileId",
                mapping_verified AS "mappingVerified", status,
                credential_version AS "credentialVersion", must_change_password AS "mustChangePassword"
            FROM account_security.accounts WHERE auth_user_id = $1::uuid`, [authUserId]),
        loadAssurance: sessionId => single(`
            SELECT session_id::text AS "sessionId", auth_user_id::text AS "authUserId",
                profile_id::text AS "profileId", credential_version AS "credentialVersion", status,
                (extract(epoch FROM valid_until) * 1000)::double precision AS "validUntil"
            FROM account_security.session_assurances WHERE session_id = $1::uuid`, [sessionId]),
    };
}

// Caller supplies a least-privilege connection pool with connection/statement
// timeouts configured. The transaction cannot modify the connected database.
export function createSessionSnapshot(pool) {
    return async operation => {
        const client = await pool.connect();
        let inTransaction = false, discard = true;
        try {
            await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
            inTransaction = true;
            discard = false;
            await client.query("SET LOCAL statement_timeout = '3000ms'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
            return await operation(createSessionReadStore((text, values) => client.query(text, values)));
        } finally {
            if (inTransaction) {
                try { await client.query('ROLLBACK'); } catch { discard = true; }
            }
            client.release(discard);
        }
    };
}

import {LoginError} from './loginSecurity.mjs';

// Separate least-privilege connection pool; not a browser Supabase client.
export function createCredentialStore(pool) {
    const transaction = async (work) => {
        const connection = await pool.connect();
        let complete = false, discard = false;
        try {
            try { await connection.query('BEGIN'); } catch (error) { discard = true; throw error; }
            await connection.query("SET LOCAL statement_timeout = '3s'");
            await connection.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
            const result = await work(connection.query.bind(connection));
            await connection.query('COMMIT'); complete = true;
            return result;
        } finally {
            if (!complete) try { await connection.query('ROLLBACK'); } catch { discard = true; }
            connection.release(discard ? new Error('Uncertain transaction') : undefined);
        }
    };
    return {
        async readActive(profileId) {
            const {rows}=await pool.query(`SELECT a.profile_id AS "profileId",a.auth_user_id AS "authUserId",
                a.credential_version AS "credentialVersion",i.login_email AS "loginEmail",i.credential_mode AS "credentialMode"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                WHERE a.profile_id=$1 AND a.status='active' AND a.mapping_verified AND NOT a.must_change_password
                AND i.enabled AND i.credential_mode IN ('legacy_pending','legacy_bridge','supabase_password')`,[profileId]);
            return rows[0]||null;
        },
        async readTemporary(profileId) {
            const {rows} = await pool.query(`SELECT a.profile_id AS "profileId", a.auth_user_id AS "authUserId",
                a.credential_version AS "credentialVersion", i.login_email AS "loginEmail",i.credential_mode AS "credentialMode",
                t.password_digest AS "temporaryDigest"
                FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                JOIN account_security.temporary_credentials t USING(profile_id)
                WHERE a.profile_id=$1 AND a.status='active' AND a.mapping_verified AND a.must_change_password
                AND i.enabled AND i.credential_mode IN ('legacy_pending','legacy_bridge','supabase_password')
                AND t.credential_version=a.credential_version
                AND (t.valid_until IS NULL OR t.valid_until>clock_timestamp())`, [profileId]);
            return rows[0] || null;
        },
        async reserve({id, account, kind, actorId, confirmationId = null, temporaryTtlMs = null, temporaryDigest = null}) {
            return transaction(async (query) => {
                const {rows} = await query(`SELECT a.*, i.login_email, i.enabled, i.credential_mode
                    FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
                    WHERE a.profile_id=$1 FOR UPDATE OF a`, [account.profileId]);
                const a = rows[0];
                if (!a || a.auth_user_id !== account.authUserId || a.credential_version !== account.credentialVersion ||
                    a.status !== 'active' || !a.mapping_verified || !a.enabled || !['legacy_pending','legacy_bridge','supabase_password'].includes(a.credential_mode) ||
                    (account.credentialMode && account.credentialMode !== a.credential_mode) ||
                    (account.loginEmail && account.loginEmail !== a.login_email)) throw new LoginError('account_changed',409);
                if (kind === 'temporary_change') {
                    const valid = await query(`SELECT 1 FROM account_security.temporary_credentials
                        WHERE profile_id=$1 AND credential_version=$2
                        AND (valid_until IS NULL OR valid_until>clock_timestamp())`, [a.profile_id,a.credential_version]);
                    if (!a.must_change_password || valid.rows.length !== 1) throw new LoginError('invalid_login',401);
                } else if (kind === 'self_change') {
                    if(a.must_change_password)throw new LoginError('account_changed',409);
                } else if (kind !== 'admin_reset') throw new Error('Invalid operation');
                const version = a.credential_version + 1;
                // Persist the block and epoch BEFORE crossing the Auth service boundary.
                await query(`UPDATE account_security.accounts SET status='blocked', must_change_password=true,
                    credential_version=$2 WHERE profile_id=$1`, [a.profile_id,version]);
                const inserted = await query(`INSERT INTO account_security.credential_operations
                    (id,profile_id,auth_user_id,credential_version,kind,actor_id,confirmation_id,temporary_until)
                    VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::double precision IS NULL THEN NULL
                        ELSE clock_timestamp()+($8 * interval '1 millisecond') END) RETURNING id`,
                    [id,a.profile_id,a.auth_user_id,version,kind,actorId,confirmationId,temporaryTtlMs]);
                return {id:inserted.rows[0].id,profileId:a.profile_id,authUserId:a.auth_user_id,credentialVersion:version,kind,
                    ...(kind==='admin_reset'?{temporaryDigest}: {})};
            });
        },
        async complete(operation) {
            return transaction(async (query) => {
                const {rows} = await query(`SELECT a.status,a.credential_version,o.kind,o.temporary_until,o.state
                    FROM account_security.accounts a JOIN account_security.credential_operations o USING(profile_id)
                    WHERE o.id=$1 AND a.profile_id=$2 AND a.auth_user_id=$3 AND o.auth_user_id=a.auth_user_id
                    AND o.credential_version=a.credential_version FOR UPDATE OF a,o`,
                    [operation.id,operation.profileId,operation.authUserId]);
                const row = rows[0];
                if (!row || row.state !== 'pending' || row.status !== 'blocked' ||
                    row.credential_version !== operation.credentialVersion || row.kind !== operation.kind) throw new LoginError('account_changed',409);
                const temporary = row.kind === 'admin_reset';
                if (temporary) {
                    if(typeof operation.temporaryDigest!=='string'||operation.temporaryDigest.length<32||operation.temporaryDigest.length>512)
                        throw new Error('Temporary digest required');
                    await query(`INSERT INTO account_security.temporary_credentials(profile_id,credential_version,valid_until,password_digest)
                        VALUES($1,$2,$3,$4) ON CONFLICT(profile_id) DO UPDATE SET credential_version=EXCLUDED.credential_version,
                        valid_until=EXCLUDED.valid_until,password_digest=EXCLUDED.password_digest`,
                        [operation.profileId,operation.credentialVersion,row.temporary_until,operation.temporaryDigest]);
                }
                // The old temporary row is kept for history but no longer matches the epoch after a change.
                await query(`UPDATE account_security.accounts SET status='active',must_change_password=$2
                    WHERE profile_id=$1`, [operation.profileId,temporary]);
                if(!temporary){
                    await query(`UPDATE account_security.login_identifiers SET credential_mode='supabase_password' WHERE profile_id=$1`,[operation.profileId]);
                    await query(`DELETE FROM account_security.legacy_credentials WHERE profile_id=$1`,[operation.profileId]);
                }
                await query(`UPDATE account_security.credential_operations SET state='completed',completed_at=clock_timestamp()
                    WHERE id=$1`, [operation.id]);
            });
        }
    };
}

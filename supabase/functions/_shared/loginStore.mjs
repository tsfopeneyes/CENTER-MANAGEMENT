import {LoginError} from './loginSecurity.mjs';

const projection = `a.profile_id::text AS "profileId", a.auth_user_id::text AS "authUserId",
    a.mapping_verified AS "mappingVerified", a.status, a.credential_version AS "credentialVersion",
    a.must_change_password AS "mustChangePassword", l.login_email AS "loginEmail",
    l.credential_mode AS "credentialMode", l.enabled, legacy.password_digest AS "legacyDigest"`;
const joins=`JOIN account_security.login_identifiers l USING(profile_id)
    LEFT JOIN account_security.legacy_credentials legacy USING(profile_id)`;

export function createLoginStore(pool) {
    const query = (sql, values) => pool.query(sql,values);
    return {
        async consumeLimit(key, limit) {
            if (!/^[a-f0-9]{64}$/.test(key) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid quota');
            const {rows} = await query(`INSERT INTO account_security.login_limits(key,bucket,attempts)
                VALUES($1,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                WHERE login_limits.attempts < $2 RETURNING attempts`,[key,limit]);
            return rows.length === 1;
        },
        async findByProfile(id) {
            return (await query(`SELECT ${projection} FROM account_security.accounts a ${joins} WHERE a.profile_id=$1::uuid LIMIT 2`,[id])).rows;
        },
        async findByLookup(nameKey, phoneKey) {
            return (await query(`SELECT ${projection} FROM account_security.accounts a ${joins}
                WHERE l.name_key=$1 AND ($2::text IS NULL OR l.phone_key=$2) LIMIT 2`,[nameKey,phoneKey])).rows;
        },
        async findCandidatesByName(nameKey) {
            const {rows}=await query(`SELECT u.id::text AS "profileId",u.name,u.school,u.user_group AS "userGroup"
                FROM account_security.login_identifiers i JOIN account_security.accounts a USING(profile_id)
                JOIN public.users u ON u.id=i.profile_id WHERE i.name_key=$1 AND i.enabled
                AND a.mapping_verified AND a.status='active' ORDER BY u.id LIMIT 20`,[nameKey]);
            return rows;
        },
        async findCandidatesPrepared(nameKey,clientKey,subjectKey){
            const {rows}=await query(`WITH client_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($2,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<20 RETURNING 1),
                subject_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($3,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<10 RETURNING 1),
                candidates AS (SELECT u.id::text AS "profileId",u.name,u.school,u.user_group AS "userGroup"
                    FROM account_security.login_identifiers i JOIN account_security.accounts a USING(profile_id)
                    JOIN public.users u ON u.id=i.profile_id WHERE i.name_key=$1 AND i.enabled
                    AND a.mapping_verified AND a.status='active' ORDER BY u.id LIMIT 20)
                SELECT EXISTS(SELECT 1 FROM client_limit) AND EXISTS(SELECT 1 FROM subject_limit) AS allowed,
                    COALESCE((SELECT json_agg(candidates) FROM candidates),'[]'::json) AS candidates`,[nameKey,clientKey,subjectKey]);
            return {allowed:rows[0]?.allowed===true,candidates:rows[0]?.candidates||[]};
        },
        async prepareByProfile(profileId,clientKey,subjectKey,accountKey){
            const {rows}=await query(`WITH client_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($2,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<20 RETURNING 1),
                subject_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($3,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<10 RETURNING 1),
                account_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($4,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<5 RETURNING 1),
                candidates AS (SELECT ${projection} FROM account_security.accounts a ${joins}
                    WHERE a.profile_id=$1::uuid LIMIT 2)
                SELECT EXISTS(SELECT 1 FROM client_limit) AND EXISTS(SELECT 1 FROM subject_limit)
                    AND EXISTS(SELECT 1 FROM account_limit) AS allowed,
                    COALESCE((SELECT json_agg(candidates) FROM candidates),'[]'::json) AS candidates`,
                [profileId,clientKey,subjectKey,accountKey]);
            return {allowed:rows[0]?.allowed===true,candidates:rows[0]?.candidates||[]};
        },
        async prepareByLookup(nameKey,phoneKey,clientKey,subjectKey){
            const {rows}=await query(`WITH client_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($3,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<20 RETURNING 1),
                subject_limit AS (
                    INSERT INTO account_security.login_limits(key,bucket,attempts)
                    VALUES($4,floor(extract(epoch FROM statement_timestamp())/600)::bigint,1)
                    ON CONFLICT(key,bucket) DO UPDATE SET attempts=login_limits.attempts+1
                    WHERE login_limits.attempts<10 RETURNING 1),
                candidates AS (SELECT ${projection} FROM account_security.accounts a ${joins}
                    WHERE l.name_key=$1 AND ($2::text IS NULL OR l.phone_key=$2) LIMIT 2)
                SELECT EXISTS(SELECT 1 FROM client_limit) AND EXISTS(SELECT 1 FROM subject_limit) AS allowed,
                    COALESCE((SELECT json_agg(candidates) FROM candidates),'[]'::json) AS candidates`,
                [nameKey,phoneKey,clientKey,subjectKey]);
            return {allowed:rows[0]?.allowed===true,candidates:rows[0]?.candidates||[]};
        },
        async grantAssurance(expected, principal, validUntil, {signal} = {}) {
            const client = await pool.connect();
            let began = false, committed = false, discard = true;
            try {
                await client.query('BEGIN'); began = true; discard = false;
                await client.query("SET LOCAL statement_timeout='3000ms'");
                await client.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
                if (signal?.aborted) throw new LoginError('temporarily_unavailable',503);
                const {rows} = await client.query(`SELECT ${projection} FROM account_security.accounts a ${joins}
                    WHERE a.profile_id=$1::uuid FOR UPDATE OF a`,[expected.profileId]);
                const current = rows[0];
                if (rows.length !== 1 || current.authUserId !== expected.authUserId || current.authUserId !== principal.authUserId ||
                    current.credentialVersion !== expected.credentialVersion || current.loginEmail !== expected.loginEmail ||
                    current.status !== 'active' || !current.mappingVerified || current.mustChangePassword !== false ||
                    !current.enabled || current.credentialMode !== expected.credentialMode ||
                    !['legacy_pending','legacy_bridge','supabase_password'].includes(current.credentialMode) ||
                    current.legacyDigest !== expected.legacyDigest) throw new LoginError('account_changed',409);
                if (principal.live!==true || principal.expiresAt <= Date.now()) throw new LoginError('account_changed',409);
                const saved = await client.query(`INSERT INTO account_security.session_assurances
                    (session_id,auth_user_id,profile_id,credential_version,status,valid_until)
                    VALUES($1::uuid,$2::uuid,$3::uuid,$4,'trusted',to_timestamp($5::double precision/1000))
                    ON CONFLICT(session_id) DO NOTHING RETURNING session_id`,
                    [principal.sessionId,principal.authUserId,current.profileId,current.credentialVersion,validUntil]);
                if (saved.rows.length !== 1) throw new LoginError('account_changed',409);
                if (signal?.aborted) throw new LoginError('temporarily_unavailable',503);
                await client.query('COMMIT'); committed = true;
            } finally {
                if (began && !committed) { try { await client.query('ROLLBACK'); } catch { discard = true; } }
                client.release(discard);
            }
        },
    };
}

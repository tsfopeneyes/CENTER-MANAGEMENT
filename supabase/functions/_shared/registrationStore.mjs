import {LoginError} from './loginSecurity.mjs';

const projection = `id,request_key AS "requestKey",identity_key AS "identityKey",details_key AS "detailsKey",
    login_email AS "loginEmail",state,auth_user_id AS "authUserId",valid_until>clock_timestamp() AS usable`;

export function createRegistrationStore(pool) {
    return {
        async reserve({id,requestKey,identityKey,detailsKey,loginEmail,lifetimeMs}) {
            // Each statement autocommits. A lost INSERT response is recovered by
            // request_key, and a lost claim response must NEVER trigger create.
            await pool.query(`INSERT INTO account_security.registration_operations
                (id,request_key,identity_key,details_key,login_email,valid_until)
                VALUES($1,$2,$3,$4,$5,clock_timestamp()+($6 * interval '1 millisecond'))
                ON CONFLICT DO NOTHING`,[id,requestKey,identityKey,detailsKey,loginEmail,lifetimeMs]);
            const {rows}=await pool.query(`SELECT ${projection} FROM account_security.registration_operations WHERE request_key=$1`,[requestKey]);
            const row=rows[0];
            if(!row || row.identityKey!==identityKey || row.detailsKey!==detailsKey || !row.usable) {
                throw new LoginError('registration_review_required',409);
            }
            return row;
        },
        async claim(operation) {
            const {rows}=await pool.query(`UPDATE account_security.registration_operations SET state='creating'
                WHERE id=$1 AND request_key=$2 AND state='reserved' AND valid_until>clock_timestamp() RETURNING id`,
                [operation.id,operation.requestKey]);
            return rows.length===1;
        },
        async markReady(operation,authUserId) {
            // Recheck the authoritative binding in the write itself. No email-only
            // adoption, metadata from public users, or account/profile linking.
            const {rows}=await pool.query(`UPDATE account_security.registration_operations o
                SET state='auth_ready',auth_user_id=$3,ready_at=COALESCE(ready_at,clock_timestamp())
                WHERE o.id=$1 AND o.request_key=$2 AND o.valid_until>clock_timestamp()
                AND (o.state='creating' OR (o.state='auth_ready' AND o.auth_user_id=$3))
                RETURNING o.id`,[operation.id,operation.requestKey,authUserId]);
            if(rows.length!==1)throw new LoginError('registration_review_required',409);
        }
    };
}

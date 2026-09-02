import {LoginError,isProfileId,normalizeLoginName} from './loginSecurity.mjs';

// Server-only final stage. accessToken is the new password-verified session held
// by the registration server, never obtained from a cached member profile.
export function createMembershipFinalizer({pool,keyFor,validateForm,verifyToken,readiness=async()=>false,now=Date.now}) {
    const review=()=>new LoginError('registration_review_required',409);
    const abort=(signal)=>{if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);};
    return async({operationId,requestSecret,submission,accessToken},{signal}={})=>{
        if(!isProfileId(operationId) || typeof requestSecret!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(requestSecret) ||
            typeof accessToken!=='string' || !accessToken || accessToken.length>8192)throw new LoginError('invalid_request',400);
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        abort(signal);
        const {profile,canonicalDetails,guestUserId:requestedGuestUserId}=validateForm(submission);
        const principal=await verifyToken(accessToken,{signal});
        if(!principal || !isProfileId(principal.authUserId) || !isProfileId(principal.sessionId) ||
            principal.live!==true || principal.isAnonymous!==false || !Number.isFinite(principal.expiresAt) ||
            principal.expiresAt<=now()+30000)throw new LoginError('invalid_login',401);
        const requestKey=await keyFor('registration-request',requestSecret);
        const detailsKey=await keyFor('registration-details',canonicalDetails);
        const nameKey=await keyFor('name',normalizeLoginName(profile.name));
        const phoneKey=await keyFor('phone',profile.phone.replace(/-/g,''));
        let guestUserId=requestedGuestUserId;
        let targetProfileId=guestUserId||principal.authUserId;
        abort(signal);
        const client=await pool.connect();
        let committed=false,discard=false;
        try {
            try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
            await client.query("SET LOCAL statement_timeout='3s'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
            const query=client.query.bind(client);
            const {rows}=await query(`SELECT o.*,o.valid_until>clock_timestamp() AS usable
                FROM account_security.registration_operations o WHERE o.id=$1 FOR UPDATE`,[operationId]);
            const operation=rows[0];
            if(!operation || operation.request_key!==requestKey || operation.details_key!==detailsKey ||
                operation.state!=='auth_ready' || operation.auth_user_id!==principal.authUserId)throw review();
            // The registration service created this exact Auth user and the
            // bearer was just validated by /auth/v1/user. The durable operation
            // binding below prevents adopting another account.
            const receipt=(await query(`SELECT * FROM account_security.membership_receipts WHERE operation_id=$1`,[operationId])).rows[0];
            if(receipt) {
                if(receipt.auth_user_id!==principal.authUserId ||
                    receipt.details_key!==detailsKey || receipt.phone_key!==phoneKey)throw review();
                // A retry returns the original result; never overwrites a profile,
                // reactivates a blocked member or reverses later admin decisions.
                abort(signal);
                await query('COMMIT');committed=true;
                return {protocol:1,status:receipt.result};
            }
            if(!operation.usable)throw review();
            const temporary=(await query(`SELECT u.id,u.name,u.birth,u.phone FROM public.users u
                LEFT JOIN account_security.accounts a ON a.profile_id=u.id
                WHERE a.profile_id IS NULL AND u.auth_user_id IS NULL
                AND (u.preferences->>'is_temporary'='true' OR u.user_group IN ('게스트','미가입'))
                AND (u.id=$1::uuid OR regexp_replace(COALESCE(u.phone,''),'[^0-9]','','g')=$2)`,
                [requestedGuestUserId||principal.authUserId,profile.phone.replace(/-/g,'')])).rows;
            const exact=item=>item.name?.trim().normalize('NFC')===profile.name.trim().normalize('NFC')&&
                item.birth===profile.birth&&String(item.phone||'').replace(/[^0-9]/g,'')===profile.phone.replace(/-/g,'');
            if(guestUserId&&!exact(temporary.find(item=>item.id===guestUserId)))guestUserId=null;
            if(!requestedGuestUserId){const compatible=temporary.filter(exact);if(compatible.length===1)guestUserId=compatible[0].id;}
            targetProfileId=guestUserId||principal.authUserId;
            const reviewCandidates=[...new Set(temporary.map(item=>item.id).filter(id=>id!==guestUserId))];
            const reviewReason=reviewCandidates.length?(requestedGuestUserId&&!guestUserId?'details_mismatch':'ambiguous'):null;
            if(guestUserId){
                await query("SELECT set_config('app.guest_profile_id',$1,true)",[guestUserId]);
                const guest=(await query(`SELECT id,name,birth,phone,user_group,preferences,auth_user_id FROM public.users
                    WHERE id=$1 FOR UPDATE`,[guestUserId])).rows[0];
                const alreadyMapped=(await query(`SELECT 1 FROM account_security.accounts WHERE profile_id=$1`,[guestUserId])).rows.length;
                if(!guest||alreadyMapped||guest.auth_user_id!==null||guest.name?.trim().normalize('NFC')!==profile.name.trim().normalize('NFC')||
                    guest.birth!==profile.birth||String(guest.phone||'').replace(/[^0-9]/g,'')!==profile.phone.replace(/-/g,'')||
                    !(guest.preferences?.is_temporary===true||['게스트','미가입'].includes(guest.user_group)))throw review();
                const duplicate=(await query(`SELECT 1 FROM public.users u WHERE id<>$1
                    AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=$2
                    AND NOT (COALESCE(u.preferences->>'is_temporary'='true',false)
                        OR COALESCE(u.user_group IN ('게스트','미가입'),false)) LIMIT 1`,
                    [guestUserId,profile.phone.replace(/-/g,'')])).rows.length;
                if(duplicate)throw review();
            } else {
                const existing=await query(`SELECT id FROM public.users u WHERE id=$1
                    OR (regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=$2
                    AND NOT (COALESCE(u.preferences->>'is_temporary'='true',false)
                        OR COALESCE(u.user_group IN ('게스트','미가입'),false))) LIMIT 1`,
                    [principal.authUserId,profile.phone.replace(/-/g,'')]);
                if(existing.rows.length)throw review();
            }
            abort(signal);
            if(guestUserId)await query(`UPDATE public.users SET auth_user_id=$2,name=$3,gender=$4,school=$5,church=$6,birth=$7,
                phone=$8,phone_back4=$9,user_group=$10,role='user',status=$11,guardian_name=$12,guardian_phone=$13,
                guardian_relation=$14,preferences=COALESCE(preferences,'{}'::jsonb)||$15::jsonb,password=NULL,
                memo=CASE WHEN memo IS NULL OR memo='' THEN '[자동병합: '||current_date::text||']'
                    ELSE memo||E'\n[자동병합: '||current_date::text||']' END WHERE id=$1`,
                [guestUserId,principal.authUserId,profile.name,profile.gender,profile.school,profile.church,profile.birth,
                    profile.phone,profile.phone_back4,profile.user_group,profile.status,profile.guardian_name,
                    profile.guardian_phone,profile.guardian_relation,profile.preferences]);
            else await query(`INSERT INTO public.users
                (id,auth_user_id,name,gender,school,church,birth,phone,phone_back4,user_group,role,status,
                    guardian_name,guardian_phone,guardian_relation,preferences)
                VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,'user',$10,$11,$12,$13,$14)`,
                [principal.authUserId,profile.name,profile.gender,profile.school,profile.church,profile.birth,
                    profile.phone,profile.phone_back4,profile.user_group,profile.status,profile.guardian_name,
                    profile.guardian_phone,profile.guardian_relation,profile.preferences]);
            await query(`INSERT INTO account_security.accounts
                (profile_id,auth_user_id,mapping_verified,status,credential_version,must_change_password)
                VALUES($1,$2,true,'active',1,false)`,[targetProfileId,principal.authUserId]);
            await query(`INSERT INTO account_security.login_identifiers
                (profile_id,login_email,name_key,phone_key,credential_mode,enabled)
                VALUES($1,$2,$3,$4,'supabase_password',$5)`,
                [targetProfileId,operation.login_email,nameKey,phoneKey,true]);
            if(reviewCandidates.length)await query(`INSERT INTO account_security.guest_link_reviews
                (operation_id,new_profile_id,candidate_profile_ids,reason) VALUES($1,$2,$3::uuid[],$4)`,
                [operationId,targetProfileId,reviewCandidates,reviewReason]);
            const result='registered';
            await query(`INSERT INTO account_security.membership_receipts
                (operation_id,profile_id,auth_user_id,phone_key,details_key,result) VALUES($1,$2,$3,$4,$5,$6)`,
                [operationId,targetProfileId,principal.authUserId,phoneKey,detailsKey,result]);
            abort(signal);
            await query('COMMIT');committed=true;
            return {protocol:1,status:result};
        } catch(error) {
            if(error instanceof LoginError)throw error;
            // No schema repair, Auth deletion, public password write or raw SQL
            // error leak. Lost COMMIT responses are resolved via the receipt.
            throw new LoginError('temporarily_unavailable',503);
        } finally {
            if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}
            client.release(discard?new Error('Uncertain transaction'):undefined);
        }
    };
}

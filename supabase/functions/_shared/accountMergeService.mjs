import {LoginError,isProfileId} from './loginSecurity.mjs';

const columns=Object.freeze([
    ['logs','user_id'],['haifn_transactions','user_id'],['notice_responses','user_id'],['user_badges','user_id'],
    ['program_feedback','user_id'],['guest_posts','user_id'],['guestbook_posts','user_id'],['guest_post_reactions','user_id'],
    ['notice_poll_responses','user_id'],['notice_reactions','user_id'],['community_posts','user_id'],
    ['community_comments','user_id'],['community_likes','user_id'],['user_challenges','user_id'],['visit_notes','user_id'],
    ['checkin_surveys','user_id'],['comments','user_id'],['guest_comments','user_id'],['notice_likes','user_id'],
    ['rental_bookings','user_id'],['store_orders','user_id'],['user_notification_reads','user_id'],['center_daily_chats','user_id'],
    ['admin_templates','user_id'],['app_notifications','user_id'],['app_notifications','sender_id'],
    ['messages','sender_id'],['messages','receiver_id'],['coffee_chats','student_id'],
    ['calling_forest_progress','student_id']
]);
const ident=value=>'"'+String(value).replaceAll('"','""')+'"';

export function createAccountMergeService({pool,authorize,readiness=async()=>false}){
    const merge=async({accessToken,requestId,sourceProfileId,targetProfileId},{signal}={})=>{
        if(!isProfileId(requestId)||!isProfileId(sourceProfileId)||!isProfileId(targetProfileId)||sourceProfileId===targetProfileId)
            throw new LoginError('invalid_request',400);
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        const actor=await authorize({accessToken,action:'members.manage',targetProfileId});
        if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);
        const client=await pool.connect();let committed=false,discard=false;
        try{
            try{await client.query('BEGIN');}catch(error){discard=true;throw error;}
            await client.query("SET LOCAL statement_timeout='8s'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
            const prior=(await client.query('SELECT * FROM account_security.account_merge_receipts WHERE request_id=$1',[requestId])).rows[0];
            if(prior){if(prior.source_profile_id!==sourceProfileId||prior.target_profile_id!==targetProfileId||prior.actor_profile_id!==actor.actorProfileId)
                throw new LoginError('account_changed',409);await client.query('COMMIT');committed=true;return {protocol:1,status:'merged'};}
            const liveActor=(await client.query("SELECT 1 FROM account_security.account_roles WHERE profile_id=$1 AND enabled AND role='admin'",[actor.actorProfileId])).rows.length;
            if(liveActor!==1)throw new LoginError('forbidden',403);
            await client.query("SELECT set_config('app.merge_source_id',$1,true)",[sourceProfileId]);
            await client.query("SELECT set_config('app.merge_target_id',$1,true)",[targetProfileId]);
            const profiles=(await client.query(`SELECT id,auth_user_id,user_group,preferences,current_haifn,school FROM public.users
                WHERE id=ANY($1::uuid[]) ORDER BY id`,[[sourceProfileId,targetProfileId]])).rows;
            const source=profiles.find(item=>item.id===sourceProfileId),target=profiles.find(item=>item.id===targetProfileId);
            const temporary=source&&(source.preferences?.is_temporary===true||['게스트','미가입'].includes(source.user_group));
            if(!temporary||source.auth_user_id!=null||!target||target.preferences?.is_temporary===true||['게스트','미가입'].includes(target.user_group))
                throw new LoginError('invalid_request',400);
            const sourceMapped=(await client.query('SELECT 1 FROM account_security.accounts WHERE profile_id=$1',[sourceProfileId])).rows.length;
            const targetMapped=(await client.query(`SELECT 1 FROM account_security.accounts a JOIN account_security.account_roles r USING(profile_id)
                WHERE a.profile_id=$1 AND a.mapping_verified AND a.status='active' AND r.enabled`,[targetProfileId])).rows.length;
            if(sourceMapped||targetMapped!==1)throw new LoginError('account_changed',409);
            const reviewed=new Set(columns.map(([table,column])=>`${table}:${column}`));
            const references=(await client.query(`SELECT c.relname AS table_name,a.attname AS column_name
                FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=fk.conkey[1]
                WHERE fk.contype='f' AND fk.confrelid='public.users'::regclass AND n.nspname='public'
                AND cardinality(fk.conkey)=1 AND cardinality(fk.confkey)=1`)).rows;
            for(const reference of references){if(reviewed.has(`${reference.table_name}:${reference.column_name}`))continue;
                const affected=(await client.query(`SELECT 1 FROM public.${ident(reference.table_name)}
                    WHERE ${ident(reference.column_name)}=$1 LIMIT 1`,[sourceProfileId])).rows.length;
                if(affected)throw new LoginError('account_changed',409);
            }
            await client.query(`UPDATE public.users SET current_haifn=COALESCE(current_haifn,0)+GREATEST($2::numeric,0),
                school=CASE WHEN COALESCE(school,'')='' THEN $3 ELSE school END WHERE id=$1`,
                [targetProfileId,Number(source.current_haifn)||0,source.school||null]);
            for(const [table,column] of columns){
                const present=(await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS present`,[table,column])).rows[0]?.present;
                if(!present)continue;
                const rows=(await client.query(`SELECT ctid::text AS tid FROM public.${ident(table)} WHERE ${ident(column)}=$1 FOR UPDATE`,[sourceProfileId])).rows;
                for(const row of rows){
                    await client.query('SAVEPOINT merge_row');
                    try{await client.query(`UPDATE public.${ident(table)} SET ${ident(column)}=$1 WHERE ctid=$2::tid`,[targetProfileId,row.tid]);
                        await client.query('RELEASE SAVEPOINT merge_row');}
                    catch(error){await client.query('ROLLBACK TO SAVEPOINT merge_row');if(error?.code!=='23505')throw error;
                        await client.query(`DELETE FROM public.${ident(table)} WHERE ctid=$1::tid`,[row.tid]);await client.query('RELEASE SAVEPOINT merge_row');}
                }
            }
            const schoolLogs=(await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                AND table_name='school_logs' AND column_name='participant_ids') AS present`)).rows[0]?.present;
            if(schoolLogs)await client.query(`UPDATE public.school_logs s SET participant_ids=(SELECT array_agg(value ORDER BY first_pos)
                FROM (SELECT value,min(position) first_pos FROM unnest(array_replace(s.participant_ids,$1,$2)) WITH ORDINALITY x(value,position)
                GROUP BY value) dedup) WHERE s.participant_ids @> ARRAY[$1]::uuid[]`,[sourceProfileId,targetProfileId]);
            const notificationGroups=(await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                AND table_name='app_notifications' AND column_name='target_group') AS present`)).rows[0]?.present;
            if(notificationGroups)await client.query(`UPDATE public.app_notifications SET target_group='USER_'||$2::text
                WHERE target_group='USER_'||$1::text`,[sourceProfileId,targetProfileId]);
            const removed=await client.query('DELETE FROM public.users WHERE id=$1 RETURNING id',[sourceProfileId]);
            if(removed.rows.length!==1)throw new LoginError('account_changed',409);
            await client.query(`UPDATE account_security.guest_link_reviews SET
                candidate_profile_ids=CASE WHEN cardinality(candidate_profile_ids)=1 THEN candidate_profile_ids
                    ELSE array_remove(candidate_profile_ids,$1::uuid) END,
                status=CASE WHEN cardinality(candidate_profile_ids)=1 THEN 'resolved' ELSE status END,
                resolved_at=CASE WHEN cardinality(candidate_profile_ids)=1 THEN clock_timestamp() ELSE resolved_at END,
                resolved_by=CASE WHEN cardinality(candidate_profile_ids)=1 THEN $3::uuid ELSE resolved_by END
                WHERE status='pending' AND new_profile_id=$2 AND $1=ANY(candidate_profile_ids)`,
                [sourceProfileId,targetProfileId,actor.actorProfileId]);
            await client.query(`INSERT INTO account_security.account_merge_receipts
                (request_id,source_profile_id,target_profile_id,actor_profile_id,status) VALUES($1,$2,$3,$4,'completed')`,
                [requestId,sourceProfileId,targetProfileId,actor.actorProfileId]);
            if(signal?.aborted)throw new LoginError('temporarily_unavailable',503);
            await client.query('COMMIT');committed=true;return {protocol:1,status:'merged'};
        }catch(error){if(error instanceof LoginError)throw error;throw new LoginError('temporarily_unavailable',503);}
        finally{if(!committed)try{await client.query('ROLLBACK');}catch{discard=true;}client.release(discard?new Error('Uncertain merge transaction'):undefined);}
    };
    const listReviews=async({accessToken})=>{
        if(!await readiness())throw new LoginError('temporarily_unavailable',503);
        await authorize({accessToken,action:'members.manage',targetProfileId:null});
        const {rows}=await pool.query(`SELECT r.operation_id AS "reviewId",r.new_profile_id AS "newProfileId",r.reason,
            new_profile.name AS "newProfileName",new_profile.phone AS "newProfilePhone",
            COALESCE(jsonb_agg(jsonb_build_object('profileId',u.id,'name',u.name,'birth',u.birth,
                'phone',u.phone,'userGroup',u.user_group) ORDER BY u.name) FILTER(WHERE u.id IS NOT NULL),'[]'::jsonb) AS candidates
            FROM account_security.guest_link_reviews r
            JOIN public.users new_profile ON new_profile.id=r.new_profile_id
            LEFT JOIN LATERAL unnest(r.candidate_profile_ids) candidate(id) ON true
            LEFT JOIN public.users u ON u.id=candidate.id
            WHERE r.status='pending' GROUP BY r.operation_id,r.new_profile_id,r.reason,r.created_at,new_profile.name,new_profile.phone ORDER BY r.created_at`);
        return {protocol:1,status:'ok',reviews:rows};
    };
    return Object.freeze({merge,listReviews});
}

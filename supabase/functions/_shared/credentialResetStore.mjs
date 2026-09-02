export function createCredentialResetStore(query){
    if(typeof query!=='function')throw new Error('Credential reset query required');
    return async({confirmationId,profileId,actorProfileId})=>{
        const {rows}=await query(`SELECT c.id,c.profile_id AS "profileId",c.actor_profile_id AS "actorProfileId",
            c.purpose,extract(epoch FROM c.valid_until)*1000 AS "validUntil",a.auth_user_id AS "authUserId",
            a.credential_version AS "credentialVersion",u.phone,u.phone_back4 AS "phoneBack4"
            FROM account_security.credential_confirmations c
            JOIN account_security.accounts a ON a.profile_id=c.profile_id
            JOIN public.users u ON u.id=c.profile_id
            WHERE c.id=$1 AND c.profile_id=$2 AND c.actor_profile_id=$3 AND c.valid_until>clock_timestamp()
            AND a.status='active' AND a.mapping_verified`,[confirmationId,profileId,actorProfileId]);
        const row=rows[0];if(!row)return null;
        const digits=String(row.phone||'').replace(/\D/g,''),phoneLast4=digits.length>=4?digits.slice(-4):String(row.phoneBack4||'');
        if(!/^[0-9]{4}$/.test(phoneLast4))return null;
        return {id:row.id,profileId:row.profileId,actorProfileId:row.actorProfileId,purpose:row.purpose,
            validUntil:Number(row.validUntil),phoneLast4,account:{profileId:row.profileId,authUserId:row.authUserId,
                credentialVersion:row.credentialVersion}};
    };
}

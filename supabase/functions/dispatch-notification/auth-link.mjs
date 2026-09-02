// Called only AFTER server-side password verification. No RPC, password reset,
// account deletion or email-only ownership inference occurs here.
export async function resolveAuthLink(profile, passwordHash, store) {
    const direct=await store.getAuth(profile.id);
    const linked=profile.auth_user_id && profile.auth_user_id!==profile.id
        ? await store.getAuth(profile.auth_user_id) : direct;
    if(profile.auth_user_id && !linked)throw new Error('기존 인증 연결을 확인해야 합니다. 새 계정은 만들지 않았습니다.');
    // Keep explicit links stable for already-linked accounts; do not silently
    // merge duplicate identities or move their sessions/permissions/data.
    let chosen=profile.auth_user_id?linked:direct;
    if(!chosen) {
        // Classification must not lock an already-existing login out. Only
        // provisioning a new identity requires completed membership.
        if(profile.preferences?.is_temporary===true || profile.user_group==='게스트' || profile.user_group==='미가입')
            throw new Error('방문·임시 계정은 회원 가입을 먼저 완료해주세요.');
        const email=`${profile.id}@youth-access.app`;
        const phone=String(profile.phone||'').replace(/\D/g,'');
        const candidates=await store.findAuth([email,...(phone?[`${phone}@youth-access.app`]:[])]);
        const recovered=candidates.filter(a=>a.email===email && a.app_metadata?.legacy_profile_id===profile.id);
        if(candidates.some(a=>!recovered.some(r=>r.id===a.id)) || recovered.length>1)
            throw new Error('기존 인증 계정 후보가 있어 확인이 필요합니다. 새 계정은 만들지 않았습니다.');
        chosen=recovered[0];
        if(!chosen) {
            // Stable per-profile email is unique at Auth level. Concurrent
            // requests and retries cannot mint another identity for this profile.
            try {chosen=await store.createAuth({email,password:passwordHash,email_confirm:true,app_metadata:{legacy_profile_id:profile.id}});}
            catch {
                const retry=await store.findAuth([email]);
                if(retry.length!==1 || retry[0].app_metadata?.legacy_profile_id!==profile.id)
                    throw new Error('인증 연결을 완료하지 못했습니다. 새 계정 생성을 반복하지 마세요.');
                chosen=retry[0];
            }
        }
    }
    if(!chosen?.id || !chosen.email || chosen.is_anonymous ||
        (chosen.banned_until && Date.parse(chosen.banned_until)>Date.now()))throw new Error('사용할 수 없는 인증 계정입니다.');
    if(await store.hasOtherOwner(chosen.id,profile.id))throw new Error('다른 회원과 인증 연결이 겹쳐 확인이 필요합니다.');
    if(!profile.auth_user_id)await store.linkIfEmpty(profile.id,chosen.id);
    return {success:true,email:chosen.email,auth_user_id:chosen.id};
}

export function authLinkStore(url,key,fetcher=fetch) {
    const headers={Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'};
    const request=async(path,options={})=>fetcher(`${url}${path}`,{...options,headers:{...headers,...options.headers}});
    return {
        async getAuth(id) {
            const r=await request(`/auth/v1/admin/users/${encodeURIComponent(id)}`);
            if(r.status===404)return null;
            if(!r.ok)throw new Error('인증 계정 조회 실패: 새 계정은 만들지 않았습니다.');
            return await r.json();
        },
        async findAuth(emails) {
            const found=[];
            for(let page=1;page<=1000;page++) {
                const r=await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
                if(!r.ok)throw new Error('기존 인증 계정 조회를 완료하지 못했습니다.');
                const {users}=await r.json();
                if(!Array.isArray(users))throw new Error('인증 목록 응답을 확인하지 못했습니다.');
                found.push(...users.filter(u=>emails.includes(u.email)));
                if(users.length<100)return found;
            }
            throw new Error('인증 목록 전체 확인이 필요합니다.');
        },
        async createAuth(body) {
            const r=await request('/auth/v1/admin/users',{method:'POST',body:JSON.stringify(body)});
            if(!r.ok)throw new Error('인증 생성 실패');
            return await r.json();
        },
        async hasOtherOwner(authId,profileId) {
            const r=await request(`/rest/v1/users?or=(id.eq.${encodeURIComponent(authId)},auth_user_id.eq.${encodeURIComponent(authId)})&id=neq.${encodeURIComponent(profileId)}&select=id&limit=1`);
            if(!r.ok)throw new Error('인증 소유자를 확인하지 못했습니다.');
            return (await r.json()).length!==0;
        },
        async linkIfEmpty(profileId,authId) {
            const r=await request(`/rest/v1/users?id=eq.${encodeURIComponent(profileId)}&auth_user_id=is.null&select=auth_user_id`,
                {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({auth_user_id:authId})});
            if(!r.ok)throw new Error('인증 연결 저장 실패. 기존 생성 계정은 보존했습니다.');
            if((await r.json()).length)return;
            const current=await request(`/rest/v1/users?id=eq.${encodeURIComponent(profileId)}&select=auth_user_id`);
            if(!current.ok || (await current.json())[0]?.auth_user_id!==authId)
                throw new Error('인증 연결이 변경되어 다시 확인해야 합니다.');
        },
    };
}

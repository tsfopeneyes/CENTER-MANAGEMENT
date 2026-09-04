const pending=new WeakMap();

// getSession waits for SDK initialization and refreshes an expired session using
// its saved refresh token. Never manufacture a session from a cached profile.
export const getInterestSessionUser = auth => {
    if(pending.has(auth))return pending.get(auth);
    const request=(async()=>{
        const {data,error}=await auth.getSession();
        if(error)throw new Error('인증 연결을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.');
        const session=data?.session;
        if(!session?.user || session.user.is_anonymous)return null;
        if(session.expires_at && session.expires_at*1000<=Date.now()) {
            throw new Error('인증 갱신을 기다리고 있습니다. 잠시 후 다시 시도해주세요.');
        }
        return session.user.id;
    })();
    pending.set(auth,request);
    request.then(()=>pending.delete(auth),()=>pending.delete(auth));
    return request;
};

export const readInterestProfile = storage => {
    try {
        const value=JSON.parse(storage.getItem('user') || storage.getItem('admin_user') || 'null');
        if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value?.id || ''))return null;
        // Passwords or hashes already present in legacy storage must not be
        // used as proof of identity or passed to a silent sign-in.
        return {id:value.id,name:String(value.name || '회원')};
    } catch {return null;}
};

export const reconnectInterestSession = async ({profile,password,storage,auth,signIn}) => {
    if(!password)throw new Error('비밀번호를 입력해주세요.');
    if(readInterestProfile(storage)?.id!==profile?.id)throw new Error('이용 중인 계정이 바뀌었습니다. 창을 닫고 다시 시도해주세요.');
    const session=await signIn(profile.id,password);
    if(!session?.user?.id || !session.access_token || !session.refresh_token)throw new Error('인증 연결을 완료하지 못했습니다.');
    if(readInterestProfile(storage)?.id!==profile.id)throw new Error('이용 중인 계정이 바뀌었습니다. 인증 정보를 적용하지 않았습니다.');
    const {data,error}=await auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    if(error || data?.session?.user?.id!==session.user.id)throw new Error('인증 연결을 완료하지 못했습니다. 다시 시도해주세요.');
    // Do not report success until the SDK can read back the persisted session.
    // This keeps the password confirmation genuinely one-time across reloads.
    const saved=await auth.getSession();
    if(saved.error || saved.data?.session?.user?.id!==session.user.id)
        throw new Error('인증 연결을 저장하지 못했습니다. 브라우저 설정을 확인한 뒤 다시 시도해주세요.');
    for(const key of ['user','admin_user']) {
        const raw=storage.getItem(key);
        if(!raw)continue;
        const current=JSON.parse(raw);
        if(current.id===profile.id)storage.setItem(key,JSON.stringify({...current,auth_user_id:session.user.id}));
    }
};

// Always resolve the server-selected identity before signing in. Never accept
// an arbitrary successful Auth login as proof of the selected member profile.
export async function verifiedProfileLogin({profileId,password,hashedPassword,resolve,auth}) {
    const link=await resolve({action:'ensure-auth-link',profileId,password});
    if(!link?.auth_user_id || !link?.email)throw new Error('로그인 서버 업데이트가 필요합니다. 관리자에게 문의해주세요.');
    let result=await auth.signInWithPassword({email:link.email,password:hashedPassword});
    if(result.error && password!==hashedPassword)result=await auth.signInWithPassword({email:link.email,password});
    if(result.error || result.data?.user?.id!==link.auth_user_id) {
        // A stale/wrong identity must not remain active behind the selected UI.
        await auth.signOut({scope:'local'});
        throw new Error('회원과 인증 계정의 연결을 확인하지 못했습니다. 다시 로그인해주세요.');
    }
    return link.auth_user_id;
}

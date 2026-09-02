import {supabase} from '../supabaseClient';
import {getAccountAuthClient,isAccountAuthEnabled} from './accountAuthRuntime';

export async function uploadAccountImage({profileId,kind,file}){
    if(!isAccountAuthEnabled())return null;
    const current=await supabase.auth.getSession(),accessToken=current?.data?.session?.access_token;
    if(current?.error||!accessToken)throw new Error('로그인 상태를 확인하지 못했습니다.');
    return getAccountAuthClient().upload({profileId,kind,file},{accessToken});
}

export function cachedAccountProfileId(){
    for(const key of ['admin_user','user'])try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.id)return value.id;}catch{}
    return null;
}

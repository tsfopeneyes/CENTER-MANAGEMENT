import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';
import {supabase} from '../supabaseClient';
import {verifiedProfileLogin} from '../utils/verifiedProfileLogin';
import {requestSupabaseFunction} from '../utils/supabaseRest';
import {getInterestSessionUser,readInterestProfile,reconnectInterestSession} from '../utils/interestSession';
import {createAccountAuthClient} from '../auth/accountAuthClient';
import {isAccountAuthEnabled} from '../auth/accountAuthRuntime';

export const useInterestSessionConfirmation = (noticeId,api) => {
    const [profile]=useState(()=>readInterestProfile(window.localStorage));
    const [password,setPassword]=useState('');
    const [state,setState]=useState({phase:'checking',error:'',status:null});
    const active=useRef(true);
    const locked=useRef(false);
    const readStatus=async()=>noticeId==null
        ? {userId:await getInterestSessionUser(supabase.auth),enabled:false}
        : api.status(noticeId);
    useEffect(()=>{
        active.current=true;
        readStatus().then(status=>{
            if(active.current)setState({phase:status.userId?'ready':'password',error:'',status});
        }).catch(()=>{if(active.current)setState({phase:'error',error:'인증 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',status:null});});
        return ()=>{active.current=false;};
    },[noticeId,api]);
    const submit=async event=>{
        event.preventDefault();event.stopPropagation();
        if(locked.current || !profile)return;
        locked.current=true;setState({phase:'connecting',error:'',status:null});
        try {
            await reconnectInterestSession({profile,password,storage:window.localStorage,auth:supabase.auth,
                signIn:async(profileId,enteredPassword)=>{
                    // Failed confirmation must not sign out or overwrite the
                    // shared session. Transfer only a verified result.
                    const isolated=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,
                        {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
                    if(isAccountAuthEnabled()) {
                        const secure=createAccountAuthClient({
                            baseUrl:import.meta.env.VITE_ACCOUNT_AUTH_BASE_URL,
                            supabaseUrl:import.meta.env.VITE_SUPABASE_URL,
                            publishableKey:import.meta.env.VITE_SUPABASE_ANON_KEY,
                            auth:isolated.auth
                        });
                        await secure.login.login({profileId,password:enteredPassword});
                    } else {
                        await verifiedProfileLogin({profileId,password:enteredPassword,hashedPassword:CryptoJS.SHA256(enteredPassword).toString(),
                            resolve:payload=>requestSupabaseFunction('dispatch-notification',payload,1),auth:isolated.auth});
                    }
                    const {data,error}=await isolated.auth.getSession();
                    if(error)throw new Error('인증 결과를 확인하지 못했습니다.');
                    return data?.session;
                },
            });
            const status=await readStatus();
            if(!status.userId)throw new Error('인증 연결을 확인하지 못했습니다.');
            window.dispatchEvent(new Event('recruitment-interest-changed'));
            if(active.current){setPassword('');setState({phase:'ready',error:'',status});}
        } catch(error){if(active.current){setPassword('');setState({phase:'password',error:error.message || '비밀번호를 확인해주세요.',status:null});}}
        finally{locked.current=false;}
    };
    return {profile,password,setPassword,state,submit};
};

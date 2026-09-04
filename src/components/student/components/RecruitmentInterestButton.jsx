import React, { useEffect, useRef, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { recruitmentInterestsApi } from '../../../api/recruitmentInterestsApi';
import { supabase } from '../../../supabaseClient';

export default function RecruitmentInterestButton({ noticeId, api = recruitmentInterestsApi }) {
    const [status,setStatus] = useState(null);
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const active = useRef(true);
    const locked = useRef(false);
    useEffect(() => {
        active.current=true;
        let version=0;
        const refresh=async()=>{
            const request=++version;
            setStatus(null);
            try { const value=await api.status(noticeId); if(active.current && request===version){setStatus(value);setError('');} }
            catch {if(active.current && request===version)setError('알림 신청 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.');}
        };
        refresh();
        const changed=()=>refresh();
        const visible=()=>{if(document.visibilityState==='visible')refresh();};
        window.addEventListener('recruitment-interest-changed',changed);
        window.addEventListener('focus',visible);
        document.addEventListener('visibilitychange',visible);
        const {data}=supabase.auth.onAuthStateChange(()=>{ queueMicrotask(refresh); });
        return ()=>{active.current=false;version++;window.removeEventListener('recruitment-interest-changed',changed);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);data.subscription.unsubscribe();};
    },[noticeId,api]);
    const toggle=async (event,currentStatus=status)=>{
        event.stopPropagation();
        if(locked.current)return;
        if(error){window.alert(error);return;}
        if(!currentStatus?.userId){window.alert('원활한 이용을 위해 로그아웃 후 다시 로그인해주세요.');return;}
        locked.current=true;setBusy(true);
        try {
            let bellSaved = true;
            if(currentStatus.enabled) await api.cancel(noticeId,currentStatus.userId);
            else {
                // Request permission directly within this user gesture.
                const token=await api.requestToken();
                const saved=await api.subscribe(noticeId,token,currentStatus.userId);
                if(!saved?.enabled)throw new Error('알림 신청을 저장하지 못했습니다. 다시 시도해주세요.');
                bellSaved = saved.bellSaved !== false;
            }
            if(active.current) {
                window.dispatchEvent(new Event('recruitment-interest-changed'));
                window.alert(currentStatus.enabled?'모집 알림 신청을 취소했어요.':bellSaved?'관심 프로그램으로 등록됐어요!':'관심 프로그램으로 등록됐어요!\n다만 종 알림 저장에 실패했습니다. 관심 등록은 유지됩니다.');
            }
        } catch(e) {if(active.current)window.alert(e.message || '알림 신청을 완료하지 못했습니다. 다시 시도해주세요.');}
        finally {locked.current=false;if(active.current)setBusy(false);}
    };
    return <button type="button" onClick={toggle} disabled={busy || (!status && !error)}
        aria-label={status?.enabled?'모집 시작 알림 취소':'모집 시작 알림 신청'} aria-pressed={!!status?.enabled}
        title={status?.enabled?'모집 알림 신청됨':'모집 시작 알림 받기'}
        className={`shrink-0 w-12 min-h-11 rounded-xl border flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-tossBlue disabled:opacity-50 ${status?.enabled?'bg-rose-50 border-rose-200 text-rose-500':'bg-white border-tossGrey200 text-tossGrey500 hover:bg-rose-50 hover:text-rose-500'}`}>
        {busy?<Loader2 size={21} className="animate-spin"/>:<Heart size={21} fill={status?.enabled?'currentColor':'none'}/>}
    </button>;
}

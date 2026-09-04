import React,{useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {promptAndEnableNotification} from '../../../firebase';

export default function PushPermissionPrompt({user}){
 const [open,setOpen]=useState(false),[declined,setDeclined]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!user?.id||typeof window==='undefined'||!('Notification' in window)||Notification.permission!=='default')return;const key=`push_prompt_answered:${user.id}`;if(localStorage.getItem(key))return;const timer=setTimeout(()=>setOpen(true),700);return()=>clearTimeout(timer)},[user?.id]);
 const allow=async()=>{setLoading(true);const result=await promptAndEnableNotification(user.id);setLoading(false);if(result.success){localStorage.setItem(`push_prompt_answered:${user.id}`,'allowed');setOpen(false)}};
 const decline=()=>{localStorage.setItem(`push_prompt_answered:${user.id}`,'declined');setOpen(false);setDeclined(true)};
 if(!open&&!declined)return null;
 return <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-[30px] bg-white p-7 text-center shadow-2xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><BellRing size={27}/></div>{declined?<><h2 className="mt-5 text-xl font-black text-gray-900">천천히 경험해보세요!</h2><p className="mt-3 text-sm font-semibold leading-6 text-gray-500">언제든지 기기에서 알림을 설정할 수 있으니, 천천히 경험해보세요!</p><button type="button" onClick={()=>setDeclined(false)} className="mt-6 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white">확인</button></>:<><h2 className="mt-5 text-xl font-black leading-8 text-gray-900">센터에서 일어나는 즐거운 소식들을 받아보시겠습니까?</h2><p className="mt-3 text-sm font-semibold leading-6 text-gray-500">새로운 프로그램과 공지 소식을 놓치지 않고 알려드려요.</p><button type="button" disabled={loading} onClick={allow} className="mt-6 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white disabled:opacity-50">{loading?'연결 중…':'알림 허용'}</button><button type="button" onClick={decline} className="mt-2 w-full rounded-2xl py-3.5 font-bold text-gray-400">거부</button></>}</div></div>;
}

import React, {useEffect} from 'react';
import {createPortal} from 'react-dom';
import {ShieldCheck} from 'lucide-react';
import {useInterestSessionConfirmation} from '../../../hooks/useInterestSessionConfirmation';
import useModalClose from '../../../hooks/useModalClose';

export default function InterestSessionDialog({noticeId,api,onClose,onContinue}) {
    const {profile,password,setPassword,state,submit}=useInterestSessionConfirmation(noticeId,api);
    const busy=['checking','connecting'].includes(state.phase);
    useEffect(() => {
        if (state.phase === 'ready') onContinue?.(null, state.status);
    }, [state.phase, state.status, onContinue]);
    useModalClose(true, () => {
        if (!busy) onClose();
    });
    if (state.phase === 'ready') return null;
    return createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 px-5 py-8 backdrop-blur-[2px]" onClick={e=>e.stopPropagation()}>
        <section role="dialog" aria-modal="true" aria-labelledby="interest-session-title" className="w-full max-w-[360px] rounded-[28px] bg-white px-6 pb-5 pt-7 shadow-[0_24px_64px_rgba(15,23,42,0.24)]">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-tossBlue">
                <ShieldCheck size={25} strokeWidth={2.2}/>
            </div>
            <h2 id="interest-session-title" className="text-[21px] font-extrabold tracking-[-0.025em] text-tossGrey900">로그인 연결이 필요해요</h2>
            <form onSubmit={submit}>
                <p className="mt-3 text-[14px] font-medium leading-6 text-tossGrey600">{profile?'센터 웹앱을 원활히 이용하기 위해 비밀번호 재입력이 필요해요. 현재 화면과 기존 이용 기록은 그대로 유지되며, 확인 후에는 다시 입력하지 않아도 돼요.':'현재 화면의 회원 정보를 확인하지 못했습니다. 창을 닫고 로그인 상태를 확인해주세요.'}</p>
                {profile && state.phase!=='checking' && state.phase!=='error' && <>
                    <label htmlFor="interest-session-password" className="mt-6 block text-[13px] font-bold text-tossGrey700">비밀번호</label>
                    <input id="interest-session-password" type="password" autoComplete="current-password" autoFocus required disabled={busy}
                        value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-[52px] w-full rounded-2xl border-0 bg-tossGrey100 px-4 text-base font-semibold text-tossGrey900 outline-none ring-0 transition-shadow placeholder:text-tossGrey400 focus:bg-white focus:shadow-[0_0_0_2px_#3182F6] disabled:opacity-50" />
                    <button type="submit" disabled={busy} className="mt-4 h-[52px] w-full rounded-2xl bg-tossBlue text-[15px] font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50">{busy?'연결 확인 중…':'확인'}</button>
                </>}
                {state.phase==='checking' && <p role="status" className="mt-6 rounded-2xl bg-tossGrey100 px-4 py-3 text-sm font-semibold text-tossGrey600">기존 로그인 연결을 확인하고 있어요…</p>}
                {state.error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold leading-5 text-red-600">{state.error}</p>}
            </form>
            <button type="button" disabled={busy} onClick={onClose} className="mt-2 h-11 w-full rounded-xl text-[14px] font-semibold text-tossGrey500 transition-colors hover:bg-tossGrey100 hover:text-tossGrey700 disabled:opacity-50">나중에 하기</button>
        </section>
    </div>,document.body);
}

import React from 'react';
import {createPortal} from 'react-dom';
import {useInterestSessionConfirmation} from '../../../hooks/useInterestSessionConfirmation';
import useModalClose from '../../../hooks/useModalClose';

export default function InterestSessionDialog({noticeId,api,onClose,onContinue}) {
    const {profile,password,setPassword,state,submit}=useInterestSessionConfirmation(noticeId,api);
    const busy=['checking','connecting'].includes(state.phase);
    useModalClose(true, () => {
        if (!busy) onClose();
    });
    return createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" onClick={e=>e.stopPropagation()}>
        <section role="dialog" aria-modal="true" aria-labelledby="interest-session-title" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="interest-session-title" className="text-lg font-bold text-gray-900">관심 프로그램 연결</h2>
            {state.phase==='ready' ? <>
                <p className="mt-3 text-sm text-gray-600">로그인 연결이 확인됐어요. 현재 화면에서 계속할 수 있어요.</p>
                <button type="button" onClick={e=>onContinue(e,state.status)} className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-bold text-white">계속하기</button>
            </> : <form onSubmit={submit}>
                <p className="mt-3 text-sm text-gray-600">{profile?`${profile.name}님의 화면은 그대로 유지됩니다. 이전 로그인 연결이 남아 있지 않아 비밀번호를 한 번만 확인해주세요.`:'현재 화면의 회원 정보를 확인하지 못했습니다. 창을 닫고 로그인 상태를 확인해주세요.'}</p>
                {profile && state.phase!=='checking' && state.phase!=='error' && <>
                    <label htmlFor="interest-session-password" className="mt-4 block text-sm font-semibold">비밀번호</label>
                    <input id="interest-session-password" type="password" autoComplete="current-password" autoFocus required disabled={busy}
                        value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3" />
                    <button type="submit" disabled={busy} className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-50">{busy?'연결 확인 중…':'확인'}</button>
                </>}
                {state.phase==='checking' && <p role="status" className="mt-4 text-sm">기존 로그인 연결을 확인하고 있어요…</p>}
                {state.error && <p role="alert" className="mt-3 text-sm text-red-600">{state.error}</p>}
            </form>}
            <button type="button" disabled={busy} onClick={onClose} className="mt-3 w-full py-2 text-sm text-gray-500 disabled:opacity-50">닫기</button>
        </section>
    </div>,document.body);
}

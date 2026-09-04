import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Bell, BellOff, CheckCircle2, Loader2 } from 'lucide-react';
import useModalClose from '../../../hooks/useModalClose';
import { requestFirebaseToken, storedPushTokenIncludes } from '../../../firebase';
import { supabase } from '../../../supabaseClient';

const NotificationsModal = ({ user, notifications, setShowNotificationsModal, markNotificationsAsRead, onNotificationOpen }) => {
    useModalClose(true, () => setShowNotificationsModal(false));
    const [pushStatus, setPushStatus] = useState('checking');
    const [pushActionLoading, setPushActionLoading] = useState(false);
    const [showPushHelp, setShowPushHelp] = useState(false);

    const refreshPushStatus = useCallback(async () => {
        if (typeof window === 'undefined' || !('Notification' in window) || typeof window.Notification.requestPermission !== 'function') {
            setPushStatus('unsupported');
            return;
        }
        if (window.Notification.permission !== 'granted') {
            setPushStatus(window.Notification.permission === 'denied' ? 'denied' : 'not_allowed');
            return;
        }
        if (!user?.id) {
            setPushStatus('disconnected');
            return;
        }

        setPushStatus('checking');
        const currentToken = await requestFirebaseToken(user.id);
        if (!currentToken) {
            setPushStatus('disconnected');
            return;
        }
        if (currentToken.startsWith('WEB_PUSH:')) {
            setPushStatus('enabled');
            return;
        }
        const { data, error } = await supabase.from('users').select('fcm_token').eq('id', user.id).maybeSingle();
        setPushStatus(!error && storedPushTokenIncludes(data?.fcm_token, currentToken) ? 'enabled' : 'disconnected');
    }, [user?.id]);

    useEffect(() => {
        refreshPushStatus();
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') refreshPushStatus();
        };
        window.addEventListener('focus', refreshPushStatus);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            window.removeEventListener('focus', refreshPushStatus);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [refreshPushStatus]);

    const pushStatusView = {
        checking: { title: '푸시 알림 확인 중', description: '이 기기의 알림 연결 상태를 확인하고 있어요.', tone: 'bg-gray-50 border-gray-100', icon: <Loader2 size={18} className="animate-spin text-gray-400" /> },
        enabled: { title: '푸시 알림 켜짐', description: '새로운 소식을 현재 기기에서 바로 받을 수 있어요.', tone: 'bg-emerald-50 border-emerald-100', icon: <CheckCircle2 size={18} className="text-emerald-500" /> },
        denied: { title: '푸시 알림 꺼짐', description: '브라우저에서 알림이 차단되어 있어 웹앱이 직접 켤 수 없어요. 아래에서 기기별 설정 방법을 확인해주세요.', tone: 'bg-amber-50 border-amber-100', icon: <BellOff size={18} className="text-amber-500" /> },
        not_allowed: { title: '푸시 알림 꺼짐', description: '아직 알림 사용 여부를 선택하지 않았어요. 아래 버튼을 누른 뒤 브라우저 권한창에서 허용해주세요.', tone: 'bg-gray-50 border-gray-100', icon: <BellOff size={18} className="text-gray-400" /> },
        disconnected: { title: '푸시 알림 연결 필요', description: '알림 권한은 켜져 있지만 현재 계정과 연결되지 않았어요.', tone: 'bg-amber-50 border-amber-100', icon: <BellOff size={18} className="text-amber-500" /> },
        unsupported: { title: '푸시 알림 사용 불가', description: '현재 브라우저에서는 푸시 알림을 지원하지 않아요.', tone: 'bg-gray-50 border-gray-100', icon: <BellOff size={18} className="text-gray-400" /> }
    }[pushStatus];

    const pushActionLabel = pushStatus === 'not_allowed'
        ? '알림 허용 요청하기'
        : pushStatus === 'disconnected'
            ? '현재 계정에 다시 연결하기'
            : ['denied', 'unsupported'].includes(pushStatus)
                ? '알림 사용 방법 보기'
                : pushStatus === 'enabled' ? '현재 기기 알림 테스트' : null;

    const handlePushAction = async () => {
        if (pushStatus === 'enabled') {
            setPushActionLoading(true);
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification('SCI CENTER 알림 테스트', {
                    body: '이 알림이 보이면 휴대폰의 알림 표시 기능은 정상입니다.',
                    icon: '/icon-512.png',
                    badge: '/icon-512.png',
                    tag: `push-local-test-${Date.now()}`,
                });
            } catch (error) {
                alert(`현재 기기에서 알림을 표시하지 못했습니다.\n${error.message || ''}`);
            } finally {
                setPushActionLoading(false);
            }
            return;
        }
        if (['denied', 'unsupported'].includes(pushStatus)) {
            setShowPushHelp(true);
            return;
        }
        if (!user?.id || pushActionLoading) return;
        setPushActionLoading(true);
        try {
            if (pushStatus === 'not_allowed') {
                const permission = await window.Notification.requestPermission();
                if (permission !== 'granted') {
                    setPushStatus(permission === 'denied' ? 'denied' : 'not_allowed');
                    return;
                }
            }
            await refreshPushStatus();
        } catch (error) {
            console.error('Failed to update push notification status:', error);
            setPushStatus('unsupported');
        } finally {
            setPushActionLoading(false);
        }
    };

    return (
                    <>
                    {showPushHelp && (
                        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-5" onClick={() => setShowPushHelp(false)}>
                            <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
                                <h4 className="text-xl font-black text-gray-900">푸시 알림을 켜는 방법</h4>
                                <div className="mt-5 space-y-4 text-sm font-semibold leading-6 text-gray-600">
                                    <div><p className="font-black text-gray-900">안드로이드 Chrome</p><p>주소창의 사이트 정보 → 권한 → 알림을 허용으로 변경해주세요.</p></div>
                                    <div><p className="font-black text-gray-900">홈 화면에 설치한 웹앱</p><p>휴대폰 설정 → 앱 → 센터 웹앱 또는 Chrome → 알림을 켜주세요.</p></div>
                                    <div><p className="font-black text-gray-900">아이폰</p><p>웹앱을 홈 화면에 추가해 실행한 뒤 알림을 허용해주세요. 설정 → 알림에서도 변경할 수 있어요.</p></div>
                                    {pushStatus === 'unsupported' && <p className="rounded-2xl bg-gray-50 p-3 text-xs leading-5 text-gray-500">현재 브라우저에서 알림 기능이 보이지 않으면 Chrome 또는 홈 화면에 설치한 센터 웹앱으로 접속해주세요.</p>}
                                </div>
                                <button type="button" onClick={async () => { setShowPushHelp(false); if (pushStatus === 'denied') await refreshPushStatus(); }} className="mt-6 w-full rounded-2xl bg-blue-600 py-3.5 font-bold text-white">{pushStatus === 'denied' ? '설정을 마쳤어요' : '확인'}</button>
                            </div>
                        </div>
                    )}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex justify-center p-4 bg-black/60 backdrop-blur-sm sm:items-center items-end pb-24"
                        onClick={() => setShowNotificationsModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 100 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 100 }}
                            className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[70vh]"
                            onClick={e => e.stopPropagation()}
                            onAnimationComplete={() => markNotificationsAsRead()}
                        >
                            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div className="flex items-center gap-2">
                                    <Bell size={20} className="text-gray-800" />
                                    <h3 className="text-lg font-black text-gray-800">새로운 소식</h3>
                                </div>
                                <button onClick={() => setShowNotificationsModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>
                            <div className="overflow-y-auto p-4 flex-1 bg-gray-50/30">
                                <div className={`mb-4 rounded-2xl border p-4 ${pushStatusView.tone}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">{pushStatusView.icon}</div>
                                        <div>
                                            <p className="text-sm font-black text-gray-800">{pushStatusView.title}</p>
                                            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{pushStatusView.description}</p>
                                            {pushActionLabel && <button type="button" disabled={pushActionLoading} onClick={handlePushAction} className="mt-3 rounded-xl bg-white px-3.5 py-2 text-xs font-black text-blue-600 shadow-sm disabled:opacity-50">{pushActionLoading ? '연결 중…' : pushActionLabel}</button>}
                                        </div>
                                    </div>
                                </div>
                                {notifications.length === 0 ? (
                                    <div className="text-center py-10">
                                        <Bell size={32} className="mx-auto text-gray-300 mb-3" />
                                        <p className="text-gray-400 font-bold text-sm">새로운 알림이 없습니다.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {notifications.map((notif) => {
                                            const isLinkedNotice = Boolean(notif.is_notice_linked);
                                            return (
                                            <button
                                                type="button"
                                                key={notif.id}
                                                disabled={!isLinkedNotice}
                                                onClick={() => onNotificationOpen?.(notif)}
                                                className={`w-full p-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-left transition-all ${isLinkedNotice ? 'hover:border-blue-200 hover:shadow-md active:scale-[0.99]' : ''}`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] uppercase font-black tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">
                                                        {['RECRUITMENT','RECRUITMENT_SAVED'].includes(notif.notification_type) ? '관심 프로그램' :
                                                         notif.notification_type === 'NOTICE' || notif.target_group === '전체' || notif.target_group?.startsWith('REGION_') ? '공지' :
                                                         notif.target_group?.startsWith('USER_') ? '알림' : 
                                                         notif.target_group}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-bold">
                                                        {new Date(notif.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-700 font-bold leading-relaxed whitespace-pre-wrap">
                                                    {notif.content}
                                                </p>
                                                {isLinkedNotice && <p className="mt-2 text-xs font-bold text-blue-500">{notif.notification_action_label || '눌러서 글 보기'}</p>}
                                            </button>
                                        )})}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                    </>
    );
};
export default NotificationsModal;

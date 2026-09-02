import React, { useState, useEffect } from 'react';
import { BellRing, X, Send } from 'lucide-react';
import { supabase } from '../../../../supabaseClient';
import useModalClose from '../../../../hooks/useModalClose';

const NotificationModal = ({ notificationModalOpen, setNotificationModalOpen }) => {
    useModalClose(notificationModalOpen, () => setNotificationModalOpen(false));
    const [notificationContent, setNotificationContent] = useState('');
    const [notificationGroup, setNotificationGroup] = useState('전체');
    const [sending, setSending] = useState(false);

    const handleSendNotification = async () => {
        if (!notificationContent.trim()) {
            alert('알림 내용을 입력해주세요.');
            return;
        }
        if (!confirm(`'${notificationGroup}' 그룹에 알림을 발송하시겠습니까?`)) return;

        setSending(true);
        try {
            const currentUser = JSON.parse(localStorage.getItem('admin_user')) || JSON.parse(localStorage.getItem('user'));
            const { error } = await supabase.from('app_notifications').insert([{
                sender_id: currentUser?.id,
                target_group: notificationGroup,
                content: notificationContent.trim()
            }]);

            if (error) throw error;

            alert('새로운 소식이 성공적으로 발송되었습니다.');
            setNotificationModalOpen(false);
            setNotificationContent('');
        } catch (err) {
            console.error(err);
            alert('발송 실패: ' + err.message);
        } finally {
            setSending(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setNotificationModalOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setNotificationModalOpen]);

    if (!notificationModalOpen) return null;

    return (
        <div onClick={(e) => { if (e.target === e.currentTarget) setNotificationModalOpen(false); }} className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <BellRing className="text-blue-600" size={20} />
                        새로운 소식 발송
                    </h3>
                    <button onClick={() => setNotificationModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-2">대상 그룹</label>
                        <select
                            value={notificationGroup}
                            onChange={(e) => setNotificationGroup(e.target.value)}
                            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm transition-colors"
                        >
                            <option value="전체">전체 (모든 회원)</option>
                            <option value="청소년">청소년</option>
                            <option value="졸업생">졸업생</option>
                            <option value="STAFF">STAFF (스태프 전용)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-2">알림 내용</label>
                        <textarea
                            value={notificationContent}
                            onChange={(e) => setNotificationContent(e.target.value)}
                            className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white bg-gray-50 transition-colors resize-none h-32 text-sm leading-relaxed"
                            placeholder="학생들에게 보낼 공지사항이나 알림 내용을 입력하세요."
                        />
                    </div>
                </div>
                <div className="p-6 pt-0 mt-2">
                    <button
                        onClick={handleSendNotification}
                        disabled={sending || !notificationContent.trim()}
                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-300 transition flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                    >
                        <Send size={18} className={sending ? 'animate-pulse' : ''} />
                        {sending ? '발송 중...' : '알림 즉시 발송'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationModal;

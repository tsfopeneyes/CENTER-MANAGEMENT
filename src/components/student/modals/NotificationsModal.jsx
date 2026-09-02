import React from 'react';
import { motion } from 'framer-motion';
import { X, Bell } from 'lucide-react';
import useModalClose from '../../../hooks/useModalClose';

const NotificationsModal = ({ notifications, setShowNotificationsModal, markNotificationsAsRead, onNotificationOpen }) => {
    useModalClose(true, () => setShowNotificationsModal(false));
    return (
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
                                                {isLinkedNotice && <p className="mt-2 text-xs font-bold text-blue-500">눌러서 글 보기</p>}
                                            </button>
                                        )})}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
    );
};
export default NotificationsModal;

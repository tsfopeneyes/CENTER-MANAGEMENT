import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useModalClose from '../../../hooks/useModalClose';

const AdminBookingEditModal = ({ booking, onClose, onSuccess }) => {
    useModalClose(!!booking, onClose);
    const endParts = booking.end_time.split('|');
    
    const [bookingDate, setBookingDate] = useState(booking.booking_date);
    const [startTime, setStartTime] = useState(booking.start_time);
    const [endTime, setEndTime] = useState(endParts[0]);
    const [purpose, setPurpose] = useState(endParts.length > 1 ? endParts[1] : '');
    const [headcount, setHeadcount] = useState(endParts.length > 2 ? endParts[2] : '');
    const [meetingName, setMeetingName] = useState(endParts.length > 3 ? endParts[3] : '');
    const [customNotes, setCustomNotes] = useState(endParts.length > 4 ? endParts[4] : '');
    const [rejectionReason, setRejectionReason] = useState(endParts.length > 5 ? endParts[5] : '');
    const [status, setStatus] = useState(booking.status);
    const [submitting, setSubmitting] = useState(false);

    const handleSave = async () => {
        setSubmitting(true);
        try {
            const finalEndTime = `${endTime}|${purpose}|${headcount}|${meetingName}|${customNotes}|${rejectionReason}`;
            const { error } = await supabase
                .from('rental_bookings')
                .update({
                    booking_date: bookingDate,
                    start_time: startTime,
                    end_time: finalEndTime,
                    status: status
                })
                .eq('id', booking.id);
            
            if (error) throw error;
            alert('수정되었습니다.');
            onSuccess();
        } catch (error) {
            console.error('Error updating booking:', error);
            alert('수정 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
                />
                
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    className="w-full max-w-sm bg-white rounded-2xl shadow-xl z-10 flex flex-col overflow-hidden animate-fade-in"
                >
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-extrabold text-gray-900 text-base">대관 신청 내용 수정</h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 block">이용 날짜</label>
                            <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="flex gap-2">
                            <div className="space-y-1 flex-1">
                                <label className="text-xs font-bold text-gray-600 block">시작 시간</label>
                                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div className="space-y-1 flex-1">
                                <label className="text-xs font-bold text-gray-600 block">종료 시간</label>
                                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 block">모임 이름</label>
                            <input type="text" value={meetingName} onChange={e => setMeetingName(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 block">이용 목적</label>
                            <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 block">이용 인원</label>
                            <input type="number" value={headcount} onChange={e => setHeadcount(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 block">기타 요청 사항</label>
                            <textarea value={customNotes} onChange={e => setCustomNotes(e.target.value)} rows="2" className="w-full p-2 border border-gray-200 rounded-lg text-sm resize-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600 block">상태</label>
                            <select value={status} onChange={e => setStatus(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg text-sm">
                                <option value="PENDING">대기중</option>
                                <option value="APPROVED">승인됨</option>
                                <option value="REJECTED">반려됨</option>
                            </select>
                        </div>
                        {status === 'REJECTED' && (
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-red-600 block">반려 사유 입력</label>
                                <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows="2" placeholder="반려 사유를 구체적으로 적어주세요." className="w-full p-2 border border-red-300 rounded-lg text-sm resize-none text-red-700 bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400" />
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-gray-100 flex gap-2">
                        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold">취소</button>
                        <button onClick={handleSave} disabled={submitting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">
                            {submitting ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AdminBookingEditModal;

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { X, Calendar, MapPin, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useModalClose from '../../../hooks/useModalClose';
import { sendCategoryNotification } from '../../../utils/integrationUtils';

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatRentalDate = (dateString) => {
    const [year, month, day] = String(dateString).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return `${month}월 ${day}일(${KOREAN_WEEKDAYS[date.getDay()]})`;
};

const formatRentalTime = (timeString) => {
    const [hourValue, minute] = String(timeString).split(':').map(Number);
    const period = hourValue < 12 ? '오전' : '오후';
    const hour = hourValue % 12 || 12;
    return `${period} ${hour}시${minute ? ` ${minute}분` : ''}`;
};

const RentalBookingModal = ({ user, rental, bookings, onClose, onSuccess, tutorialMode = false }) => {
    useModalClose(!!rental, onClose);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedSlot, setSelectedSlot] = useState({ start: '10:00', end: '12:00' });
    const [meetingName, setMeetingName] = useState(tutorialMode ? '튜토리얼 스쿨처치 모임' : '');
    const [purpose, setPurpose] = useState(tutorialMode ? '센터 공간 이용 체험' : '');
    const [headcount, setHeadcount] = useState(tutorialMode ? '4' : '');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [dayBookings, setDayBookings] = useState([]);
    const [tutorialSubmitted, setTutorialSubmitted] = useState(false);
    const [bookingComplete, setBookingComplete] = useState(false);

    const timeSlots = [
        { start: '10:00', end: '12:00' },
        { start: '12:00', end: '14:00' },
        { start: '14:00', end: '16:00' },
        { start: '16:00', end: '18:00' },
        { start: '18:00', end: '20:00' },
        { start: '20:00', end: '22:00' }
    ];

    useEffect(() => {
        fetchDayBookings();
    }, [selectedDate, rental.id]);

    const fetchDayBookings = async () => {
        try {
            const { data, error } = await supabase
                .from('rental_bookings')
                .select('*')
                .eq('rental_id', rental.id)
                .eq('booking_date', selectedDate)
                .in('status', ['APPROVED', 'PENDING']);
            if (error) throw error;
            setDayBookings(data || []);
        } catch (error) {
            console.error('Error fetching day bookings:', error);
        }
    };

    const handleBooking = async () => {
        if (!selectedSlot) return;

        if (tutorialMode) {
            setTutorialSubmitted(true);
            return;
        }

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('rental_bookings')
                .insert([{
                    rental_id: rental.id,
                    user_id: user.id,
                    booking_date: selectedDate,
                    start_time: selectedSlot.start,
                    end_time: `${selectedSlot.end}|${purpose}|${headcount}|${meetingName}|${notes}`,
                    status: 'PENDING' // Set pending until admin approval
                }]);

            if (error) throw error;

            let rentalName = rental.name || '공간';
            try {
                if (rental.name?.trim().startsWith('{')) rentalName = JSON.parse(rental.name).name || rentalName;
            } catch (parseError) {
                console.error('Failed to parse rental name:', parseError);
            }
            const centerName = rental.schools?.region === '강서' ? '이높플레이스' : '하이픈';
            const notificationMessage = [
                '[대관 신청]',
                `🏠 ${user?.name || '이용자'}님이 ${centerName} ${rentalName} 대관을 신청했어요.`,
                `📅 ${formatRentalDate(selectedDate)} ${formatRentalTime(selectedSlot.start)} ~ ${formatRentalTime(selectedSlot.end)}`,
                `👥 ${meetingName} / ${headcount}명`,
                `📝 ${purpose}`,
                `🙏 ${notes.trim() || '없음'}`,
            ].join('\n');
            // 대관 신청 완료는 Slack 전송과 독립적으로 바로 보여줍니다.
            // 알림은 백그라운드에서 전달되며 실패해도 저장된 신청에는 영향을 주지 않습니다.
            void sendCategoryNotification({
                    category: 'rental',
                    message: notificationMessage,
                    lineTarget: rental.schools?.region === '강서' ? 'enough' : 'haifn',
                    sendLine: false,
                    sendSlack: true,
                }).catch((notificationError) => {
                console.error('Slack rental notification error:', notificationError);
            });
            setBookingComplete(true);
        } catch (error) {
            console.error('Error creating booking:', error);
            alert('예약 신청 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    // Calculate tomorrow's date string
    const todayStr = new Date().toISOString().split('T')[0];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center p-0 md:p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
                />

                {/* Content Container */}
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                    className={`relative w-full md:max-w-md bg-white rounded-t-toss-2xl md:rounded-toss-2xl shadow-toss-elevated z-10 flex flex-col overflow-hidden ${(tutorialSubmitted || bookingComplete) ? 'h-auto min-h-[420px] max-h-[520px]' : 'max-h-[85vh] md:max-h-[90vh]'}`}
                >
                    {(tutorialSubmitted || bookingComplete) && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[24px] border border-black/5 bg-white p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                <CheckCircle2 size={34} />
                            </div>
                            <h3 className="mt-5 text-xl font-black text-tossGrey900">공간 이용 신청이 접수됐어요</h3>
                            <p className="mt-2 text-sm font-semibold leading-6 text-tossGrey600">관리자가 센터 일정을 확인한 뒤 승인하면 대여가 최종 확정됩니다.</p>
                            <div className="mt-5 w-full rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">상태 · 승인 대기</div>
                            <button type="button" onClick={onSuccess} className="mt-6 w-full rounded-2xl bg-tossBlue py-4 text-sm font-black text-white">캘린더 알아보기</button>
                        </div>
                    )}
                    {/* Header */}
                    <div className="p-5 border-b border-tossGrey100 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-tossBlue font-black uppercase tracking-wider">공간 대여</span>
                            {(() => {
                                let displayName = rental.name;
                                let cap = '';
                                let feat = '';
                                let imgUrl = '';
                                try {
                                    if (rental.name && rental.name.startsWith('{')) {
                                        const parsed = JSON.parse(rental.name);
                                        displayName = parsed.name || '';
                                        cap = parsed.capacity || '';
                                        feat = parsed.features || '';
                                        imgUrl = parsed.image_url || '';
                                    }
                                } catch(e) {}
                                return (
                                    <>
                                        <h3 className="font-extrabold text-tossGrey900 text-base flex items-center gap-1.5 mt-0.5">
                                            <MapPin size={16} className="text-tossBlue" /> {displayName}
                                        </h3>
                                        {(cap || feat) && (
                                            <span className="text-[10px] font-bold text-tossGrey500 mt-1">
                                                {cap && `인원: ${cap}`} {feat && ` | 설비: ${feat}`}
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <button onClick={onClose} className="p-1.5 text-tossGrey500 hover:text-tossGrey800 hover:bg-tossGrey100 rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 p-5 overflow-y-auto space-y-5 custom-scrollbar">
                        {tutorialMode && (
                            <div className="rounded-2xl border border-tossBlue/15 bg-tossBlueLight px-4 py-3 text-xs font-bold leading-5 text-tossGrey700">
                                날짜와 시간, 모임 정보를 확인하고 아래에서 <span className="text-tossBlue">체험으로 신청하기</span>를 눌러 보세요. 실제 예약은 저장되지 않아요.
                            </div>
                        )}
                        {/* Space Photo (if available) */}
                        {(() => {
                            let imgUrl = '';
                            try {
                                if (rental.name && rental.name.startsWith('{')) {
                                    imgUrl = JSON.parse(rental.name).image_url || '';
                                }
                            } catch(e) {}
                            if (!imgUrl) return null;
                            return (
                                <div className="w-full rounded-xl overflow-hidden shadow-sm border border-tossGrey100">
                                    <img src={imgUrl} alt="공간 사진" className="w-full h-auto block" />
                                </div>
                            );
                        })()}

                        {/* 1. Date Selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-tossGrey400 uppercase tracking-wider block">공간 이용 희망일</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    min={todayStr}
                                    value={selectedDate}
                                    onChange={(e) => {
                                        setSelectedDate(e.target.value);
                                        setSelectedSlot(null);
                                    }}
                                    className="w-full p-3 bg-tossGrey50 border border-tossGrey200 rounded-toss-xl outline-none font-bold text-tossGrey800 text-sm focus:border-tossBlue"
                                />
                            </div>
                        </div>

                        {/* 2. Custom Time Selector Bar (Slider / Time range buttons) */}
                        <div className="space-y-3.5">
                            <label className="text-xs font-black text-tossGrey400 uppercase tracking-wider block">공간 이용 시간 (10:00 - 22:00)</label>
                            
                            <div className="space-y-4 bg-tossGrey50 p-4 rounded-2xl border border-tossGrey150">
                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-tossGrey500 block mb-1">시작 시간</label>
                                        <select 
                                            value={selectedSlot ? selectedSlot.start : '10:00'}
                                            onChange={(e) => {
                                                const startVal = e.target.value;
                                                const startHour = parseInt(startVal.split(':')[0]);
                                                // Default end time to startHour + 2
                                                const endHour = Math.min(startHour + 2, 22);
                                                const endVal = `${endHour < 10 ? '0' + endHour : endHour}:00`;
                                                setSelectedSlot({ start: startVal, end: endVal });
                                            }}
                                            className="w-full p-2.5 bg-white border border-tossGrey200 rounded-xl font-bold text-xs text-tossGrey800 outline-none"
                                        >
                                            {Array.from({ length: 12 }, (_, i) => 10 + i).map(h => {
                                                const val = `${h < 10 ? '0' + h : h}:00`;
                                                return <option key={val} value={val}>{val}</option>;
                                            })}
                                        </select>
                                    </div>
                                    <div className="flex items-end pb-3 text-tossGrey400 font-bold text-xs">~</div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-tossGrey500 block mb-1">종료 시간</label>
                                        <select 
                                            value={selectedSlot ? selectedSlot.end : '12:00'}
                                            onChange={(e) => {
                                                const startVal = selectedSlot ? selectedSlot.start : '10:00';
                                                setSelectedSlot({ start: startVal, end: e.target.value });
                                            }}
                                            className="w-full p-2.5 bg-white border border-tossGrey200 rounded-xl font-bold text-xs text-tossGrey800 outline-none"
                                        >
                                            {Array.from({ length: 12 }, (_, i) => 11 + i).map(h => {
                                                const val = `${h < 10 ? '0' + h : h}:00`;
                                                const startHour = selectedSlot ? parseInt(selectedSlot.start.split(':')[0]) : 10;
                                                // Exclude end times that are before or equal to start time
                                                if (h <= startHour) return null;
                                                return <option key={val} value={val}>{val}</option>;
                                            })}
                                        </select>
                                    </div>
                                </div>

                                {/* Visual timeline representation of bookings */}
                                <div className="space-y-1.5 mt-2">
                                    <span className="text-[9px] font-black text-tossGrey400 block uppercase">공간 대여 타임라인</span>
                                    <div className="h-6 w-full bg-tossGrey200 rounded-lg flex overflow-hidden relative border border-tossGrey150 select-none">
                                        {Array.from({ length: 12 }, (_, i) => 10 + i).map(h => {
                                            const hourStr = `${h}:00`;
                                            const isReserved = dayBookings.some(b => {
                                                const startH = parseInt(b.start_time.split(':')[0]);
                                                const endH = parseInt(b.end_time.split('|')[0].split(':')[0]);
                                                return h >= startH && h < endH;
                                            });

                                            const isSelectedRange = selectedSlot && (() => {
                                                const startH = parseInt(selectedSlot.start.split(':')[0]);
                                                const endH = parseInt(selectedSlot.end.split(':')[0]);
                                                return h >= startH && h < endH;
                                            })();

                                            return (
                                                <div 
                                                    key={h} 
                                                    title={`${h}:00 - ${h+1}:00`}
                                                    className={`flex-1 h-full text-[8px] font-black flex items-center justify-center border-r border-white/20 last:border-0 ${
                                                        isReserved 
                                                            ? 'bg-red-400 text-white' 
                                                            : isSelectedRange 
                                                                ? 'bg-tossBlue text-white' 
                                                                : 'bg-green-500 text-white'
                                                    }`}
                                                >
                                                    {h}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex gap-3 justify-end text-[9px] font-bold text-tossGrey500 mt-1">
                                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-500 rounded"></span> 가능</div>
                                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-tossBlue rounded"></span> 내 예약</div>
                                        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-400 rounded"></span> 사용중</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Overlap Warning Indicator */}
                        {(() => {
                            if (!selectedSlot) return null;
                            const startH = parseInt(selectedSlot.start.split(':')[0]);
                            const endH = parseInt(selectedSlot.end.split(':')[0]);
                            const isOverlapping = dayBookings.some(b => {
                                const bStartH = parseInt(b.start_time.split(':')[0]);
                                const bEndH = parseInt(b.end_time.split('|')[0].split(':')[0]);
                                // Overlap logic: start1 < end2 && start2 < end1
                                return startH < bEndH && bStartH < endH;
                            });

                            if (isOverlapping) {
                                return (
                                    <div className="bg-red-50 text-red-600 border border-red-100 rounded-toss-xl p-3 flex gap-2 text-xs font-bold leading-normal">
                                        <AlertCircle size={16} className="shrink-0 text-red-500 mt-0.5" />
                                        <span>선택하신 시간대에 이미 확정되었거나 승인 대기 중인 예약이 겹쳐 있습니다. 다른 시간을 골라주세요.</span>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* 3. Purpose and Headcount Inputs */}
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-tossGrey400 uppercase tracking-wider block">모임 이름 <span className="text-tossError">*</span></label>
                                <input
                                    type="text"
                                    placeholder="학교와 동아리 이름을 입력해주세요 ex. OO학교 <동아리 이름>"
                                    value={meetingName}
                                    onChange={(e) => setMeetingName(e.target.value)}
                                    className="w-full p-3 bg-tossGrey50 border border-tossGrey200 rounded-toss-xl outline-none font-bold text-tossGrey800 text-sm focus:border-tossBlue"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-tossGrey400 uppercase tracking-wider block">이용 인원 <span className="text-tossError">*</span></label>
                                <input
                                    type="number"
                                    min="1"
                                    placeholder="예: 4"
                                    value={headcount}
                                    onChange={(e) => setHeadcount(e.target.value)}
                                    className="w-full p-3 bg-tossGrey50 border border-tossGrey200 rounded-toss-xl outline-none font-bold text-tossGrey800 text-sm focus:border-tossBlue"
                                    required
                                />
                            </div>
                             <div className="space-y-2">
                                <label className="text-xs font-black text-tossGrey400 uppercase tracking-wider block">공간 이용 목적 <span className="text-tossError">*</span></label>
                                <input
                                    type="text"
                                    placeholder="예: 우리만의 스쿨처치 모임"
                                    value={purpose}
                                    onChange={(e) => setPurpose(e.target.value)}
                                    className="w-full p-3 bg-tossGrey50 border border-tossGrey200 rounded-toss-xl outline-none font-bold text-tossGrey800 text-sm focus:border-tossBlue"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-tossGrey400 uppercase tracking-wider block">기타 요청 사항</label>
                                <textarea
                                    rows="2"
                                    placeholder="추가 요청 사항이나 전하고 싶은 메모를 입력해주세요 (선택)"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full p-3 bg-tossGrey50 border border-tossGrey200 rounded-toss-xl outline-none font-bold text-tossGrey800 text-sm focus:border-tossBlue resize-none"
                                />
                            </div>
                        </div>

                        {/* Info banner */}
                        <div className="bg-tossBlueLight/30 border border-tossBlue/10 rounded-toss-xl p-4 flex flex-col gap-3 text-xs font-bold text-tossBlueDark">
                            <div className="flex gap-2">
                                <AlertCircle size={18} className="shrink-0 text-tossBlue" />
                                <div>
                                    <p className="font-extrabold">꼭 확인해 주세요!</p>
                                    <p className="text-[11px] text-tossGrey600 font-normal mt-1 leading-relaxed">
                                        스쿨처치 모임을 위해 공간을 이용할 수 있습니다. 신청이 접수되면 관리자가 센터 일정을 고려하여 승인합니다.
                                    </p>
                                </div>
                            </div>
                            <div className="border-t border-tossBlue/20 pt-3 mt-1">
                                <p className="font-extrabold mb-1">공간 이용 방법 안내</p>
                                <ul className="text-[11px] text-tossGrey600 font-normal leading-relaxed space-y-1 pl-4 list-decimal">
                                    <li>이용 당일 2층 인포데스크에서 체크인 이후 출입 키를 수령해주세요.</li>
                                    <li>공간 이용 이후 체크아웃 시 반드시 출입 키를 반납해주세요.</li>
                                    <li>모두가 함께 쓰는 공간이니 깨끗하고 소중히 이용해주세요!</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Footer Action */}
                    <div className="p-5 border-t border-tossGrey100 bg-tossGrey50">
                        <button
                            disabled={
                                !selectedSlot || 
                                !purpose.trim() || 
                                !headcount.trim() ||
                                !meetingName.trim() ||
                                submitting || 
                                (() => {
                                    const startH = parseInt(selectedSlot.start.split(':')[0]);
                                    const endH = parseInt(selectedSlot.end.split(':')[0]);
                                    return dayBookings.some(b => {
                                        const bStartH = parseInt(b.start_time.split(':')[0]);
                                        const bEndH = parseInt(b.end_time.split('|')[0].split(':')[0]);
                                        return startH < bEndH && bStartH < endH;
                                    });
                                })()
                            }
                            onClick={handleBooking}
                            className="w-full py-4 bg-tossBlue text-white font-extrabold text-sm rounded-toss-xl shadow-toss-subtle disabled:bg-tossGrey300 disabled:shadow-none hover:bg-tossBlueDark transition-colors flex items-center justify-center"
                        >
                            {submitting ? '신청 처리 중...' : (tutorialMode ? '체험으로 신청하기' : '공간 이용 신청')}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default RentalBookingModal;

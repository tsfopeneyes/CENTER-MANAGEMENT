import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, MapPin, Users, Trash2, Tag, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ModernEditor from '../../../common/ModernEditor';
import DatePicker from '../../../common/DatePicker';
import TimePicker from '../../../common/TimePicker';
import WriteForm from '../../board/components/forms/WriteForm';
import { getCalendarEventTheme, getProgramCalendarTheme } from '../../../../utils/calendarColors';
import useModalClose from '../../../../hooks/useModalClose';

const HAIFN_DETAILS = [
    'B1F STAGE',
    '2F SQUARE',
    '3F ROUND',
    '4F CONNECT 1',
    '4F CONNECT 2',
    '4F CONNECT 3',
    '4F CONNECT ROOM',
    '6F LOUNGE'
];

const EventEditModal = ({ 
    formData, 
    setFormData, 
    selectedEvent, 
    setSelectedEvent, 
    dynamicCategories, calendarCategories,
    handleSaveEvent, 
    handleDelete, 
    setShowModal,
    setActiveMenu,
    onProgramSaved,
    onOpenProgram
}) => {
    useModalClose(true, () => setShowModal(false));
    const [localMain, setLocalMain] = useState('');
    const [selectedDetail, setSelectedDetail] = useState('');
    const [customVal, setCustomVal] = useState('');

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setShowModal(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setShowModal]);

    // Determine read-only state
    const isProgram = selectedEvent?.id?.startsWith('PRG-') || selectedEvent?.isPublic;
    const isRental = selectedEvent?.id?.startsWith('RNT-') || selectedEvent?.category_id === 'RENTAL';
    const isReadOnly = isProgram || isRental;

    const openProgramManagement = () => {
        const noticeId = selectedEvent?.originalId || selectedEvent?.raw?.id;
        if (!noticeId) {
            alert('연결된 프로그램 정보를 찾지 못했습니다.');
            return;
        }
        setShowModal(false);
        if (onOpenProgram) onOpenProgram(noticeId);
        else setActiveMenu('PROGRAMS');
    };

    // Initialize/Sync local main categories for location picker
    useEffect(() => {
        const initialLocation = formData.program_location || '';
        if (initialLocation === '이높플레이스') {
            setLocalMain('이높플레이스');
            setSelectedDetail('');
            setCustomVal('');
        } else if (initialLocation.startsWith('하이픈 ')) {
            setLocalMain('하이픈');
            const detail = initialLocation.substring(4);
            setSelectedDetail(HAIFN_DETAILS.includes(detail) ? detail : '');
            setCustomVal('');
        } else if (initialLocation) {
            setLocalMain('기타');
            setSelectedDetail('');
            setCustomVal(initialLocation);
        } else {
            setLocalMain('');
            setSelectedDetail('');
            setCustomVal('');
        }
    }, [formData.program_location, selectedEvent]);

    // Sync local states back to formData.program_location
    useEffect(() => {
        if (isReadOnly || formData.type !== 'PROGRAM') return;
        let expected = '';
        if (localMain === '이높플레이스') {
            expected = '이높플레이스';
        } else if (localMain === '하이픈') {
            expected = selectedDetail ? `하이픈 ${selectedDetail}` : '';
        } else if (localMain === '기타') {
            expected = customVal;
        }
        
        if (formData.program_location !== expected) {
            setFormData(prev => ({ ...prev, program_location: expected }));
        }
    }, [localMain, selectedDetail, customVal, formData.type, setFormData, isReadOnly]);

    // Parse period time e.g. 18:30 to 오후 6시 30분, 18:00 to 오후 6시
    const formatTimeWithPeriod = (timeStr) => {
        if (!timeStr) return '';
        const [hStr, mStr] = timeStr.split(':');
        let hour = parseInt(hStr, 10);
        const minute = parseInt(mStr, 10);
        const period = hour >= 12 ? '오후' : '오전';
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;
        return `${period} ${hour}시${minute > 0 ? ` ${minute}분` : ''}`;
    };

    // Helper to format date cleanly and unify between Program and Rental
    const formatDateTimeRange = (date, startTime, endTime) => {
        if (!date) return '미정';
        try {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            const weekday = weekdays[d.getDay()];
            
            const datePart = `${year}년 ${month}월 ${day}일 (${weekday})`;
            
            if (startTime && endTime) {
                return `${datePart} ${formatTimeWithPeriod(startTime)} ~ ${formatTimeWithPeriod(endTime)}`;
            } else if (startTime) {
                return `${datePart} ${formatTimeWithPeriod(startTime)}`;
            }
            return datePart;
        } catch (e) {
            return date;
        }
    };

    // Get end time based on start time and duration string
    const getEndTimeFromDuration = (startTime, durationStr) => {
        if (!startTime) return '';
        if (!durationStr) return '';
        try {
            const [h, m] = startTime.split(':').map(Number);
            let durationMinutes = 0;
            
            const hourMatch = durationStr.match(/(\d+(?:\.\d+)?)\s*시간/);
            const minMatch = durationStr.match(/(\d+)\s*분/);
            
            if (hourMatch) durationMinutes += parseFloat(hourMatch[1]) * 60;
            if (minMatch) durationMinutes += parseInt(minMatch[1], 10);
            
            if (durationMinutes === 0 && !isNaN(durationStr.trim())) {
                durationMinutes = parseFloat(durationStr.trim()) * 60;
            }
            
            if (durationMinutes === 0) return '';
            
            const totalMinutes = h * 60 + m + durationMinutes;
            const endHour = Math.floor(totalMinutes / 60) % 24;
            const endMin = Math.floor(totalMinutes % 60);
            
            return `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
        } catch (e) {
            return '';
        }
    };

    // Parse rental properties
    let rentalData = {};
    if (isRental && selectedEvent?.raw) {
        const rb = selectedEvent.raw;
        const endParts = (rb.end_time || '').split('|');
        const region = rb.rentals?.schools?.region;
        const regionName = region === '강동' ? '하이픈' : region === '강서' ? '이높플레이스' : '';
        
        let rawSpaceName = rb.rentals?.name || '공간';
        try {
            if (rawSpaceName.startsWith('{')) {
                rawSpaceName = JSON.parse(rawSpaceName).name;
            }
        } catch (e) {}
        const spaceName = `${regionName ? regionName + ' ' : ''}${rawSpaceName}`;

        rentalData = {
            bookingDate: rb.booking_date,
            startTime: rb.start_time,
            endTime: endParts[0] || '18:00',
            purpose: endParts[1] || '미정',
            capacity: endParts[2] || '미정',
            meetingName: endParts[3] || '공간 대여',
            customNotes: endParts.length > 4 ? endParts[4] : '',
            rejectionReason: endParts.length > 5 ? endParts[5] : '',
            spaceName
        };
    }

    // Program specific computed end time
    let programEndTime = '';
    if (isProgram && selectedEvent?.raw) {
        programEndTime = getEndTimeFromDuration(formData.start_time, selectedEvent.raw.duration);
    }

    if (formData.type === 'PROGRAM' && !isReadOnly) return (
        <motion.div className="fixed inset-0 z-[200] bg-black/40 p-3 sm:p-6 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mx-auto max-w-4xl rounded-3xl bg-white p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold">프로그램 등록</h2><button type="button" aria-label="닫기" onClick={() => setShowModal(false)}><X size={22} /></button></div>
                <button type="button" className="text-xs font-bold text-blue-600 mb-4" onClick={() => setFormData(previous => ({ ...previous, type: 'SCHEDULE' }))}>← 일반 일정으로 돌아가기</button>
                <WriteForm mode="PROGRAM" initialProgramDate={formData.start_date + 'T' + (formData.start_time || '12:00')} onSave={() => { onProgramSaved?.(); setShowModal(false); }} onCancel={() => setShowModal(false)} flat />
            </div>
        </motion.div>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white w-full max-w-md rounded-[2rem] shadow-[0_30px_100px_rgba(0,0,0,0.25)] overflow-hidden relative z-10 border border-gray-100 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                    <div>
                        {/* Category Badge Line */}
                        <div className="mb-2">
                            {isProgram ? (
                                <span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-wider ${getProgramCalendarTheme(formData, calendarCategories).color}`}>
                                    {formData.program_type === 'SCHOOL_CHURCH' ? '스처 프로그램' : '센터 프로그램'}
                                </span>
                            ) : isRental ? (
                                <span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-wider ${getCalendarEventTheme(selectedEvent, calendarCategories).color}`}>
                                    공간 대여
                                </span>
                            ) : (
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                                    일반 일정
                                </span>
                            )}
                        </div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tighter leading-tight">
                            {isRental ? rentalData.meetingName : (formData.title || '제목 없음')}
                        </h3>
                    </div>
                    <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"><X size={20} /></button>
                </div>

                {/* Body Content */}
                {isReadOnly ? (
                    /* Read-Only Layout */
                    <div className="p-6 space-y-5 overflow-y-auto flex-1">
                        {/* Rejection Banner */}
                        {isRental && rentalData.rejectionReason && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3 text-xs text-red-700 font-bold leading-normal">
                                <Info size={16} className="text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-extrabold text-red-800">반려된 신청 (반려 사유)</p>
                                    <p className="mt-0.5 text-red-600">{rentalData.rejectionReason}</p>
                                </div>
                            </div>
                        )}

                        {/* Detail Info Grid Cards */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs font-bold text-gray-700">
                            {isProgram ? (
                                <>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3 col-span-2">
                                        <CalendarIcon className="text-pink-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">일정</p>
                                            <p className="mt-0.5 whitespace-nowrap">{formatDateTimeRange(formData.start_date, formData.start_time, programEndTime)}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                                        <MapPin className="text-pink-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">장소</p>
                                            <p className="mt-0.5">{formData.program_location || '미정'}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                                        <Users className="text-pink-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">모집 정원</p>
                                            <p className="mt-0.5">{formData.max_capacity ? `${formData.max_capacity}명` : '제한 없음'}</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3 col-span-2">
                                        <CalendarIcon className="text-purple-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">이용 시간</p>
                                            <p className="mt-0.5 whitespace-nowrap">{formatDateTimeRange(rentalData.bookingDate, rentalData.startTime, rentalData.endTime)}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                                        <MapPin className="text-purple-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">대여 공간</p>
                                            <p className="mt-0.5">{rentalData.spaceName}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                                        <Users className="text-purple-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">이용 인원</p>
                                            <p className="mt-0.5">{rentalData.capacity}명</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3 col-span-2">
                                        <Tag className="text-purple-500" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase">이용 목적</p>
                                            <p className="mt-0.5 truncate">{rentalData.purpose}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Rich Content View */}
                        <div className="space-y-2">
                            <p className="text-[10px] text-gray-400 font-extrabold uppercase ml-1">상세 내용 및 요청 사항</p>
                            <div className="p-5 border border-gray-100 rounded-2xl bg-white min-h-[120px] max-h-[200px] overflow-y-auto shadow-inner text-sm text-gray-700 leading-relaxed">
                                {isProgram ? (
                                    <div dangerouslySetInnerHTML={{ __html: formData.content || '<span class="text-gray-300">상세 설명이 없습니다.</span>' }} />
                                ) : (
                                    <p className="whitespace-pre-wrap">{rentalData.customNotes || formData.content || '기타 요청 사항이 없습니다.'}</p>
                                )}
                            </div>
                        </div>

                        {/* Direct Switch Buttons */}
                        {isProgram && setActiveMenu && (
                            <button
                                type="button"
                                onClick={openProgramManagement}
                                className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-2xl font-black shadow-lg shadow-pink-200 text-xs tracking-wider transition-all"
                            >
                                프로그램 관리 바로가기
                            </button>
                        )}
                        {isRental && setActiveMenu && (
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveMenu('RENTAL_MGMT');
                                    setShowModal(false);
                                }}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black shadow-lg shadow-purple-200 text-xs tracking-wider transition-all"
                            >
                                대관 관리 바로가기
                            </button>
                        )}

                        {/* Help Banner Tip */}
                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 text-xs text-blue-700 font-bold leading-normal">
                            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                            <p>
                                {isProgram 
                                    ? '본 프로그램의 상세 정보(날짜, 시간, 정원, 설명 등) 수정은 [프로그램 관리] 메뉴에서 편집하실 수 있습니다.'
                                    : '본 공간 대여 예약 내역의 수정은 [대관 신청 현황] 메뉴에서 승인 수정 처리가 가능합니다.'
                                }
                            </p>
                        </div>
                    </div>
                ) : (
                    /* Editable Form Layout */
                    <form onSubmit={handleSaveEvent} className="p-5 pt-2 space-y-4 overflow-y-auto flex-1">
                        <div className="space-y-4">
                            {!selectedEvent && (
                                <div className="flex gap-2 p-1 bg-gray-50 rounded-xl border border-gray-100">
                                    {[{ id: 'SCHEDULE', label: '일반 일정', icon: <CalendarIcon size={12} /> }, { id: 'PROGRAM', label: '프로그램', icon: <Users size={12} /> }].map(opt => (
                                        <button key={opt.id} type="button" onClick={() => setFormData(prev => ({ ...prev, type: opt.id, category_id: opt.id === 'PROGRAM' ? 'PROGRAM' : dynamicCategories[0]?.id || '' }))} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black transition-all ${formData.type === opt.id ? 'bg-white text-blue-600 shadow-sm border border-blue-50' : 'text-gray-400 hover:text-gray-600'}`}>{opt.icon}{opt.label}</button>
                                    ))}
                                </div>
                            )}
                            {(() => {
                                const isClosedDay = dynamicCategories?.find(c => c.id === formData.category_id)?.name === '휴관';
                                return (
                                    <input 
                                        type="text" 
                                        placeholder={isClosedDay ? "일정 제목 (선택사항 - 기본값: '휴관')" : "일정 제목을 입력하세요"} 
                                        value={formData.title} 
                                        onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} 
                                        className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:bg-white focus:border-blue-500 font-bold transition shadow-inner text-sm" 
                                        required={!isClosedDay} 
                                    />
                                );
                            })()}
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">시작 날짜</label>
                                    <DatePicker label="시작 날짜" value={formData.start_date} onChange={date => setFormData(prev => ({ ...prev, start_date: date }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">시간</label>
                                    <TimePicker label="시작 시간" value={formData.start_time} onChange={time => setFormData(prev => ({ ...prev, start_time: time }))} clearable />
                                </div>
                            </div>

                            {formData.type === 'PROGRAM' && (
                                <div className="flex gap-3 p-1 bg-gray-50 rounded-xl border border-gray-100">
                                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, program_type: 'CENTER' }))} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${formData.program_type === 'CENTER' ? 'bg-white text-pink-600 shadow-sm border border-pink-50' : 'text-gray-400'}`}>센터 프로그램</button>
                                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, program_type: 'SCHOOL_CHURCH' }))} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${formData.program_type === 'SCHOOL_CHURCH' ? 'bg-white text-purple-600 shadow-sm border border-purple-50' : 'text-gray-400'}`}>스처 프로그램</button>
                                </div>
                            )}

                            {formData.type === 'SCHEDULE' && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">종료 날짜</label>
                                            <DatePicker label="종료 날짜" value={formData.end_date} onChange={date => setFormData(prev => ({ ...prev, end_date: date }))} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">시간</label>
                                            <TimePicker label="종료 시간" value={formData.end_time} onChange={time => setFormData(prev => ({ ...prev, end_time: time }))} clearable />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">카테고리</label>
                                        <select
                                            value={formData.category_id}
                                            onChange={e => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
                                            className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:bg-white focus:border-blue-500 font-bold transition shadow-inner appearance-none text-xs"
                                        >
                                            {dynamicCategories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* RECURRENCE UI */}
                                    {!selectedEvent && (
                                        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50 space-y-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.isRecurring}
                                                    onChange={e => setFormData(prev => ({ ...prev, isRecurring: e.target.checked }))}
                                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                                />
                                                <span className="text-xs font-black text-blue-600">매주 반복 일정 등록</span>
                                            </label>

                                            {formData.isRecurring && (
                                                <div className="space-y-3 animate-fade-in">
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">반복 요일</label>
                                                        <div className="flex justify-between gap-1">
                                                            {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (
                                                                <button
                                                                    key={d}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const current = formData.recurringDays;
                                                                        const next = current.includes(idx)
                                                                            ? current.filter(day => day !== idx)
                                                                            : [...current, idx];
                                                                        setFormData(prev => ({ ...prev, recurringDays: next }));
                                                                    }}
                                                                    className={`w-7 h-7 rounded-full text-[10px] font-black transition-all ${formData.recurringDays.includes(idx)
                                                                        ? 'bg-blue-600 text-white shadow-md scale-110'
                                                                        : 'bg-white text-gray-400 border border-gray-100'
                                                                        }`}
                                                                >
                                                                    {d}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">반복 종료일</label>
                                                        <DatePicker
                                                            label="반복 종료일"
                                                            value={formData.recurringEndDate}
                                                            onChange={date => setFormData(prev => ({ ...prev, recurringEndDate: date }))}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Closed Day Space Selection */}
                                    {dynamicCategories.find(c => c.id === formData.category_id)?.name === '휴관' && (
                                        <div className="p-3 bg-orange-50/50 rounded-xl border border-orange-100/50 space-y-3">
                                            <div className="flex items-center gap-2 text-orange-600">
                                                <MapPin size={16} strokeWidth={3} />
                                                <span className="text-[10px] font-black uppercase tracking-wider">휴관 공간 선택</span>
                                            </div>
                                            <div className="flex gap-3">
                                                {[
                                                    { id: 'HAIFN', label: '하이픈' },
                                                    { id: 'ENOUGH_PLACE', label: '이높플레이스' }
                                                ].map(space => (
                                                    <button
                                                        key={space.id}
                                                        type="button"
                                                        onClick={() => {
                                                            const current = formData.closed_spaces || [];
                                                            const next = current.includes(space.id)
                                                                ? current.filter(s => s !== space.id)
                                                                : [...current, space.id];
                                                            setFormData(prev => ({ ...prev, closed_spaces: next }));
                                                        }}
                                                        className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${formData.closed_spaces?.includes(space.id)
                                                            ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                                                            : 'bg-white text-gray-400 border-gray-100'
                                                            }`}
                                                    >
                                                        {space.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {formData.type === 'PROGRAM' && (
                                <div className="p-3 bg-pink-50/50 rounded-xl border border-pink-100/50 space-y-3">
                                    <div className="flex items-center gap-2 text-pink-600"><Users size={14} strokeWidth={3} /><span className="text-[10px] font-black uppercase tracking-wider">Program Details</span></div>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest ml-1">장소 구분</label>
                                                <select
                                                    value={localMain}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setLocalMain(val);
                                                        if (val === '이높플레이스') {
                                                            setSelectedDetail('');
                                                            setCustomVal('');
                                                        } else if (val === '하이픈') {
                                                            setSelectedDetail(HAIFN_DETAILS[0]);
                                                            setCustomVal('');
                                                        } else {
                                                            setSelectedDetail('');
                                                            setCustomVal('');
                                                        }
                                                    }}
                                                    className="w-full p-2 bg-white border border-pink-100 rounded-lg outline-none text-xs font-bold"
                                                >
                                                    <option value="">-- 선택 --</option>
                                                    <option value="하이픈">하이픈</option>
                                                    <option value="이높플레이스">이높플레이스</option>
                                                    <option value="기타">기타</option>
                                                </select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest ml-1">모집 인원</label>
                                                <input
                                                    type="number"
                                                    placeholder="0"
                                                    value={formData.max_capacity}
                                                    onChange={e => setFormData(prev => ({ ...prev, max_capacity: e.target.value }))}
                                                    className="w-full p-2 bg-white border border-pink-100 rounded-lg outline-none text-xs font-bold"
                                                />
                                            </div>
                                        </div>

                                        {localMain === '하이픈' && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest ml-1">세부 공간</label>
                                                <select
                                                    value={selectedDetail}
                                                    onChange={e => setSelectedDetail(e.target.value)}
                                                    className="w-full p-2 bg-white border border-pink-100 rounded-lg outline-none text-xs font-bold"
                                                >
                                                    {HAIFN_DETAILS.map(detail => (
                                                        <option key={detail} value={detail}>{detail}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {localMain === '기타' && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest ml-1">상세 장소 직접 입력</label>
                                                <input
                                                    type="text"
                                                    placeholder="장소를 직접 입력하세요"
                                                    value={customVal}
                                                    onChange={e => setCustomVal(e.target.value)}
                                                    className="w-full p-2 bg-white border border-pink-100 rounded-lg outline-none text-xs font-bold"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">상세 내용 및 메모</label>
                                <div className="min-h-[220px] border border-gray-100 rounded-2xl overflow-hidden focus-within:border-blue-500 transition-colors shadow-inner">
                                    <ModernEditor
                                        content={formData.content}
                                        onChange={v => setFormData(prev => ({ ...prev, content: v }))}
                                        placeholder="상세 내용을 입력하세요..."
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            {selectedEvent && <button type="button" onClick={handleDelete} className="p-3 bg-gray-50 text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-all shadow-sm"><Trash2 size={18} strokeWidth={3} /></button>}
                            <button type="submit" className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-black shadow-xl shadow-gray-200 hover:bg-gray-800 hover:scale-[1.02] active:scale-95 transition-all text-xs uppercase tracking-widest">저장하기</button>
                        </div>
                    </form>
                )}
            </motion.div>
        </div>
    );
};

export default EventEditModal;

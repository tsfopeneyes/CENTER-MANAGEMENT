import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronDown, Filter, MoreVertical, Calendar as CalendarIcon, Edit2 } from 'lucide-react';
import { format, parseISO, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getCalendarEventTheme } from '../../../../utils/calendarColors';
import { stripHtml } from '../../../../utils/textUtils';

const MobileDayDetailOverlay = ({
    selectedDate, setSelectedDate,
    showDayDetail, setShowDayDetail,
    allEvents, isEventOnDay,
    handleEventClick,
    formData, setFormData, 
    setSelectedEvent, setShowModal,
    dynamicCategories, calendarCategories
}) => {
    return (
                
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed inset-0 z-[150] bg-white flex flex-col md:hidden"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white pt-SAFE_AREA_INSET_TOP">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setShowDayDetail(false)} className="p-2 -ml-2 text-gray-400 active:scale-90 transition-all">
                                    <ChevronLeft size={28} />
                                </button>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-xl font-black text-gray-900 tracking-tighter">
                                        {format(selectedDate, 'M월')}
                                    </h3>
                                    <ChevronDown size={14} className="text-gray-300" />
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="text-gray-400"><Filter size={20} /></button>
                                <button className="text-gray-400"><MoreVertical size={20} /></button>
                            </div>
                        </div>

                        {/* Selected Date Info (e.g., "9 월요일") */}
                        <div className="px-6 py-6 flex items-center gap-4">
                            <div className={`w-12 h-12 flex flex-col items-center justify-center rounded-full bg-gray-900 text-white shadow-xl shadow-gray-200 ring-4 ring-white`}>
                                <span className="text-lg font-black leading-none">{format(selectedDate, 'd')}</span>
                            </div>
                            <h2 className="text-lg font-bold text-gray-800 tracking-tight">
                                {format(selectedDate, 'EEEE', { locale: ko })}
                            </h2>
                        </div>

                        {/* Event List */}
                        <div className="flex-1 overflow-y-auto px-1">
                            {allEvents.filter(e => isEventOnDay(e, selectedDate)).length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-300 gap-4 opacity-50">
                                    <CalendarIcon size={48} strokeWidth={1} />
                                    <p className="text-sm font-bold tracking-tight">일정이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {allEvents.filter(e => isEventOnDay(e, selectedDate)).map(event => {
                                        const theme = getCalendarEventTheme(event, calendarCategories);
                                        const startTime = event.raw.start_time;
                                        const endTime = event.raw.end_time;

                                        // Refined NOW badge logic
                                        const now = new Date();
                                        const isTodayEvent = isToday(selectedDate);
                                        let showNowBadge = false;
                                        if (isTodayEvent && startTime && endTime) {
                                            try {
                                                const start = parseISO(format(now, 'yyyy-MM-dd') + 'T' + startTime);
                                                const end = parseISO(format(now, 'yyyy-MM-dd') + 'T' + endTime);
                                                showNowBadge = now >= start && now <= end;
                                            } catch (e) { }
                                        }

                                        return (
                                            <div
                                                key={event.id}
                                                onClick={(e) => {
                                                    setShowDayDetail(false);
                                                    handleEventClick(e, event);
                                                }}
                                                className="flex items-start gap-5 p-5 active:bg-gray-50 transition-all group border-b border-gray-50/50 last:border-none"
                                            >
                                                <div className="w-16 pt-0.5">
                                                    {!startTime ? (
                                                        <span className="text-xs font-bold text-gray-400">종일</span>
                                                    ) : (
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex flex-col leading-tight">
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className="text-[9px] font-bold text-gray-400">
                                                                        {format(parseISO(`2000-01-01T${startTime}`), 'aaa', { locale: ko })}
                                                                    </span>
                                                                    <span className="text-sm font-black text-gray-800 tracking-tighter">
                                                                        {format(parseISO(`2000-01-01T${startTime}`), 'h:mm')}
                                                                    </span>
                                                                </div>
                                                                {endTime && (
                                                                    <div className="flex items-baseline gap-1 opacity-30 mt-[-2px]">
                                                                        <span className="text-[8px] font-bold text-gray-400">
                                                                            {format(parseISO(`2000-01-01T${endTime}`), 'aaa', { locale: ko })}
                                                                        </span>
                                                                        <span className="text-[10px] font-bold text-gray-800">
                                                                            {format(parseISO(`2000-01-01T${endTime}`), 'h:mm')}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 flex gap-3.5 min-w-0">
                                                    <div className={`w-[2.5px] rounded-full ${theme.dot} opacity-40 h-10 mt-1`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            {showNowBadge && (
                                                                <span className="px-1.5 py-0.5 rounded border border-red-500 text-red-500 text-[8px] font-black tracking-tighter leading-none bg-white">NOW</span>
                                                            )}
                                                            <h4 className="text-[14px] font-bold text-gray-900 truncate tracking-tight">{event.title}</h4>
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 truncate leading-relaxed opacity-80">{stripHtml(event.content) || '-'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Floating Add Button */}
                        <div className="p-8 fixed bottom-0 right-0 z-[160]">
                            <button
                                onClick={() => {
                                    setShowDayDetail(false);
                                    setFormData({
                                        ...formData,
                                        start_date: format(selectedDate, 'yyyy-MM-dd'),
                                        end_date: format(selectedDate, 'yyyy-MM-dd'),
                                        type: 'SCHEDULE',
                                        category_id: dynamicCategories[0]?.id || ''
                                    });
                                    setSelectedEvent(null);
                                    setShowModal(true);
                                }}
                                className="w-16 h-16 flex items-center justify-center bg-[#24C06A] text-white rounded-full shadow-2xl shadow-green-200 active:scale-95 transition-all"
                            >
                                <Edit2 size={30} strokeWidth={2.5} />
                            </button>
                        </div>
                    </motion.div>
                
    );
};
export default MobileDayDetailOverlay;

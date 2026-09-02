import React from 'react';
import { format, isSameMonth, isSameDay, getDay, startOfMonth, isToday, parseISO, addMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Filter, Check, Settings, Palette, Calendar as CalendarIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useAdminCalendar } from './hooks/useAdminCalendar';
import { getColorTheme, getCalendarEventTheme } from '../../../utils/calendarColors';

import EventEditModal from './modals/EventEditModal';
import CategorySettingsModal from './modals/CategorySettingsModal';
import MobileDayDetailOverlay from './modals/MobileDayDetailOverlay';

import AdminPageHeader from '../common/AdminPageHeader';
import DutyRosterEditor from './DutyRosterEditor';

const AdminCalendar = ({ notices, fetchData, setActiveMenu }) => {
    const hookData = useAdminCalendar({ notices, fetchData, setActiveMenu });
    const { 
        currentDate, dynamicCategories, calendarCategories, programCategories,
        showModal, setShowModal,
        showCategoryModal, setShowCategoryModal,
        showDayDetail, setShowDayDetail,
        selectedDate, setSelectedDate,
        visibleCategories, 
        allEvents, isEventOnDay,
        monthStart, calendarDays,
        nextMonth, prevMonth, goToToday,
        handleDateClick, handleEventClick, toggleCategory,
        formData, setFormData, selectedEvent, setSelectedEvent,
        handleSaveEvent, handleDelete,
        categoryForm, setCategoryForm, editCategory, setEditCategory,
        handleSaveCategory, handleDeleteCategory
    } = hookData;

    const actions = (
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <div className="flex items-center gap-4 bg-gray-50/50 p-1.5 rounded-2xl border border-gray-100">
                <div className="flex items-center bg-white rounded-lg p-0.5 overflow-hidden border border-gray-100 shadow-sm">
                    <button onClick={prevMonth} className="p-1 hover:bg-slate-50 rounded transition-all text-gray-500">
                        <ChevronLeft size={16} />
                    </button>
                    <button onClick={nextMonth} className="p-1 hover:bg-slate-50 rounded transition-all text-gray-500">
                        <ChevronRight size={16} />
                    </button>
                </div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-lg md:text-xl font-black text-gray-900 tracking-tighter flex items-center">
                        {format(currentDate, 'yyyy', { locale: ko })}.{format(currentDate, 'MM', { locale: ko })}
                    </h3>
                    <button onClick={goToToday} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black rounded-full hover:bg-blue-100 transition-colors uppercase tracking-widest">Today</button>
                </div>
            </div>
            
            <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center justify-center p-2.5 bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-100 rounded-xl shadow-sm transition-all"
                title="카테고리 관리"
            >
                <Settings size={18} />
            </button>
            <button
                onClick={() => {
                    setSelectedEvent(null);
                    setSelectedDate(new Date());
                    setFormData({
                        ...formData,
                        type: 'SCHEDULE',
                        start_date: format(new Date(), 'yyyy-MM-dd'),
                        category_id: dynamicCategories[0]?.id || '',
                        isRecurring: false,
                        recurringDays: [],
                        recurringEndDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd')
                    });
                    setShowModal(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs md:text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all"
            >
                <Plus size={16} />
                <span>일정 추가</span>
            </button>
        </div>
    );

    return (
        <div className="flex flex-col gap-6">
            <AdminPageHeader
                title="일정 관리"
                subtitle="센터 프로그램 및 학사 일정 관리"
                icon={<CalendarIcon />}
                actions={actions}
            />

            <div className="flex flex-col h-full bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-64 md:w-72 border-r border-gray-100 p-8 hidden md:block bg-white overflow-y-auto">
                    <div className="space-y-12">
                        <div>
                            <div className="flex items-center justify-between mb-8 px-1">
                                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">나의 캘린더</h3>
                                <Filter size={14} className="text-gray-300" />
                            </div>
                            <div className="space-y-1.5">
                                {[...programCategories, ...dynamicCategories].map((cat) => {
                                    const theme = getColorTheme(cat.color_theme);
                                    const isActive = visibleCategories[cat.id];
                                    return (
                                        <label key={cat.id} className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all cursor-pointer group ${isActive ? theme.background : 'hover:bg-gray-50'}`}>
                                            <div className={`relative w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center ${isActive ? theme.dot + ' border-transparent shadow-lg shadow-blue-100' : 'border-gray-200 group-hover:border-gray-300'}`}>
                                                <input type="checkbox" checked={Boolean(visibleCategories[cat.id])} onChange={() => toggleCategory(cat.id)} className="hidden" />
                                                {isActive && <Check size={12} className="text-white" strokeWidth={4} />}
                                            </div>
                                            <span className={`text-sm font-black transition-colors ${isActive ? theme.text : 'text-gray-400 group-hover:text-gray-600'}`}>
                                                {cat.name}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-8 border-t border-gray-50">
                            <button
                                onClick={() => setShowCategoryModal(true)}
                                className="w-full flex items-center justify-center gap-2.5 py-4 bg-gray-50 border border-gray-100 text-gray-500 rounded-2xl text-[11px] font-black uppercase tracking-wider hover:bg-white hover:text-blue-600 hover:border-blue-100 hover:shadow-sm transition-all"
                            >
                                <Palette size={16} />
                                카테고리 관리
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Grid */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="grid grid-cols-7 border-b border-gray-100 bg-white sticky top-0 z-10">
                        {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (
                            <div key={d} className={`p-3 text-center text-[10px] md:text-xs font-black uppercase tracking-widest ${idx === 0 ? 'text-red-400' : idx === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 flex-1 auto-rows-fr min-h-0 bg-gray-50/20">
                        {calendarDays.map((day, idx) => {
                            const dayEvents = allEvents.filter(e => isEventOnDay(e, day));
                            const isSelected = isSameDay(day, selectedDate);
                            const isCurrentMonth = isSameMonth(day, monthStart);
                            const dayOfWeek = getDay(day);

                            return (
                                <div
                                    key={day.toISOString()}
                                    onClick={() => {
                                        setSelectedDate(day);
                                        handleDateClick(day);
                                    }}
                                    className={`relative border-r border-b border-gray-100 flex flex-col pl-0.5 pr-1 py-1 md:p-2 transition-all group cursor-pointer min-h-[110px] md:min-h-[120px] ${!isCurrentMonth ? 'bg-gray-100/30' : 'bg-white hover:bg-blue-50/30'} ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`w-6 h-6 md:w-8 md:h-8 flex items-center justify-center rounded-lg text-[10px] md:text-xs font-black transition-all ${isToday(day) ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : ''} ${!isCurrentMonth ? 'text-gray-300' : dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                                            {format(day, 'd')}
                                        </span>
                                    </div>

                                    {/* Event Display (Unified for Desktop/Mobile but styled differently) */}
                                    <div className="flex-1 space-y-0.5 md:space-y-1">
                                        {dayEvents
                                            .sort((a, b) => {
                                                // Sort by duration descending, then start date
                                                const durA = (new Date(a.end) - new Date(a.start));
                                                const durB = (new Date(b.end) - new Date(b.start));
                                                if (durB !== durA) return durB - durA;
                                                return new Date(a.start) - new Date(b.start);
                                            })
                                            .slice(0, window.innerWidth < 768 ? 4 : 10).map(event => {
                                                const theme = getCalendarEventTheme(event, calendarCategories);
                                                const isMobile = window.innerWidth < 768;
                                                const mobileTextColor = theme.color.split(' ').find(c => c.startsWith('text-')) || 'text-gray-700';

                                                // Multi-day continuity logic
                                                const startDateStr = event.raw.start_date || event.raw.program_date || event.raw.booking_date;
                                                const endDateStr = event.raw.end_date || event.raw.program_date || event.raw.booking_date;
                                                const isStart = startDateStr ? isSameDay(day, parseISO(startDateStr)) : false;
                                                const isEnd = endDateStr ? isSameDay(day, parseISO(endDateStr)) : false;
                                                const isContinuous = !isStart || !isEnd;

                                                return (
                                                    <div
                                                        key={event.id}
                                                        onClick={(e) => {
                                                            if (!isMobile) handleEventClick(e, event);
                                                        }}
                                                        className={`
                                                        ${isMobile ? `
                                                            ${mobileTextColor} border-none leading-none overflow-hidden whitespace-nowrap
                                                            ${isContinuous ? `${theme.color} py-1 px-1 opacity-90` : 'pl-0.5 pr-1 py-0.5'}
                                                        ` : `
                                                            shadow-sm hover:brightness-95 active:scale-95 border ${theme.color} truncate px-2 py-0.5 md:py-1
                                                        `}
                                                        text-[8px] md:text-[10px] font-black transition-all duration-200
                                                        ${isStart && !isEnd ? 'rounded-l-[3px] md:rounded-l-md mr-[-4px] md:mr-[-8px] border-r-0' : ''}
                                                        ${!isStart && isEnd ? 'rounded-r-[3px] md:rounded-r-md ml-[-2px] md:ml-[-8px] border-l-0' : ''}
                                                        ${!isStart && !isEnd ? 'rounded-none ml-[-2px] mr-[-4px] md:mx-[-8px] border-x-0' : ''}
                                                        ${isStart && isEnd ? 'rounded-[3px] md:rounded-md' : ''}
                                                    `}
                                                        title={event.title}
                                                    >
                                                        {(isStart || dayOfWeek === 0 || isSameDay(day, startOfMonth(day))) ? event.title : '\u00A0'}
                                                    </div>
                                                );
                                            })}
                                        {dayEvents.length > (window.innerWidth < 768 ? 4 : 10) && (
                                            <div className="text-[7px] md:text-[8px] font-black text-gray-300 px-1">
                                                + {dayEvents.length - (window.innerWidth < 768 ? 3 : 10)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>

            {/* Injected Modals */}
            <AnimatePresence>
                {showModal && <EventEditModal {...hookData} onProgramSaved={fetchData} />}
            </AnimatePresence>

            <AnimatePresence>
                {showCategoryModal && <CategorySettingsModal {...hookData} />}
            </AnimatePresence>

            <AnimatePresence>
                {showDayDetail && <MobileDayDetailOverlay {...hookData} />}
            </AnimatePresence>
        </div>

        <DutyRosterEditor month={format(currentDate, 'yyyy-MM')} />
    </div>
    );
};

export default AdminCalendar;

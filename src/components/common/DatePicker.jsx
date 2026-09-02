import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const parseDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const date = parseISO(value);
    return isValid(date) ? date : null;
};
const dateKey = date => format(date, 'yyyy-MM-dd');
const todayInSeoul = () => parseISO(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()));

// Date-only values are kept as yyyy-MM-dd: never convert them through UTC.
export default function DatePicker({ label = '날짜', value = '', onChange, required = false, disabled = false, min, max, className = '' }) {
    const id = useId();
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const focusDayRef = useRef(false);
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => startOfMonth(parseDate(value) || todayInSeoul()));
    const [focusedDate, setFocusedDate] = useState(() => value || dateKey(todayInSeoul()));
    const [position, setPosition] = useState(null);
    const selected = parseDate(value);
    const today = dateKey(todayInSeoul());
    const minDate = parseDate(min);
    const maxDate = parseDate(max);
    const isAllowed = date => (!minDate || date >= minDate) && (!maxDate || date <= maxDate);
    const clampDate = date => minDate && date < minDate ? minDate : maxDate && date > maxDate ? maxDate : date;
    const days = eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(endOfMonth(month)) });

    const close = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    };
    const show = () => {
        if (disabled) return;
        const initial = clampDate(selected || todayInSeoul());
        setMonth(startOfMonth(initial));
        setFocusedDate(dateKey(initial));
        focusDayRef.current = true;
        setPosition(null);
        setOpen(true);
    };
    const choose = date => {
        onChange(date ? dateKey(date) : '');
        close(true);
    };

    // Portal prevents clipping inside scrolling forms and modal containers.
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const viewportWidth = document.documentElement.clientWidth;
            const width = Math.min(320, viewportWidth - 24);
            const above = Math.max(0, rect.top - 20);
            const below = Math.max(0, window.innerHeight - rect.bottom - 20);
            const upwards = below < 360 && above > below;
            setPosition({
                width,
                left: Math.max(12, Math.min(rect.left, viewportWidth - width - 12)),
                ...(upwards ? { bottom: window.innerHeight - rect.top + 8 } : { top: Math.max(12, rect.bottom + 8) }),
                maxHeight: Math.max(120, upwards ? above : below),
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const outside = event => {
            if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close();
        };
        const escape = event => {
            if (event.key !== 'Escape') return;
            // Close only this picker, not the event editor behind it.
            event.preventDefault();
            event.stopImmediatePropagation();
            close(true);
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('focusin', outside);
        window.addEventListener('keydown', escape, true);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('focusin', outside);
            window.removeEventListener('keydown', escape, true);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (open && position && focusDayRef.current) {
            panelRef.current?.querySelector(`[data-date="${focusedDate}"]`)?.focus({ preventScroll: true });
            focusDayRef.current = false;
        }
    }, [open, position, focusedDate, month]);

    const moveFocus = date => {
        const next = clampDate(date);
        focusDayRef.current = true;
        setFocusedDate(dateKey(next));
        setMonth(startOfMonth(next));
    };
    const handleDayKey = (event, day) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(day);
            return;
        }
        const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        let next;
        if (event.key in moves) next = addDays(day, moves[event.key]);
        else if (event.key === 'Home') next = startOfWeek(day);
        else if (event.key === 'End') next = endOfWeek(day);
        else if (event.key === 'PageUp') next = addMonths(day, -1);
        else if (event.key === 'PageDown') next = addMonths(day, 1);
        if (next) { event.preventDefault(); moveFocus(next); }
    };
    const changeMonth = amount => {
        const next = clampDate(addMonths(parseDate(focusedDate) || month, amount));
        setFocusedDate(dateKey(next));
        setMonth(startOfMonth(next));
    };

    return <div className={`relative min-w-0 ${className}`}>
        {/* Retain native form validation without opening the native date UI. */}
        <input tabIndex={-1} aria-hidden="true" className="sr-only" value={value || ''} onChange={() => {}} required={required} disabled={disabled}
            onInvalid={event => { event.preventDefault(); show(); }} />
        <button ref={triggerRef} type="button" disabled={disabled} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
            onClick={() => open ? close() : show()}
            onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); } }}
            className={`flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-bold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500/25 ${open ? 'border-blue-600 bg-slate-50 text-slate-800' : 'border-slate-200/60 bg-slate-50 text-slate-800 hover:border-blue-300'}`}>
            <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? format(selected, 'yyyy. M. d. (eee)', { locale: ko }) : '날짜 선택'}</span>
            <Calendar size={15} aria-hidden="true" className="shrink-0 text-slate-500" />
        </button>
        {open && position && createPortal(
            <div ref={panelRef} id={id} role="dialog" aria-label={`${label} 선택`} style={position}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => {
                    if (event.key !== 'Tab') return;
                    const buttons = [...panelRef.current.querySelectorAll('button:not(:disabled)')].filter(button => button.tabIndex >= 0);
                    if ((event.shiftKey && event.target === buttons[0]) || (!event.shiftKey && event.target === buttons.at(-1))) close(true);
                }}
                className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xl shadow-slate-200/50">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <p id={`${id}-month`} aria-live="polite" className="text-sm font-extrabold text-slate-800">{format(month, 'yyyy년 M월')}</p>
                    <div className="flex gap-1">
                        <button type="button" aria-label="이전 달" disabled={!!minDate && endOfMonth(addMonths(month, -1)) < minDate} onClick={() => changeMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
                        <button type="button" aria-label="다음 달" disabled={!!maxDate && startOfMonth(addMonths(month, 1)) > maxDate} onClick={() => changeMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                </div>
                <div role="grid" aria-labelledby={`${id}-month`}>
                    <div role="row" className="grid grid-cols-7">
                        {['일', '월', '화', '수', '목', '금', '토'].map(day => <span role="columnheader" key={day} className="py-2 text-center text-[11px] font-medium text-slate-400">{day}</span>)}
                    </div>
                    {Array.from({ length: days.length / 7 }, (_, week) => <div role="row" key={week} className="grid grid-cols-7">
                        {days.slice(week * 7, week * 7 + 7).map(day => {
                            const key = dateKey(day);
                            const active = key === value;
                            return <div role="gridcell" aria-selected={active} key={key} className="flex items-center justify-center py-0.5">
                                <button type="button" data-date={key} aria-label={format(day, 'yyyy년 M월 d일 EEEE', { locale: ko })} aria-current={key === today ? 'date' : undefined}
                                    tabIndex={key === focusedDate ? 0 : -1} disabled={!isAllowed(day)} onClick={() => choose(day)} onKeyDown={event => handleDayKey(event, day)}
                                    className={`flex aspect-square w-full max-w-10 items-center justify-center rounded-full text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 disabled:opacity-25 ${active ? 'bg-blue-600 font-bold text-white' : `${isSameMonth(day, month) ? 'text-slate-800' : 'text-slate-300'} hover:bg-blue-50`}`}>
                                    {format(day, 'd')}
                                </button>
                            </div>;
                        })}
                    </div>)}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
                    <p className="text-[11px] font-medium text-blue-600">{selected ? `${format(selected, 'M월 d일 EEEE', { locale: ko })} 선택됨` : '날짜를 선택해주세요'}</p>
                    {!required && value && <button type="button" onClick={() => choose(null)} className="rounded px-1 text-[11px] text-slate-400 hover:text-slate-700">지우기</button>}
                </div>
            </div>, document.body
        )}
    </div>;
}

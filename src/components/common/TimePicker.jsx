import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { formatClockTime, parseClockTime, toClockTime } from '../../utils/timePicker';

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

export default function TimePicker({ label = '시간', value = '', onChange, disabled = false, clearable = false, className = '' }) {
    const id = useId();
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const hourRef = useRef(null);
    const minuteRef = useRef(null);
    const needsFocus = useRef(false);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState(null);
    const [draft, setDraft] = useState(() => parseClockTime(value) || parseClockTime('12:00'));
    const selectedText = formatClockTime(value);
    const draftValue = toClockTime(draft);

    const close = useCallback((restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    }, []);
    const show = () => {
        if (disabled) return;
        setDraft(parseClockTime(value) || parseClockTime('12:00'));
        setPosition(null);
        needsFocus.current = true;
        setOpen(true);
    };
    const confirm = () => {
        onChange(draftValue);
        close(true);
    };

    // Like DatePicker, render outside scrolling forms and keep the panel in view.
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const viewportWidth = document.documentElement.clientWidth;
            const width = Math.min(320, viewportWidth - 24);
            const above = Math.max(0, rect.top - 20);
            const below = Math.max(0, window.innerHeight - rect.bottom - 20);
            const upwards = below < 340 && above > below;
            setPosition({ width, left: Math.max(12, Math.min(rect.left, viewportWidth - width - 12)),
                ...(upwards ? { bottom: window.innerHeight - rect.top + 8 } : { top: Math.max(12, rect.bottom + 8) }),
                maxHeight: Math.max(120, upwards ? above : below) });
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
    }, [open, close]);

    useLayoutEffect(() => {
        if (!open || !position) return;
        for (const ref of [hourRef, minuteRef]) {
            const list = ref.current;
            const selected = list?.querySelector('[aria-selected="true"]');
            if (selected) list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
        }
        if (needsFocus.current) {
            hourRef.current?.focus({ preventScroll: true });
            needsFocus.current = false;
        }
    }, [open, !!position, draft.hour, draft.minute]);

    const renderList = (field, title, items, ref) => <div className="min-w-0">
        <p className="mb-1.5 text-center text-[11px] font-bold text-slate-400">{title}</p>
        <div ref={ref} role="listbox" aria-label={`${label} ${title}`} tabIndex={0} aria-activedescendant={`${id}-${field}-${draft[field]}`}
            className="relative h-36 overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-slate-50/60 p-1 outline-none focus-visible:border-blue-400 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200"
            onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); confirm(); return; }
                const index = items.indexOf(draft[field]);
                const delta = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[event.key];
                const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : delta !== undefined ? Math.min(items.length - 1, Math.max(0, index + delta)) : null;
                if (nextIndex !== null) { event.preventDefault(); setDraft(previous => ({ ...previous, [field]: items[nextIndex] })); }
            }}>
            {items.map(item => <div id={`${id}-${field}-${item}`} key={item} role="option" aria-selected={draft[field] === item}
                onClick={() => { setDraft(previous => ({ ...previous, [field]: item })); ref.current?.focus({ preventScroll: true }); }}
                className={`flex h-9 cursor-pointer items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${draft[field] === item ? 'bg-blue-600 font-bold text-white' : 'font-medium text-slate-600 hover:bg-blue-50'}`}>
                {String(item).padStart(2, '0')}
            </div>)}
        </div>
    </div>;

    return <div className={`relative min-w-0 ${className}`}>
        <button ref={triggerRef} type="button" disabled={disabled} aria-label={label} aria-describedby={`${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
            onClick={() => open ? close() : show()}
            onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); } }}
            className={`flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-bold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500/25 ${open ? 'border-blue-600 bg-slate-50 text-slate-800' : 'border-slate-200/60 bg-slate-50 text-slate-800 hover:border-blue-300'}`}>
            <span id={`${id}-value`} className={`truncate tabular-nums ${selectedText ? '' : 'text-slate-400'}`}>{selectedText || '시간 선택'}</span>
            <Clock size={15} aria-hidden="true" className="shrink-0 text-slate-500" />
        </button>
        {open && position && createPortal(<div ref={panelRef} id={id} role="dialog" aria-label={`${label} 선택`} style={position}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
                if (event.key !== 'Tab') return;
                const controls = [...panelRef.current.querySelectorAll('button:not(:disabled), [role="listbox"]')];
                const next = controls[controls.indexOf(event.target) + (event.shiftKey ? -1 : 1)];
                event.preventDefault();
                if (next) next.focus({ preventScroll: true });
                else close(true);
            }}
            className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xl shadow-slate-200/50">
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-800">시간 선택</p>
                <p aria-live="polite" className="text-xs font-bold tabular-nums text-blue-600">{formatClockTime(draftValue)}</p>
            </div>
            <div role="group" aria-label={`${label} 오전/오후`} className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {['오전', '오후'].map(period => <button type="button" key={period} aria-label={`${label} ${period}`} aria-pressed={draft.period === period}
                    onClick={() => setDraft(previous => ({ ...previous, period }))}
                    className={`h-8 rounded-lg text-xs font-bold transition-colors ${draft.period === period ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{period}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">{renderList('hour', '시', HOURS, hourRef)}{renderList('minute', '분', MINUTES, minuteRef)}</div>
            <div className="mt-3 flex items-center gap-2 border-t border-slate-200/80 pt-3">
                {clearable && value && <button type="button" onClick={() => { onChange(''); close(true); }} className="px-1 text-[11px] text-slate-400 hover:text-slate-700">지우기</button>}
                <button type="button" onClick={() => close(true)} className="ml-auto h-9 rounded-lg px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">취소</button>
                <button type="button" onClick={confirm} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700">선택 완료</button>
            </div>
        </div>, document.body)}
    </div>;
}

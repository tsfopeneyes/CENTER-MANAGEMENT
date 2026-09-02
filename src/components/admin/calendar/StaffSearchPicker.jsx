import React, { useId, useMemo, useRef, useState } from 'react';
import UserAvatar from '../../common/UserAvatar';

export default function StaffSearchPicker({ options, selected, onSelect, disabled = false }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const listId = useId();
    const rootRef = useRef(null);
    const listRef = useRef(null);
    const results = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('ko');
        return (options || []).filter(option => !needle
            || option.name.toLocaleLowerCase('ko').includes(needle));
    }, [options, query]);

    React.useEffect(() => { if (selected) setQuery(''); }, [selected?.id, selected?.name]);
    React.useEffect(() => {
        if (open) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex, results]);
    const openList = () => { setQuery(''); setOpen(true); setActiveIndex(0); };
    const choose = option => { onSelect(option); setQuery(''); setOpen(false); };
    return <div ref={rootRef} className="relative mt-1" onBlur={event => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
    }}>
        <input
            role="combobox"
            aria-label="당직 스태프 검색"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="이름을 입력해 검색"
            value={open ? query : selected?.name || query}
            disabled={disabled}
            onFocus={openList}
            onClick={() => { if (!open) openList(); }}
            onChange={event => { setQuery(event.target.value); onSelect(null); setOpen(true); setActiveIndex(0); }}
            onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (!open) { openList(); return; }
                    setActiveIndex(index => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
                } else if (event.key === 'Enter' && open && results[activeIndex]) {
                    event.preventDefault(); choose(results[activeIndex]);
                } else if (event.key === 'Escape') setOpen(false);
            }}
            className={`block w-full rounded-lg border p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 ${selected ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200'}`}
        />
        {open && !disabled && <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <p className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">{query.trim() ? `검색 결과 ${results.length}명` : `전체 ${results.length}명`} · 스크롤하여 선택</p>
            <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {results.length ? results.map((option, index) => <button
                type="button" role="option" aria-selected={selected?.id === option.id}
                id={`${listId}-${index}`} key={option.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${index === activeIndex ? 'bg-blue-50/60' : ''}`}
            >
                <UserAvatar user={option} size="w-7 h-7" />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{option.name}</span>
                    <span className="block text-[11px] text-slate-400">{option.user_group || option.role || '스태프'}{option.accountHint ? ` · 계정 ${option.accountHint}` : ''}</span>
                </span>
            </button>) : <p className="px-3 py-3 text-xs text-slate-500">일치하는 스태프가 없습니다.</p>}
            </div>
        </div>}
        {selected && <p className="mt-1 text-[11px] font-medium text-emerald-600">{selected.name} 스태프가 선택되었습니다.</p>}
    </div>;
}

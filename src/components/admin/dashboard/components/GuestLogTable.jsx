import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import Pagination from '../../../common/Pagination';

const TimeInputCell = ({ value, onChange, onBlur, placeholder = "--:--" }) => {
    const [localValue, setLocalValue] = useState(value === '-' ? '' : value);

    useEffect(() => {
        setLocalValue(value === '-' ? '' : value);
    }, [value]);

    return (
        <td className="p-1 min-w-[70px] text-center transition-colors">
            <input
                className="w-[50px] p-1 bg-transparent border-none outline-none focus:bg-indigo-50 focus:ring-1 focus:ring-indigo-100 rounded text-xs text-center font-mono hover:bg-gray-100 transition-all placeholder-gray-300 font-bold text-indigo-600"
                placeholder={placeholder}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                onBlur={(e) => {
                    const val = e.target.value;
                    const original = value === '-' ? '' : value;
                    if (val !== original && val !== '') {
                        onBlur(val);
                    } else if (val === '') {
                        setLocalValue(original);
                    }
                }}
            />
        </td>
    );
};

const GuestLogTable = ({ hookData }) => {
    const {
        filteredGuestSummaries, selectedRows, handleSelectAll, handleRowSelect,
        visitNotes, setVisitNotes, inputRefs, focusValRef,
        handleSaveNote, handleNoteKeyDown, handleNotePaste,
        handleCellMouseDown, handleCellMouseEnter, isCellSelected, selection, handleDeleteLog, handleTimeUpdate
    } = hookData;

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    // 필터링이나 데이터가 바뀌면 1페이지로 자동 회귀
    useEffect(() => {
        setCurrentPage(1);
    }, [filteredGuestSummaries]);

    const totalPages = Math.ceil(filteredGuestSummaries.length / ITEMS_PER_PAGE);
    const currentData = filteredGuestSummaries.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className={`overflow-x-auto custom-scrollbar flex flex-col justify-between ${selection.isDragging ? 'select-none' : ''}`} style={{ minHeight: '400px' }}>
            <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-indigo-50/50 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                    <tr className="border-b border-gray-100 border-l-4 border-l-transparent">
                        <th className="p-3 pl-6 w-10">
                            <input
                                type="checkbox"
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                onChange={handleSelectAll}
                                checked={filteredGuestSummaries.length > 0 && selectedRows.size === filteredGuestSummaries.length}
                            />
                        </th>
                        <th className="p-3">날짜</th>
                        <th className="p-3">요일</th>
                        <th className="p-3">이름</th>
                        <th className="p-3">학교/소속</th>
                        <th className="p-3">생년월일</th>
                        <th className="p-3">전화번호</th>
                        <th className="p-3">시작시간</th>
                        <th className="p-3">끝시간</th>
                        <th className="p-3">사용공간</th>
                        <th className="p-3">센터타임</th>
                        <th className="p-3">센터타임(분)</th>
                        <th className="p-3">방문목적</th>
                        <th className="p-3">비고</th>
                        <th className="p-3 pr-6 text-center">관리</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm bg-white">
                    {currentData.length === 0 ? (
                        <tr><td colSpan="15" className="p-10 text-center text-gray-400 font-bold italic">게스트 방문 기록이 없습니다.</td></tr>
                    ) : (
                        currentData.map((summary, idx) => (
                            <tr key={summary.id} className={`hover:bg-gray-50 transition border-l-4 border-l-indigo-400 ${selectedRows.has(summary.id) ? 'bg-indigo-50/30' : ''}`}>
                                <td className="p-3 pl-6 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={selectedRows.has(summary.id)}
                                        onChange={() => handleRowSelect(summary.id)}
                                    />
                                </td>
                                <td className="p-3 whitespace-nowrap">{summary.date}</td>
                                <td className="p-3">{summary.dayOfWeek}</td>
                                <td className="p-3 font-bold text-gray-800 whitespace-nowrap">
                                    {(summary.name || '')
                                        .replace('(guest)', '')
                                        .replace(/@/g, '')
                                        .replace(/\(guest\)/gi, '')
                                        .replace(/\(게스트\)/gi, '')
                                        .trim() || '게스트'}
                                </td>
                                <td className="p-3 whitespace-nowrap text-gray-600">{summary.school}</td>
                                <td className="p-3 whitespace-nowrap text-gray-600">{summary.birth}</td>
                                <td className="p-3 font-mono text-xs text-gray-500">{summary.phone}</td>
                                <TimeInputCell 
                                    value={summary.startTime} 
                                    onBlur={(val) => { if (handleTimeUpdate) handleTimeUpdate(summary, 'startTime', val); }}
                                />
                                <TimeInputCell 
                                    value={summary.endTime} 
                                    onBlur={(val) => { if (handleTimeUpdate) handleTimeUpdate(summary, 'endTime', val); }}
                                />
                                <td className="p-3">
                                    <span className="text-[11px] text-gray-600 line-clamp-2 leading-tight" title={summary.usedSpaces}>
                                        {summary.usedSpaces}
                                    </span>
                                </td>
                                <td className="p-3 font-mono text-xs text-indigo-600 font-bold">{summary.durationStr}</td>
                                <td className="p-3 text-xs text-gray-500">{summary.durationMin}</td>
                                <td className={`p-1 min-w-[200px] transition-colors ${isCellSelected(idx, 'purpose') ? 'bg-indigo-100/50' : ''}`}>
                                    <input
                                        ref={el => inputRefs.current[`${idx}-purpose`] = el}
                                        className={`w-full p-2 bg-transparent border-none outline-none focus:bg-indigo-50/50 focus:ring-1 focus:ring-indigo-100 rounded text-xs text-indigo-700 font-bold transition-all ${isCellSelected(idx, 'purpose') ? 'placeholder-indigo-300' : ''}`}
                                        placeholder="방문목적..."
                                        value={visitNotes[`${summary.userId}_${summary.date}`]?.purpose || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setVisitNotes(prev => ({
                                                ...prev,
                                                [`${summary.userId}_${summary.date}`]: { ...prev[`${summary.userId}_${summary.date}`], purpose: val }
                                            }));
                                        }}
                                        onFocus={(e) => {
                                            focusValRef.current[`${summary.userId}_${summary.date}_purpose`] = e.target.value;
                                        }}
                                        onBlur={(e) => {
                                            const original = focusValRef.current[`${summary.userId}_${summary.date}_purpose`] || '';
                                            if (e.target.value !== original) {
                                                handleSaveNote(summary.userId, summary.date, 'purpose', e.target.value);
                                            }
                                        }}
                                        onKeyDown={(e) => handleNoteKeyDown(e, idx, 'purpose')}
                                        onPaste={(e) => handleNotePaste(e, idx, 'purpose')}
                                        onMouseDown={() => handleCellMouseDown(idx, 'purpose')}
                                        onMouseEnter={() => handleCellMouseEnter(idx, 'purpose')}
                                    />
                                </td>
                                <td className={`p-1 min-w-[150px] transition-colors ${isCellSelected(idx, 'remarks') ? 'bg-indigo-100/50' : ''}`}>
                                    <input
                                        ref={el => inputRefs.current[`${idx}-remarks`] = el}
                                        className={`w-full p-2 bg-transparent border-none outline-none focus:bg-gray-100/50 focus:ring-1 focus:ring-gray-200 rounded text-xs text-gray-500 transition-all ${isCellSelected(idx, 'remarks') ? 'placeholder-indigo-300' : ''}`}
                                        placeholder="비고..."
                                        value={visitNotes[`${summary.userId}_${summary.date}`]?.remarks || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setVisitNotes(prev => ({
                                                ...prev,
                                                [`${summary.userId}_${summary.date}`]: { ...prev[`${summary.userId}_${summary.date}`], remarks: val }
                                            }));
                                        }}
                                        onFocus={(e) => {
                                            focusValRef.current[`${summary.userId}_${summary.date}_remarks`] = e.target.value;
                                        }}
                                        onBlur={(e) => {
                                            const original = focusValRef.current[`${summary.userId}_${summary.date}_remarks`] || '';
                                            if (e.target.value !== original) {
                                                handleSaveNote(summary.userId, summary.date, 'remarks', e.target.value);
                                            }
                                        }}
                                        onKeyDown={(e) => handleNoteKeyDown(e, idx, 'remarks')}
                                        onPaste={(e) => handleNotePaste(e, idx, 'remarks')}
                                        onMouseDown={() => handleCellMouseDown(idx, 'remarks')}
                                        onMouseEnter={() => handleCellMouseEnter(idx, 'remarks')}
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <button
                                        onClick={() => {
                                            if (summary.rawLogs) {
                                                handleDeleteLog(summary.rawLogs.map(l => l.id));
                                            }
                                        }}
                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {/* 페이지네이션 하단 고정 UI */}
            <div className="mt-auto border-t border-gray-100 bg-white/50 backdrop-blur-sm sticky left-0 w-full">
                <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>
        </div>
    );
};

export default GuestLogTable;

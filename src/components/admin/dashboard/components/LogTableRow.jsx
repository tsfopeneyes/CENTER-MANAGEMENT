import React, { useState, useEffect } from 'react';

const LogTableRow = React.memo(({
    summary,
    idx,
    selectedRows,
    handleRowSelect,
    visitNotes,
    setVisitNotes,
    inputRefs,
    focusValRef,
    handleSaveNote,
    handleNoteKeyDown,
    handleNotePaste,
    handleCellMouseDown,
    handleCellMouseEnter,
    isCellSelected,
    handleTimeUpdate
}) => {
    const noteKey = `${summary.userId}_${summary.date}`;
    const initialNote = visitNotes[noteKey] || {};
    
    // 로컬 상태를 사용하여 타이핑 시 전체 테이블이 리렌더링되는 렉 방지
    const [localPurpose, setLocalPurpose] = useState(initialNote.purpose || '');
    const [localRemarks, setLocalRemarks] = useState(initialNote.remarks || '');
    
    const [localStartTime, setLocalStartTime] = useState(summary.startTime === '-' ? '' : summary.startTime);
    const [localEndTime, setLocalEndTime] = useState(summary.endTime === '-' ? '' : summary.endTime);

    // 외부(DB/API)에서 업데이트 된 값이 있으면 동기화
    useEffect(() => {
        setLocalPurpose(initialNote.purpose || '');
        setLocalRemarks(initialNote.remarks || '');
    }, [initialNote.purpose, initialNote.remarks]);

    useEffect(() => {
        setLocalStartTime(summary.startTime === '-' ? '' : summary.startTime);
        setLocalEndTime(summary.endTime === '-' ? '' : summary.endTime);
    }, [summary.startTime, summary.endTime]);

    const isSelected = selectedRows.has(summary.id);

    return (
        <tr 
            onClick={(e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button')) return;
                handleRowSelect(summary.id);
            }}
            className={`hover:bg-blue-50/10 border-b border-gray-100 transition ${isSelected ? 'bg-blue-50/30 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'} cursor-pointer`}
        >
            <td className="p-3 pl-6 text-center" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={isSelected}
                    onChange={() => handleRowSelect(summary.id)}
                />
            </td>
            <td className="p-3 font-mono text-xs text-gray-500">{summary.weekId}</td>
            <td className="p-3 text-sm font-semibold text-gray-700 whitespace-nowrap">{summary.date}</td>
            <td className="p-3 text-sm text-gray-600">{summary.dayOfWeek}</td>
            <td className="p-3 text-sm text-gray-750 whitespace-nowrap">{summary.school}</td>
            <td className="p-3 text-sm font-medium text-gray-600">{summary.age}세</td>
            <td className="p-3 text-sm font-extrabold text-gray-900">{summary.name}</td>
            <td className="p-3 font-mono text-xs text-center font-bold text-blue-600">{summary.startTime}</td>
            <td className="p-3 font-mono text-xs text-center font-bold text-blue-600">{summary.endTime}</td>
            <td className="p-3 text-xs text-gray-700">
                <span className="line-clamp-2 leading-tight font-medium" title={summary.usedSpaces}>
                    {summary.usedSpaces}
                </span>
            </td>
            <td className="p-3 font-mono text-xs text-blue-600 font-bold">{summary.durationStr}</td>
            <td className="p-3">
                <span className="text-xs text-gray-800 font-extrabold line-clamp-2 leading-tight" title={localPurpose}>
                    {localPurpose || '-'}
                </span>
            </td>
            <td className="p-3">
                <span className="text-xs text-emerald-800 font-bold line-clamp-2 leading-tight" title={initialNote.checkoutFeedback || '-'}>
                    {initialNote.checkoutFeedback || '-'}
                </span>
            </td>
            <td className="p-3 pr-6">
                <span className="text-xs text-gray-500 font-medium line-clamp-1 leading-tight" title={localRemarks}>
                    {localRemarks || '-'}
                </span>
            </td>
        </tr>
    );
}, (prevProps, nextProps) => {
    // React.memo comparison for rendering optimization
    return (
        prevProps.summary === nextProps.summary &&
        prevProps.selectedRows.has(prevProps.summary.id) === nextProps.selectedRows.has(nextProps.summary.id) &&
        prevProps.isCellSelected === nextProps.isCellSelected &&
        // Only re-render if its explicit note object reference changes, not the entire visitNotes dictionary
        prevProps.visitNotes[`${prevProps.summary.userId}_${prevProps.summary.date}`] === nextProps.visitNotes[`${nextProps.summary.userId}_${nextProps.summary.date}`]
    );
});

export default LogTableRow;

import React, { useState, useEffect } from 'react';
import LogTableHeader from './LogTableHeader';
import LogTableRow from './LogTableRow';
import Pagination from '../../../common/Pagination';
import CheckboxFilter from '../../../common/CheckboxFilter';

const VisitLogTable = ({ hookData }) => {
    const {
        filteredVisitSummaries, selectedRows, handleSelectAll, handleRowSelect,
        filterOptions, visitFilters, setVisitFilters, toggleFilter,
        visitNotes, setVisitNotes, inputRefs, focusValRef,
        handleSaveNote, handleNoteKeyDown, handleNotePaste,
        handleCellMouseDown, handleCellMouseEnter, isCellSelected, selection, handleTimeUpdate
    } = hookData;

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    // 필터링이나 데이터가 바뀌면 1페이지로 자동 회귀
    useEffect(() => {
        setCurrentPage(1);
    }, [filteredVisitSummaries]);

    const totalPages = Math.ceil(filteredVisitSummaries.length / ITEMS_PER_PAGE);
    const currentData = filteredVisitSummaries.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className={`overflow-x-auto custom-scrollbar flex flex-col justify-between ${selection.isDragging ? 'select-none' : ''}`} style={{ minHeight: '500px' }}>
            
            {/* Clean, Premium Filter & Search Dashboard */}
            <div className="bg-gray-50/50 p-4 border-b border-gray-150 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
                {/* 1. 주차구분 */}
                <CheckboxFilter
                    label="주차구분"
                    options={filterOptions.weekIds}
                    selectedValues={visitFilters.weekIds}
                    onToggle={(val) => toggleFilter('weekIds', val)}
                    onSelectAll={() => setVisitFilters(prev => ({ ...prev, weekIds: filterOptions.weekIds }))}
                    onClear={() => setVisitFilters(prev => ({ ...prev, weekIds: [] }))}
                />
                
                {/* 2. 날짜 */}
                <CheckboxFilter
                    label="날짜"
                    options={filterOptions.dates}
                    selectedValues={visitFilters.dates}
                    onToggle={(val) => toggleFilter('dates', val)}
                    onSelectAll={() => setVisitFilters(prev => ({ ...prev, dates: filterOptions.dates }))}
                    onClear={() => setVisitFilters(prev => ({ ...prev, dates: [] }))}
                />

                {/* 3. 요일 */}
                <CheckboxFilter
                    label="요일"
                    options={filterOptions.days}
                    selectedValues={visitFilters.days}
                    onToggle={(val) => toggleFilter('days', val)}
                    onSelectAll={() => setVisitFilters(prev => ({ ...prev, days: filterOptions.days }))}
                    onClear={() => setVisitFilters(prev => ({ ...prev, days: [] }))}
                />

                {/* 4. 학교 검색 */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">학교 검색</label>
                    <input 
                        type="text"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-250 rounded-xl text-xs outline-none focus:border-blue-500 font-bold shadow-sm transition-all"
                        placeholder="학교명 입력..."
                        value={visitFilters.school || ''}
                        onChange={(e) => setVisitFilters(prev => ({ ...prev, school: e.target.value }))}
                    />
                </div>

                {/* 5. 나이 검색 */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">나이 검색</label>
                    <input 
                        type="text"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-250 rounded-xl text-xs outline-none focus:border-blue-500 font-bold shadow-sm transition-all"
                        placeholder="나이..."
                        value={visitFilters.age || ''}
                        onChange={(e) => setVisitFilters(prev => ({ ...prev, age: e.target.value }))}
                    />
                </div>

                {/* 6. 이름 검색 */}
                <div>
                    <label className="text-[10px] font-black text-gray-400 block mb-1">이름 검색</label>
                    <input 
                        type="text"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-250 rounded-xl text-xs outline-none focus:border-blue-500 font-bold shadow-sm transition-all"
                        placeholder="이름 입력..."
                        value={visitFilters.name || ''}
                        onChange={(e) => setVisitFilters(prev => ({ ...prev, name: e.target.value }))}
                    />
                </div>

                {/* 7. 사용 공간 */}
                <CheckboxFilter
                    label="사용 공간"
                    options={filterOptions.spaces}
                    selectedValues={visitFilters.space}
                    onToggle={(val) => toggleFilter('space', val)}
                    onSelectAll={() => setVisitFilters(prev => ({ ...prev, space: filterOptions.spaces }))}
                    onClear={() => setVisitFilters(prev => ({ ...prev, space: [] }))}
                    align="right"
                />

                {/* 8. 방문 목적 */}
                <CheckboxFilter
                    label="방문 목적"
                    options={filterOptions.purposes || []}
                    selectedValues={visitFilters.purpose}
                    onToggle={(val) => toggleFilter('purpose', val)}
                    onSelectAll={() => setVisitFilters(prev => ({ ...prev, purpose: filterOptions.purposes || [] }))}
                    onClear={() => setVisitFilters(prev => ({ ...prev, purpose: [] }))}
                    align="right"
                />
            </div>

            {/* Results Count Summary Badge */}
            <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between text-xs font-bold text-gray-500">
                <div>검색 결과: <span className="text-blue-600 font-extrabold text-sm">{filteredVisitSummaries.length}</span>건</div>
            </div>

            <table className="w-full text-left border-collapse min-w-[1450px]">
                <LogTableHeader
                    filteredVisitSummaries={filteredVisitSummaries}
                    selectedRows={selectedRows}
                    handleSelectAll={handleSelectAll}
                />
                
                <tbody className="divide-y divide-gray-100 text-sm bg-white">
                    {currentData.length === 0 ? (
                        <tr><td colSpan="13" className="p-10 text-center text-gray-400 font-bold italic">기록이 없습니다.</td></tr>
                    ) : (
                        currentData.map((summary, idx) => (
                            <LogTableRow
                                key={summary.id}
                                summary={summary}
                                idx={idx}
                                selectedRows={selectedRows}
                                handleRowSelect={handleRowSelect}
                                visitNotes={visitNotes}
                                setVisitNotes={setVisitNotes}
                                inputRefs={inputRefs}
                                focusValRef={focusValRef}
                                handleSaveNote={handleSaveNote}
                                handleNoteKeyDown={handleNoteKeyDown}
                                handleNotePaste={handleNotePaste}
                                handleCellMouseDown={handleCellMouseDown}
                                handleCellMouseEnter={handleCellMouseEnter}
                                isCellSelected={isCellSelected}
                                handleTimeUpdate={handleTimeUpdate}
                            />
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

export default VisitLogTable;

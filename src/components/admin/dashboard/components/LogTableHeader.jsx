import React from 'react';

const LogTableHeader = ({
    filteredVisitSummaries,
    selectedRows,
    handleSelectAll
}) => {
    return (
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider font-bold border-b border-gray-105">
            <tr className="border-l-4 border-l-transparent">
                <th className="p-4 pl-6 w-10 text-center">
                    <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        onChange={handleSelectAll}
                        checked={filteredVisitSummaries.length > 0 && selectedRows.size === filteredVisitSummaries.length}
                    />
                </th>
                <th className="p-4 min-w-[85px] text-left">주차구분</th>
                <th className="p-4 min-w-[85px] text-left">날짜</th>
                <th className="p-4 min-w-[60px] text-left">요일</th>
                <th className="p-4 min-w-[110px] text-left">학교</th>
                <th className="p-4 min-w-[55px] text-left">나이</th>
                <th className="p-4 min-w-[85px] text-left">이름</th>
                <th className="p-4 min-w-[75px] text-center">시작시간</th>
                <th className="p-4 min-w-[75px] text-center">끝시간</th>
                <th className="p-4 min-w-[100px] text-left">사용 공간</th>
                <th className="p-4 min-w-[80px] text-center">센터타임</th>
                <th className="p-4 min-w-[160px] text-left text-blue-600 font-extrabold">입실 기록 / 방문 목적</th>
                <th className="p-4 min-w-[160px] text-left text-emerald-600 font-extrabold">퇴실 기록 / 이용 소감</th>
                <th className="p-4 pr-6 min-w-[110px] text-left">비고</th>
            </tr>
        </thead>
    );
};

export default LogTableHeader;
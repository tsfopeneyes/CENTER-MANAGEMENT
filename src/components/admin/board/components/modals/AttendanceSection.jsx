import React from 'react';
import PropTypes from 'prop-types';
import { Trash2, UserPlus, Calendar, ClipboardList } from 'lucide-react';
import { exportParticipantsToExcel } from '../../../../../utils/exportUtils';

const AttendanceSection = ({ 
    notice, 
    participantList, 
    onAttendanceToggle, 
    onStaffToggle,
    onDeleteParticipant, 
    onMarkAllAttended,
    showEntranceList,
    setShowEntranceList,
    selectedDate,
    setSelectedDate,
    onUserClick
}) => {
    const isOpenProgram = notice.is_recruiting === false;
    const customFields = Array.isArray(notice.guest_properties?.custom_fields)
        ? notice.guest_properties.custom_fields
        : [];

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 bg-gray-50">
            {/* Mobile Date Picker for Open Programs */}
            {isOpenProgram && (
                <div className="md:hidden flex flex-col bg-white p-4 rounded-xl shadow-sm gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                        <Calendar size={12} />
                        <span>출석 날짜 선택</span>
                    </div>
                    <input 
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-xs focus:bg-white focus:border-blue-500 transition cursor-pointer"
                    />
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white p-4 rounded-xl shadow-sm gap-3">
                <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        참여자 명단
                        <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md text-[10px]">
                            {participantList.JOIN?.length || 0}명
                        </span>
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1">
                        {isOpenProgram 
                            ? `${selectedDate} 참여 인원`
                            : `출석: ${participantList.JOIN.filter(u => u.is_attended).length} / 미참석: ${participantList.JOIN.filter(u => !u.is_attended).length}`
                        }
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
                    {!isOpenProgram && (
                        <button 
                            onClick={onMarkAllAttended}
                            className="flex-1 sm:flex-none text-center px-3 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition shadow-sm"
                        >
                            전체 참석 처리
                        </button>
                    )}
                    <button 
                        onClick={() => setShowEntranceList(!showEntranceList)}
                        className={`flex-1 sm:flex-none text-center px-3 py-2 text-xs font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-1.5 ${showEntranceList ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                    >
                        <UserPlus size={14} /> 명단 추가 (지급)
                    </button>
                    <button 
                        onClick={() => exportParticipantsToExcel(participantList.JOIN, notice.title, customFields)}
                        className="md:hidden flex-1 text-center px-3 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition shadow-sm border border-green-200/50 flex items-center justify-center gap-1"
                    >
                        <ClipboardList size={14} /> 엑셀 다운로드
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-4 md:grid-cols-5 py-3 px-4 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 items-center">
                    <div className="col-span-1">이름</div>
                    <div className="col-span-2 md:col-span-2">학교/전화번호</div>
                    <div className="col-span-1 flex justify-center">{isOpenProgram ? "출석 취소 (회수)" : "출석"}</div>
                    <div className="col-span-1 md:flex hidden justify-center">관리</div>
                </div>
                <div className="divide-y divide-gray-100/60">
                    {participantList.JOIN?.length > 0 ? (
                        participantList.JOIN.map(user => (
                            <div key={user.id} className="grid grid-cols-4 md:grid-cols-5 py-3.5 px-4 items-center hover:bg-gray-50/50 transition text-sm">
                                <div className="col-span-1 font-bold text-gray-800 pr-2 flex items-center gap-1.5 flex-wrap">
                                    <button 
                                        type="button"
                                        onClick={() => onUserClick && onUserClick(user)}
                                        className="hover:text-blue-600 hover:underline cursor-pointer text-left transition font-bold"
                                        title="회원 정보 카드 보기"
                                    >
                                        {user.name?.replace('(guest)', '').trim()}
                                    </button>
                                    {user.name?.includes('(guest)') && (
                                        <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-md text-[9px] font-bold shrink-0">
                                            게스트
                                        </span>
                                    )}
                                    {user.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 drop-shadow-sm"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                </div>
                                <div className="col-span-2 md:col-span-2 flex flex-col justify-center">
                                    <span className="text-xs text-gray-600 truncate font-semibold">{user.school}</span>
                                    <span className="text-[10px] text-gray-400 font-medium tracking-wider mt-0.5">{user.phone_back4}</span>
                                    {customFields.map(field => {
                                        const answer = user.application_answers?.[field.id];
                                        return answer ? (
                                            <span key={field.id} className="text-[10px] text-blue-600 font-semibold mt-0.5 break-words">
                                                {field.label}: {answer}
                                            </span>
                                        ) : null;
                                    })}
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    {isOpenProgram ? (
                                        <button 
                                            onClick={() => onDeleteParticipant(user.id, user.name)}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all font-bold text-xs"
                                            title="출석 취소 및 하이픈 회수"
                                        >
                                            <Trash2 size={12} />
                                            <span>취소</span>
                                        </button>
                                    ) : (
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={user.is_attended || false}
                                                onChange={() => onAttendanceToggle(user.id, user.is_attended)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                        </label>
                                    )}
                                </div>
                                <div className="col-span-1 md:flex hidden justify-center items-center gap-2.5">
                                    {!isOpenProgram ? (
                                        <>
                                            <button 
                                                onClick={() => onStaffToggle(user.id, user.is_staff)}
                                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200 border ${
                                                    user.is_staff
                                                        ? 'bg-purple-50 text-purple-600 border-purple-200/60 shadow-sm font-extrabold'
                                                        : 'bg-slate-50/50 text-slate-400 border-slate-200/50 hover:bg-slate-100 hover:text-slate-600 hover:border-slate-300'
                                                }`}
                                            >
                                                스탭
                                            </button>
                                            <button 
                                                onClick={() => onDeleteParticipant(user.id, user.name)}
                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                title="신청 취소"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-xs text-gray-400 font-semibold">-</span>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            {isOpenProgram ? `${selectedDate}에 등록된 참여자가 없습니다.` : "신청한 참여자가 없습니다."}
                        </div>
                    )}
                </div>
            </div>

            {!isOpenProgram && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100/50">
                        <h4 className="font-bold text-orange-700 mb-2 flex justify-between text-[10px] uppercase tracking-wider">
                            대기 <span className="bg-white px-2 rounded-full">{participantList.WAITLIST?.length || 0}</span>
                        </h4>
                        <div className="space-y-1">
                            {participantList.WAITLIST?.map((u, i) => (
                                <div key={i} className="flex items-center justify-between gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => onUserClick && onUserClick(u)}
                                        className="text-[10px] text-gray-600 hover:text-blue-600 hover:underline font-bold truncate flex items-center gap-1 text-left"
                                        title="회원 정보 카드 보기"
                                    >
                                        {u.name?.replace('(guest)', '').trim()}
                                        {u.name?.includes('(guest)') && (
                                            <span className="px-1 py-0.2 bg-purple-50 text-purple-500 border border-purple-100 rounded text-[8px] font-bold shrink-0">
                                                게스트
                                            </span>
                                        )}
                                        {u.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 drop-shadow-sm"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                    </button>
                                    <button 
                                        onClick={() => onDeleteParticipant(u.id, u.name)}
                                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                            {(!participantList.WAITLIST || participantList.WAITLIST.length === 0) && (
                                <span className="text-[10px] text-gray-400">-</span>
                            )}
                        </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h4 className="font-bold text-gray-500 mb-2 flex justify-between text-[10px] uppercase tracking-wider">
                            미참석 <span className="bg-white px-2 rounded-full">{participantList.JOIN.filter(u => !u.is_attended).length}</span>
                        </h4>
                        <p className="text-[10px] text-gray-400 truncate flex flex-wrap gap-1">
                            {participantList.JOIN.filter(u => !u.is_attended).length > 0 
                                ? participantList.JOIN.filter(u => !u.is_attended).map((u, idx, arr) => (
                                    <span key={u.id} className="flex items-center">
                                        <button
                                            type="button"
                                            onClick={() => onUserClick && onUserClick(u)}
                                            className="hover:text-blue-600 hover:underline cursor-pointer"
                                            title="회원 정보 카드 보기"
                                        >
                                            {u.name?.replace('(guest)', '').trim()}
                                        </button>
                                        {u.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline ml-0.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                        {idx < arr.length - 1 ? ', ' : ''}
                                    </span>
                                ))
                                : '-'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

AttendanceSection.propTypes = {
    notice: PropTypes.object.isRequired,
    participantList: PropTypes.object.isRequired,
    onAttendanceToggle: PropTypes.func.isRequired,
    onStaffToggle: PropTypes.func.isRequired,
    onDeleteParticipant: PropTypes.func.isRequired,
    onMarkAllAttended: PropTypes.func.isRequired,
    showEntranceList: PropTypes.bool.isRequired,
    setShowEntranceList: PropTypes.func.isRequired,
    selectedDate: PropTypes.string,
    setSelectedDate: PropTypes.func
};

export default React.memo(AttendanceSection);

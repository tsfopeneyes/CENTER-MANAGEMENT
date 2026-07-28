import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const ZoneDetailModal = ({
    zoneDetailModal,
    setZoneDetailModal,
    handleForceCheckout,
    checkinSurveys = [],
    surveyConfig
}) => {
    // ESC key listener to close modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setZoneDetailModal(prev => ({ ...prev, isOpen: false }));
            }
        };
        if (zoneDetailModal.isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoneDetailModal.isOpen, setZoneDetailModal]);

    if (!zoneDetailModal.isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setZoneDetailModal({ ...zoneDetailModal, isOpen: false })}
        >
            <div 
                className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
                    <div>
                        <h3 className="font-bold text-blue-800 text-lg">{zoneDetailModal.locationName}</h3>
                        <p className="text-xs text-blue-500">오늘 이용 현황 (총 {zoneDetailModal.activeUsers.length}명 | 이용 중 {zoneDetailModal.activeUsers.filter(u => u.isActive).length}명)</p>
                    </div>
                    <button onClick={() => setZoneDetailModal({ ...zoneDetailModal, isOpen: false })}>
                        <X size={20} className="text-blue-300 hover:text-blue-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {zoneDetailModal.activeUsers.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">오늘 이용한 사람이 없습니다.</div>
                    ) : (
                        zoneDetailModal.activeUsers.map(u => (
                            <div key={u.id} className={`flex justify-between items-center p-3.5 rounded-xl border transition-all ${u.isActive ? 'bg-blue-50/20 border-blue-100' : 'bg-gray-50/50 border-gray-100'}`}>
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    {/* A small premium letter avatar for the user */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${u.isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                                        {u.name?.[0] || ''}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-gray-800 text-[13px] flex items-center gap-0.5">
                                                {u.name}
                                                {u.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                            </span>
                                            {u.school && (
                                                <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                                                    ({u.school})
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Badges: User Group & Status */}
                                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-tight ${
                                                u.user_group === '졸업생' ? 'bg-gray-100 text-gray-600' :
                                                u.user_group === '일반인' ? 'bg-orange-50 text-orange-600' :
                                                'bg-blue-50 text-blue-600'
                                            }`}>
                                                {u.user_group || '재학생'}
                                            </span>
                                            
                                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-tight ${
                                                u.isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {u.isActive ? '이용 중' : '퇴실'}
                                            </span>
                                            
                                            {/* Checkin Time if checked out */}
                                            {!u.isActive && u.checkInTime && (
                                                <span className="text-[9.5px] text-gray-400 ml-1">
                                                    {new Date(u.checkInTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 입실
                                                </span>
                                            )}
                                        </div>

                                        {/* Survey Selections (if any) */}
                                        {(() => {
                                            const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                                            const uCheckinTime = u.checkInTime ? new Date(u.checkInTime).getTime() : 0;
                                            const userSurvey = checkinSurveys
                                                ?.filter(s => {
                                                    if (s.user_id !== u.id) return false;
                                                    const sDateKst = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                                                    if (sDateKst !== todayKst) return false;
                                                    const sTime = new Date(s.created_at).getTime();
                                                    return uCheckinTime > 0 && sTime >= (uCheckinTime - 5000);
                                                })
                                                ?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                                            const selectionsList = userSurvey?.selections?.map(sid => {
                                                const opt = surveyConfig?.options?.find(o => o.id === sid);
                                                return opt ? `${opt.emoji} ${opt.label}` : sid;
                                            }) || [];
                                            
                                            return selectionsList.length > 0 ? (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {selectionsList.map((sel, idx) => (
                                                        <span key={idx} className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                                                            {sel}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>

                                {/* Action area */}
                                <div className="shrink-0 ml-3">
                                    {u.isActive ? (
                                        <button
                                            onClick={() => handleForceCheckout(u.id)}
                                            className="text-[11px] bg-white text-red-500 hover:bg-red-500 hover:text-white px-2.5 py-1.5 rounded-lg font-bold transition duration-200 border border-red-100 hover:border-red-500 shrink-0"
                                        >
                                            퇴실
                                        </button>
                                    ) : (
                                        u.checkOutTime && (
                                            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded">
                                                {new Date(u.checkOutTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 퇴실
                                            </span>
                                        )
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ZoneDetailModal;

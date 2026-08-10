import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { ShieldCheck, Search, RefreshCw, Award, UserCheck, Calendar, FileText, ArrowUpDown } from 'lucide-react';
import Pagination from '../../../common/Pagination';

const AdminActivityLogTable = ({ users = [] }) => {
    const [activityLogs, setActivityLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState('ALL'); // ALL, POINT, MANUAL, MERGE
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 30;

    const userMap = useMemo(() => {
        const map = new Map();
        (users || []).forEach(u => map.set(u.id, u));
        return map;
    }, [users]);

    const fetchActivityLogs = async () => {
        setLoading(true);
        try {
            // 1. Fetch admin point transactions
            const { data: txData, error: txError } = await supabase
                .from('haifn_transactions')
                .select('*')
                .not('admin_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(300);

            if (txError) console.error('Failed to fetch admin transactions:', txError);

            // 2. Fetch admin manual logs
            const { data: logData, error: logError } = await supabase
                .from('logs')
                .select('*')
                .in('type', ['MANUAL_CHECKIN', 'ADMIN_ACTION', 'USER_MERGE'])
                .order('created_at', { ascending: false })
                .limit(300);

            if (logError) console.error('Failed to fetch admin logs:', logError);

            const combined = [];

            // Transform point transactions
            (txData || []).forEach(tx => {
                const adminUser = userMap.get(tx.admin_id);
                const targetUser = userMap.get(tx.user_id);
                const rawDesc = tx.source_description || tx.description || tx.reason || '';
                
                let label = tx.amount > 0 ? '포인트 지급' : '포인트 차감';
                if (rawDesc.includes('[프로그램')) {
                    label = '프로그램 보상';
                } else if (rawDesc.includes('[관리자') || tx.transaction_type === 'MANUAL') {
                    label = '수동 지급';
                }

                combined.push({
                    id: `tx_${tx.id}`,
                    createdAt: tx.created_at,
                    adminName: adminUser ? adminUser.name : '시스템/관리자',
                    targetName: targetUser ? targetUser.name : '이용자',
                    targetSchool: targetUser ? targetUser.school || '' : '',
                    actionType: 'POINT',
                    actionLabel: label,
                    amount: tx.amount,
                    details: rawDesc || '포인트 처리'
                });
            });

            // Transform admin logs
            (logData || []).forEach(lg => {
                const adminUser = userMap.get(lg.admin_id || lg.user_id);
                const targetUser = userMap.get(lg.target_user_id || lg.user_id);
                const isMerge = lg.type === 'USER_MERGE';
                combined.push({
                    id: `lg_${lg.id}`,
                    createdAt: lg.created_at,
                    adminName: adminUser ? adminUser.name : '관리자',
                    targetName: targetUser ? targetUser.name : '이용자',
                    targetSchool: targetUser ? targetUser.school || '' : '',
                    actionType: isMerge ? 'MERGE' : 'MANUAL',
                    actionLabel: isMerge ? '회원 데이터 병합' : '수기 입실 등록',
                    amount: 0,
                    details: lg.remarks || lg.metadata?.description || (isMerge ? '임시 계정 병합 처리' : '현장 수기 작성')
                });
            });

            // Sort by date desc
            combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setActivityLogs(combined);
        } catch (e) {
            console.error('Error fetching admin activity logs:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivityLogs();
    }, [users]);

    const filteredLogs = useMemo(() => {
        return activityLogs.filter(log => {
            if (actionFilter !== 'ALL' && log.actionType !== actionFilter) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const matchAdmin = log.adminName.toLowerCase().includes(term);
                const matchTarget = log.targetName.toLowerCase().includes(term);
                const matchDetails = log.details.toLowerCase().includes(term);
                if (!matchAdmin && !matchTarget && !matchDetails) return false;
            }
            return true;
        });
    }, [activityLogs, actionFilter, searchTerm]);

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const currentData = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const formatKST = (isoString) => {
        if (!isoString) return '-';
        try {
            const date = new Date(isoString);
            return new Intl.DateTimeFormat('ko-KR', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            }).format(date);
        } catch (e) {
            return '-';
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header & Filter Bar */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="text-blue-600 shrink-0" size={20} />
                    <h3 className="font-extrabold text-gray-800 text-sm sm:text-base">관리자 활동 이력</h3>
                    <span className="text-xs text-gray-400 font-bold ml-1">총 {filteredLogs.length}건</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Action Filter */}
                    <div className="flex bg-gray-200/60 p-1 rounded-xl gap-1 text-xs font-bold">
                        <button
                            onClick={() => { setActionFilter('ALL'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'ALL' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-600 hover:text-gray-800'}`}
                        >
                            전체
                        </button>
                        <button
                            onClick={() => { setActionFilter('POINT'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'POINT' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-600 hover:text-gray-800'}`}
                        >
                            포인트 처리
                        </button>
                        <button
                            onClick={() => { setActionFilter('MANUAL'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'MANUAL' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-600 hover:text-gray-800'}`}
                        >
                            수기 등록
                        </button>
                        <button
                            onClick={() => { setActionFilter('MERGE'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'MERGE' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-600 hover:text-gray-800'}`}
                        >
                            데이터 병합
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-48">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                            type="text"
                            placeholder="관리자/대상 검색..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 shadow-2xs"
                        />
                    </div>

                    <button
                        onClick={fetchActivityLogs}
                        className="p-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 rounded-xl transition shadow-2xs"
                        title="새로고침"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} />
                    </button>
                </div>
            </div>

            {/* Log Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-100 uppercase tracking-wider">
                        <tr>
                            <th className="p-3.5 pl-5">일시</th>
                            <th className="p-3.5">수행 관리자</th>
                            <th className="p-3.5">활동 구분</th>
                            <th className="p-3.5">대상 이용자</th>
                            <th className="p-3.5">상세 내용 / 사유</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="p-10 text-center text-gray-400 font-bold animate-pulse">
                                    활동 로그를 불러오는 중입니다...
                                </td>
                            </tr>
                        ) : currentData.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-12 text-center text-gray-400 font-bold">
                                    기록된 관리자 활동 로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            currentData.map(log => (
                                <tr key={log.id} className="hover:bg-blue-50/20 transition-colors">
                                    <td className="p-3.5 pl-5 text-gray-500 font-mono font-bold whitespace-nowrap">
                                        {formatKST(log.createdAt)}
                                    </td>
                                    <td className="p-3.5 font-extrabold text-gray-800">
                                        {log.adminName}
                                    </td>
                                    <td className="p-3.5 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-black ${
                                            log.actionType === 'POINT' ? (log.amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600') :
                                            log.actionType === 'MERGE' ? 'bg-amber-50 text-amber-600' :
                                            'bg-blue-50 text-blue-600'
                                        }`}>
                                            {log.actionLabel}
                                            {log.amount !== 0 && ` (${log.amount > 0 ? `+${log.amount}` : log.amount}H)`}
                                        </span>
                                    </td>
                                    <td className="p-3.5">
                                        <span className="font-bold text-gray-800">{log.targetName}</span>
                                        {log.targetSchool && <span className="text-[10px] text-gray-400 ml-1 font-normal">({log.targetSchool})</span>}
                                    </td>
                                    <td className="p-3.5 text-gray-600 font-medium break-all max-w-xs sm:max-w-md">
                                        {log.details}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-gray-100 flex justify-center bg-gray-50/30">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={(page) => setCurrentPage(page)}
                    />
                </div>
            )}
        </div>
    );
};

export default AdminActivityLogTable;

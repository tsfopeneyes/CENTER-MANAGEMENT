import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { haifnApi } from '../../../../api/haifnApi';
import { CheckCircle, XCircle, Clock, Search, PackageCheck, RefreshCw, Trash2 } from 'lucide-react';
import UserAvatar from '../../../common/UserAvatar';

const StoreApprovals = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingId, setDeletingId] = useState(null);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const [orderData, instantExchangeData] = await Promise.all([
                haifnApi.getStoreOrders(),
                haifnApi.getInstantStoreExchanges(),
            ]);

            const normalizedOrders = (orderData || []).map(order => ({
                ...order,
                source: 'ORDER',
                displayStatus: order.status === 'APPROVED' && order.haifn_items?.requires_approval === false
                    ? 'INSTANT'
                    : order.status,
            }));

            // 현재 버전의 즉시 교환은 주문과 소모 내역을 모두 남깁니다.
            // 과거 데이터처럼 주문이 없는 소모 내역만 보완해, 한 번의 교환이 두 번 보이지 않게 합니다.
            const matchedOrderIds = new Set();
            const unmatchedInstantExchanges = (instantExchangeData || []).filter(transaction => {
                const itemName = transaction.source_description?.replace('[스토어 교환]', '').trim();
                const matchingOrder = normalizedOrders.find(order => {
                    const isSameOrder = order.user_id === transaction.user_id
                        && order.haifn_items?.name === itemName
                        && Math.abs(order.amount) === Math.abs(transaction.amount)
                        && !matchedOrderIds.has(order.id);
                    const isNearInTime = Math.abs(new Date(order.created_at) - new Date(transaction.created_at)) < 60 * 1000;

                    return isSameOrder && isNearInTime;
                });

                if (matchingOrder) {
                    matchedOrderIds.add(matchingOrder.id);
                    return false;
                }

                return true;
            });

            const instantExchangeOrders = unmatchedInstantExchanges.map(transaction => ({
                id: `transaction-${transaction.id}`,
                user_id: transaction.user_id,
                amount: Math.abs(transaction.amount),
                created_at: transaction.created_at,
                users: transaction.users,
                haifn_items: {
                    name: transaction.source_description?.replace('[스토어 교환]', '').trim() || '스토어 교환',
                    requires_approval: false,
                },
                status: 'APPROVED',
                displayStatus: 'INSTANT',
                source: 'TRANSACTION',
                transactionId: transaction.id,
            }));

            setOrders([...normalizedOrders, ...instantExchangeOrders]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        } catch (err) {
            console.error('Failed to fetch store orders:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const handleProcess = async (order, isApproved) => {
        const action = isApproved ? '승인' : '반려';
        if (!window.confirm(`${order.users?.name} 학생의 [${order.haifn_items?.name}] 신청을 ${action}하시겠습니까?`)) return;

        try {
            const admin = JSON.parse(localStorage.getItem('admin_user'));
            const adminId = admin?.id || 'admin';
            
            await haifnApi.processOrder(order.id, order.user_id, order.amount, isApproved, adminId, order.haifn_items?.name);
            
            // Optionally send notification to user
            try {
                const message = isApproved 
                    ? `🎉 [스토어] 신청하신 '${order.haifn_items?.name}'이(가) 승인되었습니다! (-${order.amount}H)` 
                    : `😢 [스토어] 신청하신 '${order.haifn_items?.name}'이(가) 관리자에 의해 반려되었습니다. 포인트가 차감되지 않습니다.`;

                await supabase.from('messages').insert([{
                    sender_id: adminId,
                    receiver_id: order.user_id,
                    content: message
                }]);
            } catch (e) { console.error('Message send failed', e); }

            alert(`정상적으로 ${action} 처리되었습니다.`);
            fetchOrders();
        } catch (err) {
            console.error(err);
            alert(`${action} 처리 실패: ` + err.message);
        }
    };

    const handleDelete = async order => {
        const itemName = order.haifn_items?.name || '스토어 교환';
        const restoresPoints = !['PENDING', 'REJECTED'].includes(order.displayStatus);
        const message = restoresPoints
            ? `${order.users?.name || '이용자'}님의 '${itemName}' 교환 내역을 삭제하시겠습니까?\n\n${Math.abs(order.amount)}H가 이용자 잔액으로 복구됩니다.`
            : `${order.users?.name || '이용자'}님의 '${itemName}' 주문 내역을 삭제하시겠습니까?\n\n아직 포인트가 차감되지 않은 주문입니다.`;

        if (!window.confirm(message)) return;

        setDeletingId(order.id);
        try {
            await haifnApi.deleteStoreOrder(order);
            alert(restoresPoints ? '교환 내역을 삭제하고 하이픈을 복구했습니다.' : '주문 내역을 삭제했습니다.');
            fetchOrders();
        } catch (err) {
            console.error('Failed to delete store order:', err);
            alert(`내역 삭제 실패: ${err.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    const pendingCount = orders.filter(order => order.displayStatus === 'PENDING').length;
    const approvedCount = orders.filter(order => ['APPROVED', 'COMPLETED'].includes(order.displayStatus)).length;
    const instantCount = orders.filter(order => order.displayStatus === 'INSTANT').length;
    const rejectedCount = orders.filter(order => order.displayStatus === 'REJECTED').length;

    const filteredOrders = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        return orders.filter(order => {
            const matchesStatus = statusFilter === 'ALL' || order.displayStatus === statusFilter;
            const matchesSearch = !normalizedQuery || [
                order.users?.name,
                order.users?.school,
                order.haifn_items?.name,
            ].some(value => value?.toLowerCase().includes(normalizedQuery));

            return matchesStatus && matchesSearch;
        });
    }, [orders, searchQuery, statusFilter]);

    const statusMeta = {
        PENDING: { label: '승인 대기', className: 'bg-orange-50 text-orange-700 border-orange-100', icon: Clock },
        APPROVED: { label: '승인 완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: CheckCircle },
        COMPLETED: { label: '승인 완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: CheckCircle },
        INSTANT: { label: '즉시 교환', className: 'bg-blue-50 text-blue-700 border-blue-100', icon: CheckCircle },
        REJECTED: { label: '반려', className: 'bg-red-50 text-red-600 border-red-100', icon: XCircle },
    };

    if (loading) return <div className="p-10 text-center text-gray-400 font-bold">스토어 주문 내역을 불러오는 중입니다...</div>;

    return (
        <div className="space-y-6 p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                            <PackageCheck size={21} />
                        </div>
                        <h3 className="text-xl font-black tracking-tight text-gray-800">스토어 주문 내역</h3>
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-500">교환 내역을 확인하고 승인 대기 주문을 처리하세요.</p>
                </div>
                <button
                    onClick={fetchOrders}
                    className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 md:self-auto"
                >
                    <RefreshCw size={15} /> 새로고침
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500">승인 대기</p>
                    <p className="mt-1 text-xl font-black text-orange-600">{pendingCount}<span className="ml-1 text-xs">건</span></p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500">승인 완료</p>
                    <p className="mt-1 text-xl font-black text-emerald-600">{approvedCount}<span className="ml-1 text-xs">건</span></p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 shadow-sm">
                    <p className="text-xs font-bold text-blue-600">즉시 교환</p>
                    <p className="mt-1 text-xl font-black text-blue-600">{instantCount}<span className="ml-1 text-xs">건</span></p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold text-gray-500">반려</p>
                    <p className="mt-1 text-xl font-black text-red-500">{rejectedCount}<span className="ml-1 text-xs">건</span></p>
                </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
                    {[
                        { id: 'ALL', label: `전체 ${orders.length}` },
                        { id: 'PENDING', label: `승인 대기 ${pendingCount}` },
                        { id: 'APPROVED', label: '승인 완료' },
                        { id: 'INSTANT', label: `즉시 교환 ${instantCount}` },
                        { id: 'REJECTED', label: '반려' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setStatusFilter(tab.id)}
                            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition-all ${
                                statusFilter === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="relative w-full sm:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        placeholder="이름, 학교, 상품 검색"
                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-blue-400"
                    />
                </div>
            </div>

            <div className="space-y-2">
                {filteredOrders.map(order => {
                    const meta = statusMeta[order.displayStatus] || statusMeta.PENDING;
                    const StatusIcon = meta.icon;
                    const date = order.completed_at || order.created_at;

                    return (
                        <div key={order.id} className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md md:px-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <UserAvatar user={order.users} size="w-10 h-10" />
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <h4 className="font-black text-gray-800">{order.users?.name || '알 수 없는 이용자'}</h4>
                                            <span className="text-xs font-medium text-gray-500">{order.users?.school || '학교 미상'}</span>
                                        </div>
                                        <p className="mt-1 truncate text-sm font-bold text-gray-700">{order.haifn_items?.name || '삭제된 상품'}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${meta.className}`}>
                                        <StatusIcon size={13} /> {meta.label}
                                    </span>
                                    <div className="min-w-[64px] text-right">
                                        <p className="text-sm font-black text-red-500">-{Math.abs(order.amount)}H</p>
                                        <p className="mt-0.5 text-[10px] font-medium text-gray-400">{new Date(date).toLocaleDateString('ko-KR')}</p>
                                    </div>
                                </div>

                                {order.displayStatus === 'PENDING' && (
                                    <div className="flex gap-2 md:shrink-0">
                                        <button
                                            onClick={() => handleProcess(order, false)}
                                            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 md:flex-none"
                                        >
                                            반려
                                        </button>
                                        <button
                                            onClick={() => handleProcess(order, true)}
                                            className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-500 md:flex-none"
                                        >
                                            승인
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={() => handleDelete(order)}
                                    disabled={deletingId === order.id}
                                    className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-wait md:shrink-0"
                                    title={deletingId === order.id ? '삭제 중' : '주문 내역 삭제'}
                                >
                                    <Trash2 size={17} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {filteredOrders.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 px-6 py-16 text-center">
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                            <PackageCheck size={20} />
                        </div>
                        <h4 className="font-black text-gray-700">표시할 주문이 없습니다.</h4>
                        <p className="mt-1 text-sm font-medium text-gray-400">검색어나 주문 상태를 변경해 보세요.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoreApprovals;

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { ClipboardCheck, Check, X, Calendar, MapPin, Trash2, Plus, Edit2, ImagePlus, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import AdminPageHeader from '../common/AdminPageHeader';
import { format } from 'date-fns';
import AdminBookingEditModal from './AdminBookingEditModal';

const AdminRentals = () => {
    const [bookings, setBookings] = useState([]);
    const [rentals, setRentals] = useState([]);
    const [schools, setSchools] = useState([]);
    const [selectedSchool, setSelectedSchool] = useState('');
    const [newSpaceName, setNewSpaceName] = useState('');
    const [capacity, setCapacity] = useState('');
    const [features, setFeatures] = useState('');
    const [loading, setLoading] = useState(true);
    const [addingSpace, setAddingSpace] = useState(false);
    const [editingRentalId, setEditingRentalId] = useState(null);
    const [editingBooking, setEditingBooking] = useState(null);
    const [spaceImage, setSpaceImage] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [expandedBookings, setExpandedBookings] = useState({});
    const toggleExpandBooking = (id) => {
        setExpandedBookings(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    useEffect(() => {
        fetchSchools();
        fetchRentals();
        fetchBookings();
    }, []);

    const fetchSchools = async () => {
        try {
            const { data, error } = await supabase.from('schools').select('*').order('name');
            if (error) throw error;
            setSchools(data || []);
            const defaultSchool = data?.find(s => s.region === '강동' || s.region === '강서');
            if (defaultSchool) {
                setSelectedSchool(defaultSchool.id);
            } else if (data && data.length > 0) {
                setSelectedSchool(data[0].id);
            }
        } catch (error) {
            console.error('Error fetching schools:', error);
        }
    };

    const fetchRentals = async () => {
        try {
            const { data, error } = await supabase
                .from('rentals')
                .select('*, schools(name, region)');
            if (error) throw error;
            
            const sorted = (data || []).sort((a, b) => {
                let orderA = 9999;
                let orderB = 9999;
                try {
                    if (a.name && a.name.trim().startsWith('{')) {
                        orderA = JSON.parse(a.name.trim()).sort_order ?? 9999;
                    }
                } catch(e) {}
                try {
                    if (b.name && b.name.trim().startsWith('{')) {
                        orderB = JSON.parse(b.name.trim()).sort_order ?? 9999;
                    }
                } catch(e) {}
                
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                let nameA = a.name || '';
                let nameB = b.name || '';
                try {
                    if (a.name && a.name.trim().startsWith('{')) nameA = JSON.parse(a.name.trim()).name || '';
                    if (b.name && b.name.trim().startsWith('{')) nameB = JSON.parse(b.name.trim()).name || '';
                } catch(e) {}
                return nameA.localeCompare(nameB);
            });
            
            setRentals(sorted);
        } catch (error) {
            console.error('Error fetching rentals:', error);
        }
    };

    const handleMoveSpace = async (index, direction) => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= rentals.length) return;
        
        const spaceA = rentals[index];
        const spaceB = rentals[targetIndex];
        
        try {
            let parsedA = { name: spaceA.name, capacity: '', features: '', image_url: '' };
            let parsedB = { name: spaceB.name, capacity: '', features: '', image_url: '' };
            
            try {
                if (spaceA.name.startsWith('{')) parsedA = JSON.parse(spaceA.name);
                else parsedA.name = spaceA.name;
            } catch(e) {}
            try {
                if (spaceB.name.startsWith('{')) parsedB = JSON.parse(spaceB.name);
                else parsedB.name = spaceB.name;
            } catch(e) {}
            
            const orderA = parsedA.sort_order ?? (index + 1);
            const orderB = parsedB.sort_order ?? (targetIndex + 1);
            
            parsedA.sort_order = orderB;
            parsedB.sort_order = orderA;
            
            const { error: errA } = await supabase.from('rentals').update({ name: JSON.stringify(parsedA) }).eq('id', spaceA.id);
            if (errA) throw errA;
            
            const { error: errB } = await supabase.from('rentals').update({ name: JSON.stringify(parsedB) }).eq('id', spaceB.id);
            if (errB) throw errB;
            
            fetchRentals();
        } catch(e) {
            console.error('Error sorting spaces:', e);
            alert('순서 변경 중 오류가 발생했습니다.');
        }
    };

    const fetchBookings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('rental_bookings')
                .select(`
                    *,
                    users (name, school, grade),
                    rentals (name, school_id, schools(name, region))
                `)
                .order('booking_date', { ascending: false })
                .order('start_time', { ascending: true });
            if (error) throw error;
            setBookings(data || []);
        } catch (error) {
            console.error('Error fetching bookings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id, status, bookingObj = null) => {
        try {
            let updatePayload = { status };
            if (status === 'REJECTED') {
                const reason = prompt('반려 사유를 입력해 주세요:');
                if (reason === null) return; // Cancelled
                
                const end_time = bookingObj ? bookingObj.end_time : '';
                const parts = end_time.split('|');
                const endTimeOnly = parts[0] || '18:00';
                const purpose = parts[1] || '';
                const headcount = parts[2] || '';
                const meetingName = parts[3] || '';
                const customNotes = parts[4] || '';
                
                updatePayload.end_time = `${endTimeOnly}|${purpose}|${headcount}|${meetingName}|${customNotes}|${reason}`;
            }
            const { error } = await supabase
                .from('rental_bookings')
                .update(updatePayload)
                .eq('id', id);
            if (error) throw error;
            alert(`예약이 ${status === 'APPROVED' ? '승인' : '반려'}되었습니다.`);
            fetchBookings();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('상태 변경에 실패했습니다.');
        }
    };

    const handleDeleteBooking = async (id) => {
        if (!confirm('정말 이 대관 예약을 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('rental_bookings')
                .delete()
                .eq('id', id);
            if (error) throw error;
            alert('대관 예약이 삭제되었습니다.');
            fetchBookings();
        } catch (error) {
            console.error('Error deleting booking:', error);
            alert('대관 예약 삭제에 실패했습니다.');
        }
    };

    const handleSaveSpace = async (e) => {
        e.preventDefault();
        if (!newSpaceName.trim() || !selectedSchool) return;

        setAddingSpace(true);
        try {
            let existingOrder = rentals.length + 1;
            if (editingRentalId) {
                const target = rentals.find(r => r.id === editingRentalId);
                if (target && target.name.startsWith('{')) {
                    try {
                        existingOrder = JSON.parse(target.name).sort_order ?? existingOrder;
                    } catch(e) {}
                }
            }

            const packedName = JSON.stringify({
                name: newSpaceName.trim(),
                capacity: capacity.trim(),
                features: features.trim(),
                image_url: spaceImage.trim() || '',
                sort_order: existingOrder
            });

            if (editingRentalId) {
                const { error } = await supabase
                    .from('rentals')
                    .update({
                        school_id: selectedSchool,
                        name: packedName
                    })
                    .eq('id', editingRentalId);
                if (error) throw error;
                alert('공간 정보가 수정되었습니다.');
            } else {
                const { error } = await supabase
                    .from('rentals')
                    .insert([{
                        school_id: selectedSchool,
                        name: packedName
                    }]);
                if (error) throw error;
                alert('새로운 공간이 등록되었습니다.');
            }

            setNewSpaceName('');
            setCapacity('');
            setFeatures('');
            setSpaceImage('');
            setEditingRentalId(null);
            fetchRentals();
        } catch (error) {
            console.error('Error saving space:', error);
            alert('공간 저장에 실패했습니다.');
        } finally {
            setAddingSpace(false);
        }
    };

    const handleDeleteSpace = async (id) => {
        if (!confirm('정말 이 공간을 삭제하시겠습니까? 연결된 예약도 모두 함께 삭제됩니다.')) return;
        try {
            const { error } = await supabase
                .from('rentals')
                .delete()
                .eq('id', id);
            if (error) throw error;
            alert('공간이 삭제되었습니다.');
            fetchRentals();
            fetchBookings();
        } catch (error) {
            console.error('Error deleting space:', error);
            alert('공간 삭제에 실패했습니다.');
        }
    };

    return (
        <div className="space-y-8 animate-fade-in-up pb-10">
            <AdminPageHeader
                title="대관 관리"
                subtitle="학생들이 신청한 공간 대여 및 대관 현황을 확인하고 승인/반려합니다."
                icon={<ClipboardCheck className="text-blue-500" />}
            />

            {/* 1. 상단: 대관 예약 신청 현황 (전체 가로 너비) */}
            <div className="bg-white rounded-[2rem] border border-gray-150/60 shadow-xl shadow-gray-100/40 p-8">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">대관 예약 신청 현황</h3>
                        <p className="text-xs font-semibold text-gray-400 mt-1">실시간 대관 신청 및 예약 변경 리스트입니다.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 font-bold text-gray-400 animate-pulse flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        불러오는 중...
                    </div>
                ) : bookings.length === 0 ? (
                    <div className="text-center py-20 font-bold text-gray-400/80 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                        신청된 대관 내역이 없습니다.
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
                        {bookings.map((booking) => {
                            const region = booking.rentals?.schools?.region;
                            const regionName = region === '강동' ? '하이픈' : region === '강서' ? '이높플레이스' : booking.rentals?.schools?.name || '미지정';
                            let spaceName = booking.rentals?.name || '공간 미지정';
                            try {
                                if (spaceName && spaceName.startsWith('{')) {
                                    spaceName = JSON.parse(spaceName).name;
                                }
                            } catch(e) {}

                            const endParts = booking.end_time.split('|');
                            const endTime = endParts[0];
                            const purpose = endParts.length > 1 ? endParts[1] : '';
                            const headcount = endParts.length > 2 ? endParts[2] : '';
                            const meetingName = endParts.length > 3 ? endParts[3] : '';
                            const notes = endParts.length > 4 ? endParts[4] : '';
                            const rejectReason = endParts.length > 5 ? endParts[5] : '';

                            const isExpanded = !!expandedBookings[booking.id];

                            return (
                                <div key={booking.id} className="bg-white border border-[#f2f4f6] rounded-[20px] p-4 hover:shadow-md hover:border-[#e5e8eb] transition-all duration-305">
                                    <div className="flex items-center justify-between gap-4">
                                        {/* Left Section: Clickable area to toggle expand */}
                                        <div 
                                            onClick={() => toggleExpandBooking(booking.id)}
                                            className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 cursor-pointer select-none"
                                        >
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[11px] font-black text-[#3182f6] bg-[#3182f6]/10 px-2 py-0.5 rounded-md shrink-0">
                                                    {regionName}
                                                </span>
                                                <span className="text-xs font-bold text-gray-700 flex items-center gap-1 shrink-0">
                                                    <MapPin size={12} className="text-gray-400" /> {spaceName}
                                                </span>
                                            </div>
                                            
                                            <div className="hidden md:block text-gray-300">|</div>

                                            <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500 font-semibold">
                                                <Calendar size={12} className="text-gray-400" />
                                                <span>{booking.booking_date}</span>
                                                <span className="text-indigo-600 font-bold bg-indigo-50/50 px-2 py-0.5 rounded text-[11px]">
                                                    {booking.start_time} - {endTime}
                                                </span>
                                            </div>

                                            <div className="hidden md:block text-gray-300">|</div>

                                            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                                                <h4 className="text-sm font-black text-[#191f28] break-words">
                                                    {meetingName || '모임명 미지정'}
                                                </h4>
                                                <span className="text-xs text-gray-400 font-semibold shrink-0">
                                                    ({booking.users?.name || '알 수 없음'})
                                                </span>
                                            </div>
                                            
                                            <div className="text-gray-400 shrink-0 ml-2">
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </div>

                                        {/* Right Section: Actions & Status */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            {/* Status or Approval buttons */}
                                            <div className="flex items-center gap-2">
                                                {booking.status === 'PENDING' ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleUpdateStatus(booking.id, 'APPROVED')}
                                                            className="px-3 py-1.5 bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-lg font-bold text-[11px] transition-colors shadow-sm"
                                                        >
                                                            승인
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateStatus(booking.id, 'REJECTED', booking)}
                                                            className="px-3 py-1.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] rounded-lg font-bold text-[11px] transition-colors"
                                                        >
                                                            반려
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
                                                        booking.status === 'APPROVED'
                                                            ? 'bg-[#e6fc6b]/20 text-[#2b8a3e] border border-[#d3f9d8]'
                                                            : 'bg-[#ffe3e3] text-[#c92a2a] border border-[#ffd8d8]'
                                                    }`}>
                                                        {booking.status === 'APPROVED' ? '승인 완료' : '반려됨'}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="h-4 w-[1px] bg-gray-150" />

                                            {/* Edit & Delete Actions */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setEditingBooking(booking)}
                                                    className="p-1.5 text-gray-450 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                                                    title="수정"
                                                    type="button"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteBooking(booking.id)}
                                                    className="p-1.5 text-gray-450 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                                                    title="삭제"
                                                    type="button"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Area */}
                                    {isExpanded && (
                                        <div className="border-t border-gray-100/60 mt-3 pt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-fade-in">
                                            <div className="space-y-2 py-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-400 w-16 shrink-0">신청자 정보:</span>
                                                    <span className="font-bold text-[#333d4b]">
                                                        {booking.users?.name || '알 수 없음'}
                                                    </span>
                                                    <span className="text-gray-400 text-[11px] font-semibold">
                                                        ({booking.users?.school || '학교 미기재'} / {booking.users?.grade || '학년 미기재'})
                                                    </span>
                                                </div>
                                                {headcount && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-gray-400 w-16 shrink-0">이용 인원:</span>
                                                        <span className="font-bold text-gray-850">{headcount}명</span>
                                                    </div>
                                                )}
                                                {purpose && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-gray-400 w-16 shrink-0">이용 목적:</span>
                                                        <span className="font-bold text-gray-850">{purpose}</span>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="space-y-2">
                                                {notes && (
                                                    <div className="p-3.5 bg-slate-50 rounded-2xl text-xs text-[#333d4b] leading-relaxed border border-slate-200/80">
                                                        <strong className="text-slate-800 block mb-1 font-bold">기타 요청 사항</strong>
                                                        <p className="whitespace-pre-wrap break-words">{notes}</p>
                                                    </div>
                                                )}
                                                {booking.status === 'PENDING' && rejectReason && (
                                                    <div className="p-3 bg-[#fff9db] rounded-xl text-[11px] text-[#d9480f] leading-relaxed border border-[#ffe066]">
                                                        <strong className="text-[#d9480f] block mb-1 font-bold">이전 반려 사유</strong>
                                                        {rejectReason}
                                                    </div>
                                                )}
                                                {booking.status === 'REJECTED' && rejectReason && (
                                                    <div className="p-3 bg-[#fff5f5] rounded-xl text-[11px] text-[#e03131] leading-relaxed border border-[#ffe3e3]">
                                                        <strong className="text-[#c92a2a] block mb-1 font-bold">반려 사유</strong>
                                                        {rejectReason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* 공간 추가/수정 폼 (col-span-5) */}
                <div className="bg-white rounded-[2rem] border border-gray-150/60 shadow-xl shadow-gray-100/40 p-8 space-y-6 lg:col-span-5 h-fit">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                        <div>

                            <h3 className="text-lg font-black text-gray-900 tracking-tight">
                                {editingRentalId ? '공간 정보 수정' : '신규 공간 등록'}
                            </h3>
                            <p className="text-[11px] font-semibold text-gray-400 mt-1">대관 대여에 사용될 센터의 개별 방을 등록합니다.</p>
                        </div>
                        {editingRentalId && (
                            <button 
                                onClick={() => {
                                    setEditingRentalId(null);
                                    setNewSpaceName('');
                                    setCapacity('');
                                    setFeatures('');
                                    setSpaceImage('');
                                }}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 rounded-lg text-[11px] font-extrabold transition-colors"
                            >
                                취소
                            </button>
                        )}
                    </div>
                    
                    <form onSubmit={handleSaveSpace} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider ml-1">대상 센터</label>
                            <select
                                value={selectedSchool}
                                onChange={(e) => setSelectedSchool(e.target.value)}
                                className="w-full p-3.5 bg-gray-50/50 border border-gray-200/80 rounded-2xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all font-bold text-gray-700 text-sm shadow-inner"
                                required
                            >
                                {(() => {
                                    const gangdongSchool = schools.find(s => s.region === '강동');
                                    const gangserSchool = schools.find(s => s.region === '강서');
                                    const options = [];
                                    if (gangdongSchool) options.push({ id: gangdongSchool.id, label: '하이픈' });
                                    if (gangserSchool) options.push({ id: gangserSchool.id, label: '이높플레이스' });
                                    return options.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ));
                                })()}
                            </select>
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider ml-1">공간 이름</label>
                            <input
                                type="text"
                                value={newSpaceName}
                                onChange={(e) => setNewSpaceName(e.target.value)}
                                placeholder="예: 4F CONNECT 1"
                                className="w-full p-3.5 bg-gray-50/50 border border-gray-200/80 rounded-2xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all font-bold text-gray-700 text-sm shadow-inner"
                                required
                            />
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider ml-1">최대 이용 인원</label>
                            <input
                                type="text"
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                placeholder="예: 10명"
                                className="w-full p-3.5 bg-gray-50/50 border border-gray-200/80 rounded-2xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all font-bold text-gray-700 text-sm shadow-inner"
                                required
                            />
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider ml-1">구비 설비</label>
                            <input
                                type="text"
                                value={features}
                                onChange={(e) => setFeatures(e.target.value)}
                                placeholder="예: 빔프로젝터, 화이트보드, 스피커"
                                className="w-full p-3.5 bg-gray-50/50 border border-gray-200/80 rounded-2xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100/50 transition-all font-bold text-gray-700 text-sm shadow-inner"
                                required
                            />
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider ml-1">공간 사진</label>
                            {spaceImage && (
                                <div className="mb-3 relative rounded-2xl overflow-hidden border border-gray-250 shadow-inner group">
                                    <img src={spaceImage} alt="공간 미리보기" className="w-full h-36 object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <button
                                        type="button"
                                        onClick={() => setSpaceImage('')}
                                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                            <label className={`w-full flex flex-col items-center justify-center gap-2.5 py-6 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/10 transition-all group ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                <ImagePlus size={20} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                                <span className="text-xs font-bold text-gray-400 group-hover:text-blue-500 transition-colors">
                                    {uploadingImage ? '업로드 중...' : '공간 사진 등록/업로드'}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        setUploadingImage(true);
                                        try {
                                            const fileName = `rentals/${Date.now()}_${file.name}`;
                                            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
                                            if (uploadError) throw uploadError;
                                            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
                                            setSpaceImage(publicUrl);
                                        } catch (err) {
                                            console.error('Image upload error:', err);
                                            alert('이미지 업로드에 실패했습니다.');
                                        } finally {
                                            setUploadingImage(false);
                                        }
                                    }}
                                />
                            </label>
                        </div>
                        
                        <button
                            type="submit"
                            disabled={addingSpace}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-200 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> {addingSpace ? '저장 중...' : (editingRentalId ? '공간 정보 수정하기' : '공간 등록하기')}
                        </button>
                    </form>
                </div>

                {/* 등록된 공간 목록 (col-span-7) */}
                <div className="bg-white rounded-[2rem] border border-gray-150/60 shadow-xl shadow-gray-100/40 p-8 lg:col-span-7 h-fit flex flex-col">
                    <div className="border-b border-gray-100 pb-4 mb-4">
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">등록된 공간 목록</h3>
                        <p className="text-[11px] font-semibold text-gray-400 mt-1">센터별로 활성화되어 대여 가능한 방 리스트입니다.</p>
                    </div>
                    
                    <div className="space-y-3.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                        {rentals.map((r, index) => {
                            let displayName = r.name;
                            let cap = '';
                            let feat = '';
                            let imgUrl = '';
                            try {
                                if (r.name && r.name.startsWith('{')) {
                                    const parsed = JSON.parse(r.name);
                                    displayName = parsed.name || '';
                                    cap = parsed.capacity || '';
                                    feat = parsed.features || '';
                                    imgUrl = parsed.image_url || '';
                                }
                            } catch(e) {}

                            return (
                                <div key={r.id} className="flex gap-4 p-4 border border-gray-100 rounded-2xl bg-white hover:bg-gray-50/20 hover:border-gray-200/50 hover:shadow-md hover:shadow-gray-50 transition-all duration-300">
                                    {/* Space Image Thumbnail */}
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-50 border border-gray-200/50 shrink-0 shadow-inner flex items-center justify-center">
                                        {imgUrl ? (
                                            <img src={imgUrl} alt={displayName} className="w-full h-full object-cover" />
                                        ) : (
                                            <MapPin size={22} className="text-blue-500" />
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                        <div>
                                            <h4 className="font-extrabold text-gray-900 text-sm leading-tight truncate">{displayName}</h4>
                                            <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                                                {r.schools?.region && (
                                                    <span className="text-[10px] font-black text-blue-500 uppercase">
                                                        {r.schools?.region === '강동' ? '하이픈' : r.schools?.region === '강서' ? '이높플레이스' : r.schools?.name}
                                                    </span>
                                                )}
                                                {cap && (
                                                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                                                        정원: <span className="text-gray-700 font-extrabold">{cap}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {feat && (
                                            <p className="text-[10px] font-semibold text-gray-400 truncate">
                                                설비: <span className="text-gray-600">{feat}</span>
                                            </p>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 shrink-0 border-l border-gray-100 pl-3.5">
                                        <button
                                            onClick={() => handleMoveSpace(index, 'up')}
                                            disabled={index === 0}
                                            className={`p-2 rounded-xl transition-all duration-200 ${index === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                            title="위로 이동"
                                            type="button"
                                        >
                                            <ArrowUp size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleMoveSpace(index, 'down')}
                                            disabled={index === rentals.length - 1}
                                            className={`p-2 rounded-xl transition-all duration-200 ${index === rentals.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                                            title="아래로 이동"
                                            type="button"
                                        >
                                            <ArrowDown size={14} />
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setEditingRentalId(r.id);
                                                setSelectedSchool(r.school_id);
                                                setNewSpaceName(displayName);
                                                setCapacity(cap);
                                                setFeatures(feat);
                                                setSpaceImage(imgUrl || '');
                                            }}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200"
                                            title="수정"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteSpace(r.id)} 
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200" 
                                            title="삭제"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {editingBooking && (
                <AdminBookingEditModal
                    booking={editingBooking}
                    onClose={() => setEditingBooking(null)}
                    onSuccess={() => {
                        setEditingBooking(null);
                        fetchBookings();
                    }}
                />
            )}
        </div>
    );
};

export default AdminRentals;

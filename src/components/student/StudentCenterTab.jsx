import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import StudentProgramsTab from './StudentProgramsTab';
import { Store, Calendar, MapPin, Check, Plus, Coffee, Gamepad2, Landmark, CheckCircle, Sparkles, BookOpen, Wrench } from 'lucide-react';
import RentalBookingModal from './modals/RentalBookingModal';
import MyRentalsModal from './modals/MyRentalsModal';
import ContentPostModal from './modals/ContentPostModal';
import { parseContentPost, sortContentPosts } from '../../utils/contentPosts';

const StudentCenterTab = ({
    user,
    filteredPrograms,
    allPrograms,
    responses,
    responseDetails,
    openNoticeDetail,
    refreshTrigger,
    setRefreshTrigger,
    selectedRegion,
    studentRegion,
    tutorialMode = false,
    tutorialStep = '',
    tutorialResponses = {},
    onTutorialProgramOpen,
    onTutorialClose
}) => {
    const [contents, setContents] = useState([]);
    const [rentals, setRentals] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [loadingContents, setLoadingContents] = useState(false);
    const [loadingRentals, setLoadingRentals] = useState(false);
    
    // Booking modal states
    const [selectedRental, setSelectedRental] = useState(null);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [showMyBookings, setShowMyBookings] = useState(false);
    const [selectedContent, setSelectedContent] = useState(null);

    // Get mapped center name based on student school/region
    // 강동 -> 하이픈, 강서 -> 이높플레이스
    const studentSchool = user?.school || '';
    const centerName = studentRegion === '강서' ? '이높플레이스' : '하이픈';

    // Region switcher states are now passed as props from parent (Student Dashboard / Home Tab)
    useEffect(() => {
        fetchContents();
        fetchRentals();
        fetchBookings();
    }, [studentSchool, selectedRegion, refreshTrigger]);

    const fetchContents = async () => {
        setLoadingContents(true);
        try {
            let query = supabase.from('contents').select('*, schools(region)');
            
            // Region selection filter (matching simplified 'ALL', 'GANGDONG', 'GANGSEO' regional scope)
            if (selectedRegion === 'GANGDONG') {
                const { data: schs } = await supabase.from('schools').select('id').eq('region', '강동');
                query = query.in('school_id', schs?.map(s => s.id) || []);
            } else if (selectedRegion === 'GANGSEO') {
                const { data: schs } = await supabase.from('schools').select('id').eq('region', '강서');
                query = query.in('school_id', schs?.map(s => s.id) || []);
            } else if (user?.role !== 'admin') {
                // Query by region instead of individual school name to show all items in the region
                const region = studentRegion || (studentSchool.includes('강서') ? '강서' : '강동');
                const { data: schs } = await supabase.from('schools').select('id').eq('region', region);
                query = query.in('school_id', schs?.map(s => s.id) || []);
            }

            const { data, error } = await query;
            if (error) throw error;
            setContents(sortContentPosts((data || []).map(parseContentPost).filter(Boolean)));
        } catch (error) {
            console.error('Error fetching contents:', error);
        } finally {
            setLoadingContents(false);
        }
    };

    const fetchRentals = async () => {
        setLoadingRentals(true);
        try {
            let query = supabase.from('rentals').select('*, schools(region)');
            
            if (selectedRegion === 'GANGDONG') {
                const { data: schs } = await supabase.from('schools').select('id').eq('region', '강동');
                query = query.in('school_id', schs?.map(s => s.id) || []);
            } else if (selectedRegion === 'GANGSEO') {
                const { data: schs } = await supabase.from('schools').select('id').eq('region', '강서');
                query = query.in('school_id', schs?.map(s => s.id) || []);
            } else if (user?.role !== 'admin') {
                // Query by region instead of individual school name to show all spaces in the region
                const region = studentRegion || (studentSchool.includes('강서') ? '강서' : '강동');
                const { data: schs } = await supabase.from('schools').select('id').eq('region', region);
                query = query.in('school_id', schs?.map(s => s.id) || []);
            }

            const { data, error } = await query;
            if (error) throw error;
            
            const sorted = (data || []).sort((a, b) => {
                let orderA = 9999;
                let orderB = 9999;
                try {
                    if (a.name && a.name.trim().startsWith('{')) {
                        orderA = JSON.parse(a.name.trim()).sort_order ?? 9999;
                    }
                } catch (e) {}
                try {
                    if (b.name && b.name.trim().startsWith('{')) {
                        orderB = JSON.parse(b.name.trim()).sort_order ?? 9999;
                    }
                } catch (e) {}
                
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                let nameA = a.name || '';
                let nameB = b.name || '';
                try {
                    if (a.name && a.name.trim().startsWith('{')) nameA = JSON.parse(a.name.trim()).name || '';
                    if (b.name && b.name.trim().startsWith('{')) nameB = JSON.parse(b.name.trim()).name || '';
                } catch (e) {}
                return nameA.localeCompare(nameB);
            });
            
            setRentals(sorted);
        } catch (error) {
            console.error('Error fetching rentals:', error);
        } finally {
            setLoadingRentals(false);
        }
    };

    const fetchBookings = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('rental_bookings')
                .select('*')
                .eq('booking_date', today);
            if (error) throw error;
            setBookings(data || []);
        } catch (error) {
            console.error('Error fetching bookings:', error);
        }
    };

    const handleOpenBooking = (rental) => {
        setSelectedRental(rental);
        setShowBookingModal(true);
        if (tutorialMode) {
            window.dispatchEvent(new CustomEvent('student-onboarding:rental-opened', { detail: { rental } }));
        }
    };

    return (
        <div className="w-full min-h-screen bg-tossGrey50 pb-28 relative">
            {/* Header Title */}
            <div className="px-5 pt-5 pb-4 sticky top-0 bg-tossGrey50/95 backdrop-blur-xl z-20 border-b border-tossGrey200/50 mb-6">
                <div className="flex flex-col gap-1">
                    <h2 className="text-2xl font-bold text-tossGrey900 tracking-tight flex items-center gap-1.5">
                        센터 이용
                    </h2>
                    <p className="text-tossGrey500 text-xs font-medium">센터에서 새로운 기독 청소년 라이프스타일을 누려보세요!</p>
                </div>
            </div>

            <div className="px-5 space-y-6">

            {/* 1. Programs Section */}
            <div data-tour={tutorialMode ? 'tutorial-program-section' : undefined} className="bg-white p-5 rounded-toss-xl shadow-toss-standard">
                <div className="flex justify-between items-start mb-4 rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-tossBlueLight text-tossBlue flex items-center justify-center shrink-0">
                            <BookOpen size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-tossGrey900 text-[15px] tracking-tight leading-tight">프로그램</h3>
                            <p className="text-[11px] text-tossGrey500 font-semibold mt-0.5">우리가 연결되는 시간, 하나되는 공간</p>
                        </div>
                    </div>
                </div>
                <div className="pt-2">
                    <StudentProgramsTab
                        filteredPrograms={filteredPrograms}
                        allPrograms={allPrograms}
                        responses={responses}
                        responseDetails={responseDetails}
                        openNoticeDetail={openNoticeDetail}
                        tutorialMode={tutorialMode}
                        tutorialStep={tutorialStep}
                        tutorialResponses={tutorialResponses}
                        onTutorialProgramOpen={onTutorialProgramOpen}
                    />
                </div>
            </div>

            {/* 2. Contents Section */}
            <div data-tour={tutorialMode ? 'tutorial-content-section' : undefined} className="bg-white p-5 rounded-toss-xl shadow-toss-standard">
                <div className="flex justify-between items-start mb-4 rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-tossWarning/10 text-tossWarning flex items-center justify-center shrink-0">
                            <Store size={18} />
                        </div>
                        <div>
                                <h3 className="font-bold text-tossGrey900 text-[15px] tracking-tight leading-tight">콘텐츠</h3>
                                <p className="text-[11px] text-tossGrey500 font-semibold mt-0.5">센터에서 자유롭게 누릴 수 있는 다채로운 경험!</p>
                        </div>
                    </div>
                </div>
                <div className="pt-2 space-y-5">
                    {loadingContents ? (
                        <div className="text-center py-6 font-bold text-tossGrey400 animate-pulse">불러오는 중...</div>
                    ) : contents.length === 0 ? (
                        <div className="text-center py-6 text-tossGrey400 text-xs font-bold">등록된 콘텐츠가 없습니다.</div>
                    ) : (
                        (() => {
                            const isEnoughPlace = selectedRegion === 'GANGSEO' || (selectedRegion !== 'GANGDONG' && centerName === '이높플레이스');

                            const renderList = (items, categoryLabel, CategoryIcon, locationLabel, tutorialIndex) => {
                                if (items.length === 0) return null;
                                return (
                                    <div
                                        data-tour={tutorialMode ? `tutorial-content-card-${tutorialIndex}` : undefined}
                                        data-tour-label={categoryLabel}
                                        className="rounded-xl"
                                    >
                                        <div className="grid grid-cols-1 gap-3 mb-4 last:mb-0 sm:grid-cols-2">
                                            {items.map(item => {
                                                let d = '';
                                                try {
                                                    if (item.description && item.description.startsWith('{')) {
                                                        const parsed = JSON.parse(item.description);
                                                        d = parsed.desc || '';
                                                    } else {
                                                        d = item.description || '';
                                                    }
                                                } catch (e) {
                                                    d = item.description || '';
                                                }

                                                return (
                                                    <div key={item.id} onClick={()=>setSelectedContent(item)} className="group cursor-pointer overflow-hidden rounded-2xl bg-white shadow-toss-standard transition hover:shadow-toss-elevated active:scale-[0.98]">
                                                        {item.image_url?<div className="aspect-[11/10] w-full overflow-hidden bg-tossGrey50"><img src={item.image_url} alt="" className="h-full w-full object-cover"/></div>:<div className="flex aspect-[11/10] items-center justify-center bg-blue-50 text-blue-500"><Store size={28}/></div>}
                                                        <div className="p-4"><h4 className="font-extrabold text-tossGrey900 transition group-hover:text-tossBlue">{item.name}</h4>
                                                        {item.short_description && <p className="mt-1 line-clamp-2 min-h-9 text-[11px] font-medium leading-relaxed text-tossGrey500">{item.short_description}</p>}<div className="mt-3 flex items-center gap-1.5 border-t border-tossGrey100 pt-3 text-[11px] font-bold text-tossGrey600"><MapPin size={13}/>{item.location}</div></div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            };

                            const contentGroups = [
                                { items: contents, label: '콘텐츠', icon: Store, location: '' }
                            ];

                            return (
                                <div className="space-y-4">
                                    {contentGroups.map((group, index) => (
                                        <React.Fragment key={group.label}>
                                            {renderList(group.items, group.label, group.icon, group.location, index)}
                                        </React.Fragment>
                                    ))}
                                </div>
                            );
                        })()
                    )}
                </div>
            </div>

            {/* 3. Rentals Section */}
            <div data-tour={tutorialMode ? 'tutorial-rental-section' : undefined} className="bg-white p-5 rounded-toss-xl shadow-toss-standard">
                <div className="flex justify-between items-start mb-4 rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                            <Landmark size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-tossGrey900 text-[15px] tracking-tight leading-tight">공간 대여</h3>
                            <p className="text-[11px] text-tossGrey500 font-semibold mt-0.5">우리만의 스쿨처치 모임을 위해 공간을 이용해보세요</p>
                        </div>
                    </div>
                    {/* My Bookings History Button */}
                    <button
                        onClick={() => setShowMyBookings(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-tossGrey200 hover:bg-tossGrey50 text-tossGrey700 font-bold rounded-lg text-[11px] transition-colors shadow-sm shrink-0"
                    >
                        <Calendar size={13} />
                        내 신청 내역
                    </button>
                </div>
                {tutorialMode && tutorialStep === 'rentalSelect' && (
                    <div className="mb-4 rounded-2xl border border-tossBlue/15 bg-tossBlueLight px-4 py-3 text-xs font-bold leading-5 text-tossGrey700">
                        원하는 공간의 <span className="text-tossBlue">예약 신청</span>을 눌러 실제 예약 화면을 살펴보세요. 체험 신청은 서버에 저장되지 않아요.
                    </div>
                )}
                <div className="pt-2 space-y-2">
                    {loadingRentals ? (
                        <div className="text-center py-6 font-bold text-tossGrey400 animate-pulse">불러오는 중...</div>
                    ) : rentals.length === 0 ? (
                        <div className="text-center py-6 text-tossGrey400 text-xs font-bold">등록된 공간이 없습니다.</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {rentals.map((rental, rentalIndex) => {
                                let displayName = rental.name;
                                let capacityText = '';
                                let featuresText = '';
                                try {
                                    const trimmed = rental.name ? rental.name.trim() : '';
                                    if (trimmed.startsWith('{')) {
                                        const parsed = JSON.parse(trimmed);
                                        displayName = parsed.name || '';
                                        capacityText = parsed.capacity || '';
                                        featuresText = parsed.features || '';
                                    }
                                } catch (e) {
                                    displayName = rental.name;
                                    capacityText = '';
                                    featuresText = '';
                                }

                                return (
                                    <div
                                        key={rental.id}
                                        data-tour={tutorialMode ? `tutorial-rental-card-${rentalIndex}` : undefined}
                                        data-tour-label={displayName}
                                        className="bg-tossGrey50 rounded-xl border border-tossGrey100 p-4 hover:bg-tossGrey100/50 transition-all flex flex-col justify-between gap-3.5"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <h4 className="font-extrabold text-tossGrey900 text-[13.5px] tracking-tight leading-tight">{displayName}</h4>
                                                {capacityText && (
                                                    <span className="px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 text-[9px] font-bold rounded shrink-0">
                                                        최대 {capacityText}
                                                    </span>
                                                )}
                                            </div>
                                            {featuresText && (
                                                <div className="flex items-start gap-1.5 text-[10.5px] text-tossGrey500 font-medium leading-relaxed">
                                                    <Wrench size={13} className="text-tossGrey400 shrink-0 mt-0.5" />
                                                    <span>{featuresText}</span>
                                                </div>
                                            )}
                                            {!featuresText && rental.description && (
                                                <p className="text-[10.5px] text-tossGrey400 font-medium leading-relaxed">
                                                    {rental.description}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleOpenBooking(rental)}
                                            className="w-full py-2 bg-tossBlue text-white rounded-lg font-bold text-[11px] hover:bg-tossBlueDark transition-colors shadow-sm flex items-center justify-center gap-1"
                                        >
                                            예약 신청
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            </div>

            {/* Rental Booking Dialog/Modal */}
            {showBookingModal && selectedRental && (
                <RentalBookingModal
                    user={user}
                    rental={selectedRental}
                    bookings={bookings}
                    onClose={() => {
                        setShowBookingModal(false);
                        setSelectedRental(null);
                        if (tutorialMode) window.dispatchEvent(new Event('student-onboarding:rental-cancelled'));
                    }}
                    onSuccess={() => {
                        setShowBookingModal(false);
                        setSelectedRental(null);
                        if (tutorialMode) {
                            window.dispatchEvent(new Event('student-onboarding:rental-completed'));
                        } else {
                            fetchBookings();
                            if (setRefreshTrigger) setRefreshTrigger(prev => prev + 1);
                        }
                    }}
                    tutorialMode={tutorialMode}
                />
            )}

            {/* My Rentals History Modal */}
            {showMyBookings && (
                <MyRentalsModal
                    user={user}
                    onClose={() => setShowMyBookings(false)}
                />
            )}
            {selectedContent && <ContentPostModal post={selectedContent} onClose={()=>setSelectedContent(null)}/>}
        </div>
    );
};

export default StudentCenterTab;

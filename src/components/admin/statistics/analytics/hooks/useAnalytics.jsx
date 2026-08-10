import { useState, useMemo } from 'react';
import { processAnalyticsData, processProgramAnalytics, processUserAnalytics } from '../../../../../utils/analyticsUtils';

export const useAnalytics = ({ logs, schoolLogs, locations, locationGroups = [], users, notices, responses, feedbacks, visitNotes }) => {
    // State for Filter 
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); 
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-indexed 
    const [selectedDay, setSelectedDay] = useState(new Date().getDate()); 
    const [periodType, setPeriodType] = useState('MONTHLY'); // 'MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY' 
    const [selectedLocationGroupId, setSelectedLocationGroupId] = useState('ALL');   
    
    // Premium Skeleton Component 
    const Skeleton = () => (
        <div className="space-y-6">
            {/* Filter Skeleton */}
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4 animate-pulse">
                <div className="flex gap-2">
                    <div className="h-8 w-16 bg-gray-100 rounded-md"></div>
                    <div className="h-8 w-16 bg-gray-100 rounded-md"></div>
                    <div className="h-8 w-16 bg-gray-100 rounded-md"></div>
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-24 bg-gray-100 rounded-lg"></div>
                    <div className="h-10 w-24 bg-gray-100 rounded-lg"></div>
                    <div className="h-10 w-32 bg-gray-100 rounded-lg"></div>
                </div>
            </div>
            
            {/* KPI Cards Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg"></div>
                            <div className="h-4 w-20 bg-gray-100 rounded"></div>
                        </div>
                        <div className="h-8 w-16 bg-gray-100 rounded mb-2"></div>
                        <div className="h-3 w-24 bg-gray-50 rounded"></div>
                    </div>
                ))}
            </div>

            {/* Charts Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-96 flex flex-col justify-between">
                    <div className="h-6 w-40 bg-gray-100 rounded mb-8"></div>
                    <div className="flex gap-4 items-end h-full">
                        {[1, 2, 3, 4, 5].map(i => <div key={i} className="flex-1 bg-gray-50 rounded-t" style={{ height: `${Math.random() * 80 + 20}%` }}></div>)}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-96 flex flex-col justify-between">
                    <div className="h-6 w-40 bg-gray-100 rounded mb-8"></div>
                    <div className="flex gap-4 items-end h-full">
                        {[1, 2, 3, 4, 5].map(i => <div key={i} className="flex-1 bg-gray-50 rounded-t" style={{ height: `${Math.random() * 80 + 20}%` }}></div>)}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80 md:col-span-2 flex flex-col justify-between">
                    <div className="h-6 w-40 bg-gray-100 rounded mb-8"></div>
                    <div className="w-full h-full bg-gray-50 rounded-lg"></div>
                </div>
            </div>
        </div>
    );
    
    // viewMode: 'SPACE', 'PROGRAM', 'USER', 'SEUCHEO' 
    const [viewMode, setViewMode] = useState('SPACE'); 
    const [showGuestModal, setShowGuestModal] = useState(false); 
    const [seucheoRegion, setSeucheoRegion] = useState('ALL'); // 'ALL', '강동', '강서' 
    const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);   
    const [selectedMemberForCalendar, setSelectedMemberForCalendar] = useState(null); 
    const [selectedRoomDetails, setSelectedRoomDetails] = useState(null); 
    const [userSort, setUserSort] = useState({ key: 'spaceDuration', order: 'desc' }); 
    const [userSearch, setUserSearch] = useState(''); 
    const [programFilter, setProgramFilter] = useState('ALL'); // 'ALL', 'CENTER', 'SCHOOL_CHURCH'   
    
    const filteredLocations = useMemo(() => {     
        if (!locationGroups || locationGroups.length === 0 || selectedLocationGroupId === 'ALL') return locations;     
        return locations.filter(l => l.group_id === selectedLocationGroupId); 
    }, [locations, locationGroups, selectedLocationGroupId]);   
    
    const filteredLogsForSpace = useMemo(() => {     
        if (!locationGroups || locationGroups.length === 0 || selectedLocationGroupId === 'ALL') return logs;     
        const validLocationIds = new Set(filteredLocations.map(l => l.id));     
        return logs.filter(l => !l.location_id || validLocationIds.has(l.location_id)); 
    }, [logs, filteredLocations, locationGroups, selectedLocationGroupId]);   
    
    const spaceData = useMemo(() => {
        if (viewMode !== 'SPACE') return { summary: {}, charts: {}, logs: [] };
        const currentDate = new Date(selectedYear, selectedMonth, selectedDay);     
        return processAnalyticsData(filteredLogsForSpace, filteredLocations, users, currentDate, periodType, visitNotes); 
    }, [viewMode, filteredLogsForSpace, filteredLocations, users, selectedYear, selectedMonth, selectedDay, periodType, visitNotes]);   
    
    const rawProgramData = useMemo(() => {
        if (viewMode !== 'PROGRAM') return [];
        const currentDate = new Date(selectedYear, selectedMonth, selectedDay);     
        return processProgramAnalytics(notices, responses, currentDate, periodType); 
    }, [viewMode, notices, responses, selectedYear, selectedMonth, selectedDay, periodType]);   
    
    const programData = useMemo(() => {     
        if (programFilter === 'ALL') return rawProgramData;     
        return rawProgramData.filter(p => (p.program_type || 'CENTER') === programFilter); 
    }, [rawProgramData, programFilter]);   
    
    const rawUserData = useMemo(() => {
        if (viewMode !== 'USER' && viewMode !== 'SEUCHEO') return [];
        const currentDate = new Date(selectedYear, selectedMonth, selectedDay);     
        return processUserAnalytics(users, logs, responses, notices, currentDate, periodType); 
    }, [viewMode, users, logs, responses, notices, selectedYear, selectedMonth, selectedDay, periodType]);   
    
    const userData = useMemo(() => {     
        let filtered = rawUserData.filter(u =>         
            u.name.toLowerCase().includes(userSearch.toLowerCase()) ||         
            (u.school && u.school.toLowerCase().includes(userSearch.toLowerCase()))     
        );       
        return filtered.sort((a, b) => {         
            const valA = a[userSort.key];         
            const valB = b[userSort.key];         
            return userSort.order === 'asc' ? valA - valB : valB - valA;     
        }); 
    }, [rawUserData, userSort, userSearch]);   
    
    const handleSort = (key) => {     
        setUserSort(prev => ({         
            key,         
            order: prev.key === key && prev.order === 'desc' ? 'asc' : 'desc'     
        })); 
    };

    return {
        selectedYear, setSelectedYear,
        selectedMonth, setSelectedMonth,
        selectedDay, setSelectedDay,
        periodType, setPeriodType,
        selectedLocationGroupId, setSelectedLocationGroupId,
        viewMode, setViewMode,
        showGuestModal, setShowGuestModal,
        seucheoRegion, setSeucheoRegion,
        isManagerModalOpen, setIsManagerModalOpen,
        selectedMemberForCalendar, setSelectedMemberForCalendar,
        selectedRoomDetails, setSelectedRoomDetails,
        userSort, setUserSort,
        userSearch, setUserSearch,
        programFilter, setProgramFilter,
        
        filteredLocations,
        filteredLogsForSpace,
        spaceData,
        rawProgramData,
        programData,
        rawUserData,
        userData,
        
        handleSort
    };
};

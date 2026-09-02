import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { fetchAllPages } from '../../utils/fetchAllPages';

export const useDashboardCalendar = (user) => {
    const [adminSchedules, setAdminSchedules] = useState([]);
    const [calendarCategories, setCalendarCategories] = useState([]);

    useEffect(() => {
        let active = true;
        const refreshColors = async () => {
            try {
                const { data, error } = await supabase.from('calendar_categories').select('*');
                if (active && !error && data) setCalendarCategories(data);
            } catch { /* Keep the last saved palette on temporary network errors. */ }
        };
        const onVisible = () => { if (document.visibilityState === 'visible') refreshColors(); };
        window.addEventListener('focus', refreshColors);
        window.addEventListener('calendar-categories-updated', refreshColors);
        document.addEventListener('visibilitychange', onVisible);
        const timer = window.setInterval(onVisible, 60000);
        return () => {
            active = false;
            window.removeEventListener('focus', refreshColors);
            window.removeEventListener('calendar-categories-updated', refreshColors);
            document.removeEventListener('visibilitychange', onVisible);
            window.clearInterval(timer);
        };
    }, []);

    const fetchSchedules = useCallback(async () => {
        try {
            const [catRes, schRes, rentalRes] = await Promise.all([
                supabase.from('calendar_categories').select('*'),
                fetchAllPages(() => supabase.from('admin_schedules').select('*').order('id')).then(data => ({ data })),
                fetchAllPages(() => supabase.from('rental_bookings').select('*, rentals(name, schools(region))').eq('status', 'APPROVED').order('id')).then(data => ({ data }))
            ]);
            if (catRes.data) setCalendarCategories(catRes.data);
            
            let combinedSchedules = schRes.data || [];
            if (rentalRes.data) {
                // Map rental bookings to match event format in StudentCalendarTab
                const rentalSchedules = rentalRes.data.map(rb => {
                    let displayName = rb.rentals?.name || '공간';
                    try {
                        if (displayName.startsWith('{')) displayName = JSON.parse(displayName).name;
                    } catch(e) {}
                    
                    const region = rb.rentals?.schools?.region;
                    const regionName = region === '강동' ? '하이픈' : region === '강서' ? '이높플레이스' : '';
                    
                    const endTimeStr = rb.end_time || '';
                    const endParts = endTimeStr.includes('|') ? endTimeStr.split('|') : [endTimeStr];
                    const actualEndTime = endParts[0] || '18:00';
                    const meetingName = endParts.length > 3 ? endParts[3] : '';

                    let finalTitle = meetingName || displayName;

                    return {
                        id: rb.id,
                        title: finalTitle,
                        start_date: `${rb.booking_date}T${rb.start_time || '09:00'}:00`,
                        end_date: `${rb.booking_date}T${actualEndTime}:00`,
                        category_id: 'RENTAL', // Maps to rental styling
                        content: `대여된 공간입니다.`,
                        meetingName: meetingName || '공간 대여',
                        spaceName: displayName,
                        regionName: regionName,
                        region: region
                    };
                });
                combinedSchedules = [...combinedSchedules, ...rentalSchedules];
            }
            setAdminSchedules(combinedSchedules);
        } catch (err) {
            console.error('Error fetching schedules:', err);
        }
    }, [user?.id]);

    return {
        adminSchedules,
        calendarCategories,
        fetchSchedules
    };
};

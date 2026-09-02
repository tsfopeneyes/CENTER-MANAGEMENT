import { useEffect, useState } from 'react';
import { seoulDateString } from '../utils/dutyRoster';

export function useSeoulDate() {
    const [date, setDate] = useState(() => seoulDateString());
    useEffect(() => {
        const refresh = () => setDate(seoulDateString());
        const timer = window.setInterval(refresh, 1000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    return date;
}

import { useEffect, useState } from 'react';

// Also refresh after sleep/backgrounding, when interval timers are throttled.
export const useCurrentTime = () => {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const refresh = () => setNow(Date.now());
        const timer = window.setInterval(refresh, 1000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    return now;
};

import React, {createContext, useContext, useEffect, useSyncExternalStore} from 'react';

const SessionContext = createContext(null);

// Inject one stable coordinator per app. Not mounted in App until server/RLS
// readiness is verified. Does not mount/unmount protected children or lose drafts.
export function SessionProvider({coordinator, children}) {
    const state = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
    useEffect(() => {
        coordinator.start();
        const resume = () => { if (document.visibilityState === 'visible') void coordinator.check(); };
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('online', resume);
        return () => {
            document.removeEventListener('visibilitychange', resume);
            window.removeEventListener('online', resume);
            coordinator.stop();
        };
    }, [coordinator]);
    return <SessionContext.Provider value={{state, coordinator}}>{children}</SessionContext.Provider>;
}

export function useAccountSession() {
    const value = useContext(SessionContext);
    if (!value) throw new Error('SessionProvider가 필요합니다.');
    return value;
}

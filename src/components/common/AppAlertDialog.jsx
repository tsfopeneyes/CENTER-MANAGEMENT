import { useEffect, useState } from 'react';

// Central replacement for browser alert() calls. Existing screens can keep
// their validation code while users receive one consistent in-app dialog.
const AppAlertDialog = () => {
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        const nativeAlert = window.alert;
        const showAppAlert = (message) => {
            const text = String(message || '안내할 내용이 없습니다.');
            setMessages((current) => [...current, { id: `${Date.now()}-${Math.random()}`, text }]);
        };
        const handleAppAlert = (event) => showAppAlert(event.detail);

        window.alert = showAppAlert;
        window.addEventListener('app-alert', handleAppAlert);
        return () => {
            if (window.alert === showAppAlert) window.alert = nativeAlert;
            window.removeEventListener('app-alert', handleAppAlert);
        };
    }, []);

    const activeMessage = messages[0];
    if (!activeMessage) return null;

    const close = () => setMessages((current) => current.slice(1));

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={close}>
            <div className="w-full max-w-sm rounded-3xl border border-tossGrey100 bg-white p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tossBlue/10 text-2xl">💬</div>
                <h2 className="mt-4 text-lg font-black text-tossGrey900">안내</h2>
                <p className="mt-2 whitespace-pre-line break-keep text-sm font-semibold leading-relaxed text-tossGrey600">{activeMessage.text}</p>
                <button type="button" onClick={close} className="mt-5 w-full rounded-xl bg-tossBlue py-3 text-sm font-bold text-white">
                    확인
                </button>
            </div>
        </div>
    );
};

export default AppAlertDialog;

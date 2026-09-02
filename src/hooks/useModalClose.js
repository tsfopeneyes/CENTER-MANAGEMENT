import { useEffect, useRef } from 'react';

const HISTORY_LAYER_KEY = '__sciHistoryLayer';
const historyLayers = [];
let historyListenerInstalled = false;

const installHistoryListener = () => {
    if (historyListenerInstalled || typeof window === 'undefined') return;
    historyListenerInstalled = true;
    window.addEventListener('popstate', (event) => {
        const activeToken = event.state?.[HISTORY_LAYER_KEY];
        const topLayer = historyLayers[historyLayers.length - 1];
        if (!topLayer || topLayer.token === activeToken) return;

        historyLayers.pop();
        event.stopImmediatePropagation();
        event.preventDefault();
        topLayer.onBack?.();
    }, true);
};

const registerHistoryLayer = (onBack) => {
    installHistoryListener();
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entry = { token, onBack, pathname: window.location.pathname };
    historyLayers.push(entry);
    window.history.pushState({ ...window.history.state, [HISTORY_LAYER_KEY]: token }, '');
    return token;
};

const unregisterHistoryLayer = (token) => {
    const index = historyLayers.findIndex(layer => layer.token === token);
    if (index === -1) return;
    const [entry] = historyLayers.splice(index, 1);
    const isCurrentLayer = window.history.state?.[HISTORY_LAYER_KEY] === token;
    if (!isCurrentLayer || window.location.pathname !== entry.pathname) return;

    // Closing from an on-screen button should remove the synthetic history
    // entry too. Leave a silent marker so the popstate handler consumes it
    // without closing the page underneath.
    historyLayers.push({ ...entry, onBack: null });
    window.history.back();
};

/**
 * Closes an overlay with Escape or the browser/device back action.
 * 
 * @param {boolean} isOpen - Whether the modal is currently open
 * @param {Function} onClose - Function to call to close the modal
 */
export const useModalClose = (isOpen = true, onClose) => {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!isOpen || typeof onCloseRef.current !== 'function') return;

        const token = registerHistoryLayer(() => onCloseRef.current?.());

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            unregisterHistoryLayer(token);
        };
    }, [isOpen]);
};

export default useModalClose;

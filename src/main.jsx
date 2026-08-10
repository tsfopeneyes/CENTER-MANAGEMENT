import React from 'react'
import ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const container = document.getElementById('root');

if (container) {
    try {
        if (typeof createRoot === 'function') {
            const root = createRoot(container);
            root.render(<App />);
        } else if (ReactDOM.render) {
            ReactDOM.render(<App />, container);
        }
    } catch (e) {
        console.warn('createRoot failed, attempting legacy render:', e);
        try {
            if (ReactDOM.render) {
                ReactDOM.render(<App />, container);
            }
        } catch (err) {
            console.error('Legacy render failed:', err);
        }
    }
}

// Register Service Worker for PWA/Push
if ('serviceWorker' in navigator) {
    if (import.meta.env.DEV) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
            }
        });
    } else {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    console.log('SW Registered:', reg.scope);
                })
                .catch(err => console.log('SW Registration Failed:', err));
        });
    }
}

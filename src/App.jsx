import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import StudentDashboard from './pages/StudentDashboard'
import Kiosk from './pages/Kiosk'
import SplashScreen from './components/common/SplashScreen'
import PublicProgramDetail from './pages/PublicProgramDetail'
import GuestMobileWelcome from './pages/GuestMobileWelcome'
import { supabase } from './supabaseClient'
import { serverIntegrationsEnabled } from './utils/serverIntegration'
import { trackUserWebActivity } from './utils/userActivityUtils'

import StandaloneLiveChat from './pages/StandaloneLiveChat'
import TvSignageViewer from './pages/TvSignageViewer'
import ScreenViewer from './pages/ScreenViewer'
import AppAlertDialog from './components/common/AppAlertDialog'

function App() {
    const [isLoading, setIsLoading] = useState(() => {
        try {
            const path = window.location.pathname.toLowerCase();
            if (path.includes('/chat') || path.includes('/live-chat') || path.includes('/kiosk') || path.includes('/tv') || path.includes('/view') || path.includes('/signage') || path === '/screen') {
                return false;
            }
            return !sessionStorage.getItem('splash_shown');
        } catch (e) {
            return false;
        }
    });

    useEffect(() => {
        if (window.location.pathname.toLowerCase() === '/screen') return;
        const loadGlobalSettings = async () => {
            // Once server integrations are enabled, external-service credentials
            // must remain on the server and must not be copied into this browser.
            if (serverIntegrationsEnabled()) return;
            try {
                const { data, error } = await supabase
                    .from('global_settings')
                    .select('*');
                if (!error && data) {
                    data.forEach(item => {
                        try {
                            localStorage.setItem(item.key, item.value);
                        } catch (err) {}
                    });
                }
            } catch (e) {
                console.error('Failed to load global settings:', e);
            }
        };

        const trackWebSession = async () => {
            try {
                let stored = null;
                try {
                    stored = localStorage.getItem('user') || localStorage.getItem('admin_user');
                } catch (err) {}
                if (!stored) return;
                const currentUser = JSON.parse(stored);
                if (!currentUser?.id) return;
                // Record every new web-app session. The helper verifies the
                // database write and has a REST fallback for mobile browsers.
                await trackUserWebActivity(currentUser, { force: true });
            } catch (e) {
                console.error('Failed to track web session:', e);
            }
        };

        loadGlobalSettings();
        trackWebSession();
    }, []);

    const handleFinishLoading = () => {
        try {
            sessionStorage.setItem('splash_shown', 'true');
        } catch (e) {}
        setIsLoading(false);
    };

    return (
        <>
            {isLoading && <SplashScreen finishLoading={handleFinishLoading} />}
            {window.location.pathname.toLowerCase() !== '/screen' && <AppAlertDialog />}
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/checkin" element={<GuestMobileWelcome />} />
                    <Route path="/guest" element={<GuestMobileWelcome />} />
                    <Route path="/welcome" element={<GuestMobileWelcome />} />
                    <Route path="/p/:id" element={<PublicProgramDetail />} />
                    <Route path="student" element={<StudentDashboard />} />
                    <Route element={<Layout />}>
                        {/* Legacy or unused routes can be kept or removed */}
                        <Route path="dashboard" element={<Dashboard />} />
                    </Route>
                    <Route path="admin" element={<AdminDashboard />} />
                    <Route path="kiosk" element={<Kiosk />} />
                    <Route path="screen" element={<ScreenViewer />} />
                    <Route path="/live-chat" element={<StandaloneLiveChat />} />
                    <Route path="/live-chat/:center" element={<StandaloneLiveChat />} />
                    <Route path="/chat" element={<StandaloneLiveChat />} />
                    <Route path="/chat/:center" element={<StandaloneLiveChat />} />
                    <Route path="/tv" element={<StandaloneLiveChat />} />
                    <Route path="/tv/:center" element={<StandaloneLiveChat />} />
                    <Route path="/signage" element={<StandaloneLiveChat />} />
                    <Route path="/signage/:center" element={<StandaloneLiveChat />} />
                    <Route path="/view" element={<StandaloneLiveChat />} />
                    <Route path="/display" element={<StandaloneLiveChat />} />
                </Routes>
            </BrowserRouter>
        </>
    )
}

export default App

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

function App() {
    const [isLoading, setIsLoading] = useState(() => {
        // Only show splash screen if it hasn't been shown in this session
        return !sessionStorage.getItem('splash_shown');
    });

    useEffect(() => {
        const loadGlobalSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('global_settings')
                    .select('*');
                if (!error && data) {
                    data.forEach(item => {
                        localStorage.setItem(item.key, item.value);
                    });
                }
            } catch (e) {
                console.error('Failed to load global settings:', e);
            }
        };

        const trackWebSession = async () => {
            try {
                const stored = localStorage.getItem('user') || localStorage.getItem('admin_user');
                if (!stored) return;
                const currentUser = JSON.parse(stored);
                if (!currentUser?.id) return;

                const nowIso = new Date().toISOString();
                const lastTracked = currentUser.preferences?.last_web_login_at;

                if (!lastTracked || (new Date() - new Date(lastTracked)) > 3 * 60 * 1000) {
                    const updatedPreferences = { ...(currentUser.preferences || {}), last_web_login_at: nowIso };
                    await supabase.from('users').update({ preferences: updatedPreferences }).eq('id', currentUser.id);

                    const updatedUser = { ...currentUser, preferences: updatedPreferences };
                    if (localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(updatedUser));
                    if (localStorage.getItem('admin_user')) localStorage.setItem('admin_user', JSON.stringify(updatedUser));
                }
            } catch (e) {
                console.error('Failed to track web session:', e);
            }
        };

        loadGlobalSettings();
        trackWebSession();
    }, []);

    const handleFinishLoading = () => {
        sessionStorage.setItem('splash_shown', 'true');
        setIsLoading(false);
    };

    return (
        <>
            {isLoading && <SplashScreen finishLoading={handleFinishLoading} />}
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
                </Routes>
            </BrowserRouter>
        </>
    )
}

export default App

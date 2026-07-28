import React from 'react';
import { Bell, QrCode, ShieldCheck, User } from 'lucide-react';

const StudentDashboardHeader = ({
    user,
    unreadNotificationCount,
    setShowNotificationsModal,
    setShowEnlargedQr,
    setShowProfileSettings,
    onAdminClick
}) => {
    const isStaff = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'staff' || user?.user_group?.toLowerCase() === 'staff' || user?.user_group === '관리자';

    return (
        <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
            {/* Left: User Profile Brief */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setShowProfileSettings(true)}
                    className="relative focus:outline-none group"
                >
                    {user?.profile_image_url ? (
                        <img
                            src={user.profile_image_url}
                            alt="Profile"
                            className="w-10 h-10 rounded-full object-cover border-2 border-indigo-500/50 group-hover:border-indigo-400 transition"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
                            <User size={20} />
                        </div>
                    )}
                </button>

                <div>
                    <h2 className="font-bold text-sm text-white flex items-center gap-1.5">
                        {user?.name || '학생'}
                        {isStaff && (
                            <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-black border border-rose-500/30">
                                STAFF
                            </span>
                        )}
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">
                        {user?.school || '스쿨처치 임팩트'}
                    </p>
                </div>
            </div>

            {/* Right: Actions (Admin Switch, QR Code, Notification Bell) */}
            <div className="flex items-center gap-2">
                {isStaff && (
                    <button
                        onClick={onAdminClick}
                        className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold rounded-xl border border-rose-500/30 transition flex items-center gap-1"
                    >
                        <ShieldCheck size={14} />
                        <span>관리자</span>
                    </button>
                )}

                <button
                    onClick={() => setShowEnlargedQr(true)}
                    className="p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl border border-white/10 transition"
                    title="QR 코드 확대"
                >
                    <QrCode size={18} />
                </button>

                <button
                    onClick={() => setShowNotificationsModal(true)}
                    className="p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl border border-white/10 transition relative"
                    title="알림 모달"
                >
                    <Bell size={18} />
                    {unreadNotificationCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900">
                            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                        </span>
                    )}
                </button>
            </div>
        </header>
    );
};

export default StudentDashboardHeader;

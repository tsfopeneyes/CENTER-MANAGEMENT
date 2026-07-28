import React from 'react';
import { Home, BookOpen, MessageSquare, Calendar, User } from 'lucide-react';
import { TAB_NAMES } from '../../constants/appConstants';

const StudentDashboardNav = ({ activeTab, setActiveTab }) => {
    const navItems = [
        { id: TAB_NAMES.HOME, label: '홈', icon: Home },
        { id: TAB_NAMES.PROGRAMS, label: '프로그램', icon: BookOpen },
        { id: TAB_NAMES.AZIT, label: '아지트', icon: MessageSquare },
        { id: TAB_NAMES.CALENDAR, label: '캘린더', icon: Calendar },
        { id: TAB_NAMES.MY, label: 'MY', icon: User }
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 max-w-md mx-auto">
            <div className="flex items-center justify-around h-16 px-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
                                isActive ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Icon size={20} className={isActive ? 'scale-110 transition-transform' : ''} />
                            <span className="text-[10px] mt-1 font-semibold tracking-tight">{item.label}</span>
                            {isActive && (
                                <span className="absolute bottom-1 w-1 h-1 bg-indigo-400 rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default StudentDashboardNav;

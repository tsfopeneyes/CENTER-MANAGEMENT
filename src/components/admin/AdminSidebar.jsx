import React, { useMemo } from 'react';
import { LayoutDashboard, MessageSquare, Users, BarChart2, FileText, Settings, LogOut, User, Calendar, School, Trophy, Store, ClipboardCheck, UserCheck, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminSidebar = ({ activeMenu, setActiveMenu, onLogout, isOpen, setIsOpen, isPinned, setIsPinned, notices = [] }) => {
    const navigate = useNavigate();
    const [winWidth, setWinWidth] = React.useState(window.innerWidth);

    React.useEffect(() => {
        const handleResize = () => setWinWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const baseMenuGroups = [
        {
            title: "센터 운영",
            items: [
                { id: 'STATUS', label: '공간 현황', icon: <LayoutDashboard size={20} /> },
                { id: 'WORK_STATUS', label: '근무 현황', icon: <UserCheck size={20} /> },
                { id: 'CALENDAR', label: '일정 관리', icon: <Calendar size={20} /> },
                { id: 'PROGRAMS', label: '프로그램 관리', icon: <Users size={20} /> },
                { id: 'CONTENTS_MGMT', label: '콘텐츠 관리', icon: <Store size={20} /> },
                { id: 'RENTAL_MGMT', label: '대관 현황', icon: <ClipboardCheck size={20} /> },
                { id: 'BADGES', label: '뱃지 관리', icon: <Trophy size={20} /> },
                { id: 'BOARD', label: '공지사항', icon: <MessageSquare size={20} /> },
                { id: 'STORE', label: '하이픈 스토어', icon: <Store size={20} /> },
                { id: 'DUTY', label: '당직 관리', icon: <ClipboardCheck size={20} /> },
            ]
        },
        {
            title: "이용자 관리",
            items: [
                { id: 'USERS', label: '이용자 목록', icon: <Users size={20} /> },
                { id: 'SCHOOLS', label: '학교 관리', icon: <School size={20} /> },
                { id: 'SURVEYS', label: '설문조사', icon: <ClipboardList size={20} /> },
            ]
        },
        {
            title: "DB 관리",
            items: [
                { id: 'STATISTICS', label: '통계', icon: <BarChart2 size={20} /> },
                { id: 'LOGS', label: '로그', icon: <FileText size={20} /> },
                { id: 'REPORTS', label: '운영 리포트', icon: <FileText size={20} /> },
            ]
        },
        {
            items: [
                { id: 'SETTINGS', label: '설정', icon: <Settings size={20} /> },
            ]
        }
    ];

    const menuGroups = useMemo(() => {
        const configNotice = notices.find(n => n.category === 'SYSTEM' && n.title === 'ADMIN_SIDEBAR_CONFIG');
        let configMap = {};
        let configOrder = [];
        if (configNotice?.content) {
            try {
                const parsed = JSON.parse(configNotice.content);
                if (Array.isArray(parsed)) {
                    parsed.forEach(item => {
                        configMap[item.id] = item;
                        configOrder.push(item.id);
                    });
                    const statusIdx = configOrder.indexOf('STATUS');
                    const workStatusIdx = configOrder.indexOf('WORK_STATUS');
                    if (statusIdx !== -1 && workStatusIdx === -1) {
                        configOrder.splice(statusIdx + 1, 0, 'WORK_STATUS');
                    }
                }
            } catch (e) { console.error('Failed to parse sidebar config', e); }
        }

        const newGroups = baseMenuGroups.map(group => {
            let newItems = group.items.map(item => {
                const conf = configMap[item.id];
                if (conf) {
                    let label = conf.label || item.label;
                    if (item.id === 'BADGES') label = '뱃지 관리';
                    return { ...item, label, isVisible: conf.isVisible !== false };
                }
                return { ...item, isVisible: true };
            });

            // If we have an order defined, let's try to sort within the group. 
            // Better yet, just apply visibility and label changes since moving across groups is complex.
            // Wait, the config is a flat list! AdminSidebar uses groups.
            // For now, we will sort items within each group based on the flat order if they exist in the order list.
            if (configOrder.length > 0) {
                newItems.sort((a, b) => {
                    const idxA = configOrder.indexOf(a.id);
                    const idxB = configOrder.indexOf(b.id);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }

            return { ...group, items: newItems.filter(item => item.isVisible) };
        });

        // Reorder groups based on the first item's index in the configOrder (simple approximation)
        if (configOrder.length > 0) {
            newGroups.sort((a, b) => {
                const idxA = a.items.length > 0 ? configOrder.indexOf(a.items[0].id) : Infinity;
                const idxB = b.items.length > 0 ? configOrder.indexOf(b.items[0].id) : Infinity;
                return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
            });
        }

        return newGroups.filter(g => g.items.length > 0);
    }, [notices]);

    // Helper to handle menu click and auto-close if in overlay mode
    const handleMenuClick = (menuId) => {
        setActiveMenu(menuId);
        // On mobile or unpinned desktop, close the overlay automatically
        if (window.innerWidth < 768 || !isPinned) {
            setIsOpen(false);
        }
    };

    return (
        <>
            {/* Backdrop for Overlay (Always active for isOpen state) */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen && (window.innerWidth < 768 || !isPinned) ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsOpen(false)}
            />

            {/* Sidebar Content */}
            <div className={`
                w-64 bg-white border-r border-gray-100 h-screen h-[100dvh] flex flex-col fixed left-0 top-0 shadow-sm z-50 
                transition-transform duration-300 ease-in-out transform gpu-accelerated
                ${(isOpen || (isPinned && winWidth >= 768)) ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="p-8 border-b border-gray-100 flex flex-col items-center relative">
                    {/* PC Pin Toggle - Only shown on wide screens */}
                    <button
                        onClick={() => setIsPinned(!isPinned)}
                        className="hidden md:flex absolute top-4 right-4 p-1.5 text-gray-300 hover:text-blue-500 transition-colors"
                        title={isPinned ? "고정 해제 (오버레이 모드)" : "사이드바 고정"}
                    >
                        <LayoutDashboard size={14} className={isPinned ? 'text-blue-500' : ''} />
                    </button>
                    <h1 className="text-2xl font-black text-blue-600 tracking-tighter">SCI CENTER</h1>
                    <span className="text-gray-400 font-bold text-[10px] tracking-widest uppercase mt-1">Management System</span>
                </div>

                <nav className="flex-1 p-4 py-6 space-y-8 overflow-y-auto custom-scrollbar">
                    {menuGroups.map((group, idx) => (
                        <div key={idx} className="space-y-2">
                            {group.title && (
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-5 mb-3">{group.title}</h3>
                            )}
                            <div className="space-y-1">
                                {group.items.map(menu => (
                                    <button
                                        key={menu.id}
                                        onClick={() => handleMenuClick(menu.id)}
                                        className={`w-full flex items-center gap-3 px-5 py-3 rounded-xl font-bold transition-all duration-200 ${activeMenu === menu.id
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 scale-[1.02]'
                                            : 'text-gray-400 hover:bg-gray-50 hover:text-blue-500'
                                            }`}
                                    >
                                        {menu.icon}
                                        <span className="text-sm">{menu.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-6 border-t border-gray-100 space-y-3 bg-gray-50/50">
                    <button
                        onClick={() => navigate('/student')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-extrabold bg-white border border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-300 shadow-sm"
                    >
                        <User size={18} />
                        <span className="text-sm">학생용 페이지</span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-extrabold bg-gray-100 text-gray-500 hover:bg-red-500 hover:text-white transition-all duration-300"
                    >
                        <LogOut size={18} />
                        <span className="text-sm">로그아웃</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default AdminSidebar;

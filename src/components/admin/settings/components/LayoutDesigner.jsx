import React, { useState } from 'react';
import { Layout, ArrowUp, ArrowDown, Eye, EyeOff, Edit2, Check, X } from 'lucide-react';

const LayoutDesigner = ({
    dashboardConfig,
    sidebarConfig,
    tabConfig = [],
    configLoading,
    sidebarConfigLoading,
    tabConfigLoading,
    handleMoveConfig,
    handleUpdateConfig,
    handleSaveDashboardConfig,
    handleMoveSidebarConfig,
    handleUpdateSidebarConfig,
    handleSaveSidebarConfig,
    handleMoveTabConfig,
    handleUpdateTabConfig,
    handleSaveTabConfig
}) => {
    const [editingKey, setEditingKey] = useState(null);
    const [editLabel, setEditLabel] = useState('');

    const startEditing = (key, label) => {
        setEditingKey(key);
        setEditLabel(label);
    };

    const saveEdit = (id, type) => {
        if (type === 'dashboard') {
            handleUpdateConfig(id, 'label', editLabel);
        } else if (type === 'sidebar') {
            handleUpdateSidebarConfig(id, 'label', editLabel);
        } else if (type === 'tab') {
            handleUpdateTabConfig(id, 'label', editLabel);
        }
        setEditingKey(null);
    };

    const cancelEdit = () => {
        setEditingKey(null);
    };

    return (
        <>
            {/* Dashboard Layout Customization */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-base md:text-lg text-gray-700 flex items-center gap-2"><Layout size={20} /> 학생 대시보드 레이아웃 설정</h3>
                    <button
                        onClick={handleSaveDashboardConfig}
                        disabled={configLoading}
                        className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-xl font-bold text-xs transition-colors shadow-sm disabled:bg-gray-300"
                    >
                        {configLoading ? '저장 중...' : '레이아웃 저장'}
                    </button>
                </div>

                <div className="space-y-3">
                    {dashboardConfig.map((item, index) => (
                        <div key={item.id} className={`flex items-center justify-between p-4 rounded-2xl border transition ${item.isVisible ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-transparent opacity-60'}`}>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => handleMoveConfig(index, -1)}
                                        disabled={index === 0}
                                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-0"
                                    ><ArrowUp size={16} /></button>
                                    <button
                                        onClick={() => handleMoveConfig(index, 1)}
                                        disabled={index === dashboardConfig.length - 1}
                                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-0"
                                    ><ArrowDown size={16} /></button>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    {editingKey === `dashboard_${item.id}` ? (
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="text" 
                                                value={editLabel} 
                                                onChange={(e) => setEditLabel(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEdit(item.id, 'dashboard');
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                className="border border-blue-400 rounded-lg px-2 py-0.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                                                autoFocus
                                            />
                                            <button onClick={() => saveEdit(item.id, 'dashboard')} className="p-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"><Check size={14} /></button>
                                            <button onClick={cancelEdit} className="p-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group">
                                            <span className="font-bold text-gray-700 block">{item.label}</span>
                                            <button onClick={() => startEditing(`dashboard_${item.id}`, item.label)} className="text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-blue-50">
                                                <Edit2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">{item.id}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                {item.id !== 'operating_status' && item.id !== 'live_chat' && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-500">노출 개수</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={item.count}
                                            onChange={(e) => handleUpdateConfig(item.id, 'count', parseInt(e.target.value) || 1)}
                                            className="w-16 p-2 bg-gray-50 border border-gray-100 rounded-lg text-center text-sm font-bold outline-none focus:border-blue-500"
                                        />
                                    </div>
                                )}
                                <button
                                    onClick={() => handleUpdateConfig(item.id, 'isVisible', !item.isVisible)}
                                    className={`p-2.5 rounded-xl transition-all ${item.isVisible ? 'bg-blue-50 text-blue-600 shadow-sm' : 'bg-gray-200 text-gray-500'}`}
                                >
                                    {item.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-4 text-[10px] text-gray-400 leading-relaxed">* 학생 대시보드 홈 탭에 표시되는 섹션의 순서와 노출 개수를 설정합니다. 상하 화살표로 순서를 변경하세요.</p>
            </div>

            {/* Admin Sidebar Layout Customization */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-base md:text-lg text-gray-700 flex items-center gap-2"><Layout size={20} /> 관리자 사이드바 메뉴 설정</h3>
                    <button
                        onClick={handleSaveSidebarConfig}
                        disabled={sidebarConfigLoading}
                        className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-xl font-bold text-xs transition-colors shadow-sm disabled:bg-gray-300"
                    >
                        {sidebarConfigLoading ? '저장 중...' : '사이드바 저장'}
                    </button>
                </div>

                <div className="space-y-3">
                    {sidebarConfig.map((item, index) => (
                        <div key={item.id} className={`flex items-center justify-between p-4 rounded-2xl border transition ${item.isVisible ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-transparent opacity-60'}`}>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => handleMoveSidebarConfig(index, -1)}
                                        disabled={index === 0}
                                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-0"
                                    ><ArrowUp size={16} /></button>
                                    <button
                                        onClick={() => handleMoveSidebarConfig(index, 1)}
                                        disabled={index === sidebarConfig.length - 1}
                                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-0"
                                    ><ArrowDown size={16} /></button>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    {editingKey === `sidebar_${item.id}` ? (
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="text" 
                                                value={editLabel} 
                                                onChange={(e) => setEditLabel(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEdit(item.id, 'sidebar');
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                className="border border-blue-400 rounded-lg px-2 py-0.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                                                autoFocus
                                            />
                                            <button onClick={() => saveEdit(item.id, 'sidebar')} className="p-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"><Check size={14} /></button>
                                            <button onClick={cancelEdit} className="p-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group">
                                            <span className="font-bold text-gray-700 block">{item.label}</span>
                                            <button onClick={() => startEditing(`sidebar_${item.id}`, item.label)} className="text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-blue-50">
                                                <Edit2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">{item.id}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <button
                                    onClick={() => handleUpdateSidebarConfig(item.id, 'isVisible', !item.isVisible)}
                                    className={`p-2.5 rounded-xl transition-all ${item.isVisible ? 'bg-blue-50 text-blue-600 shadow-sm' : 'bg-gray-200 text-gray-500'}`}
                                >
                                    {item.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-4 text-[10px] text-gray-400 leading-relaxed">* 관리자 메뉴의 순서와 노출 여부를 설정합니다. 상하 화살표로 순서를 변경하세요.</p>
            </div>

            {/* Student Bottom Tab Layout Customization */}
            <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-base md:text-lg text-gray-700 flex items-center gap-2"><Layout size={20} /> 학생 하단 탭 메뉴 설정</h3>
                    <button
                        onClick={handleSaveTabConfig}
                        disabled={tabConfigLoading}
                        className="px-4 py-2 bg-[#3182f6] hover:bg-[#1b64da] text-white rounded-xl font-bold text-xs transition-colors shadow-sm disabled:bg-gray-300"
                    >
                        {tabConfigLoading ? '저장 중...' : '탭 설정 저장'}
                    </button>
                </div>

                <div className="space-y-3">
                    {tabConfig.map((item, index) => (
                        <div key={item.id} className={`flex items-center justify-between p-4 rounded-2xl border transition ${item.isVisible ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-transparent opacity-60'}`}>
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => handleMoveTabConfig(index, -1)}
                                        disabled={index === 0}
                                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-0"
                                    ><ArrowUp size={16} /></button>
                                    <button
                                        onClick={() => handleMoveTabConfig(index, 1)}
                                        disabled={index === tabConfig.length - 1}
                                        className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-0"
                                    ><ArrowDown size={16} /></button>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    {editingKey === `tab_${item.id}` ? (
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="text" 
                                                value={editLabel} 
                                                onChange={(e) => setEditLabel(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEdit(item.id, 'tab');
                                                    if (e.key === 'Escape') cancelEdit();
                                                }}
                                                className="border border-blue-400 rounded-lg px-2 py-0.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                                                autoFocus
                                            />
                                            <button onClick={() => saveEdit(item.id, 'tab')} className="p-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"><Check size={14} /></button>
                                            <button onClick={cancelEdit} className="p-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"><X size={14} /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 group">
                                            <span className="font-bold text-gray-700 block">{item.label}</span>
                                            <button onClick={() => startEditing(`tab_${item.id}`, item.label)} className="text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-blue-50">
                                                <Edit2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">{item.id}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <button
                                    onClick={() => handleUpdateTabConfig(item.id, 'isVisible', !item.isVisible)}
                                    className={`p-2.5 rounded-xl transition-all ${item.isVisible ? 'bg-blue-50 text-blue-600 shadow-sm' : 'bg-gray-200 text-gray-500'}`}
                                >
                                    {item.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-4 text-[10px] text-gray-400 leading-relaxed">* 학생 페이지의 하단 메뉴 순서와 노출 여부를 설정합니다. 상하 화살표로 순서를 변경하세요.</p>
            </div>
        </>
    );
};

export default LayoutDesigner;

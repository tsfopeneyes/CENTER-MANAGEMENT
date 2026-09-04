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
    handleUpdateSidebarGroup,
    handleMoveSidebarGroup,
    handleChangeSidebarGroup,
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
        } else if (type === 'sidebarGroup') {
            handleUpdateSidebarGroup(id, 'groupTitle', editLabel.trim() || '그룹');
        } else if (type === 'tab') {
            handleUpdateTabConfig(id, 'label', editLabel);
        }
        setEditingKey(null);
    };

    const cancelEdit = () => {
        setEditingKey(null);
    };

    const sidebarGroups = [...new Map([...sidebarConfig]
        .sort((a, b) => (a.groupOrder ?? a.groupIndex) - (b.groupOrder ?? b.groupIndex))
        .map(item => [item.groupId, {
            id: item.groupId,
            title: item.groupTitle,
            order: item.groupOrder ?? item.groupIndex
        }])).values()];

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
                                        disabled={index === 0 || sidebarConfig[index - 1]?.groupIndex !== item.groupIndex}
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

                <div className="space-y-5">
                    {sidebarGroups.map((group, groupIndex) => {
                        const groupItems = sidebarConfig.filter(item => item.groupId === group.id).sort((a, b) => a.order - b.order);
                        return (
                            <section key={group.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/60">
                                <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3.5">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <button onClick={() => handleMoveSidebarGroup(group.id, -1)} disabled={groupIndex === 0} className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ArrowUp size={15} /></button>
                                            <button onClick={() => handleMoveSidebarGroup(group.id, 1)} disabled={groupIndex === sidebarGroups.length - 1} className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ArrowDown size={15} /></button>
                                        </div>
                                        {editingKey === `sidebarGroup_${group.id}` ? (
                                            <div className="flex items-center gap-1.5">
                                                <input value={editLabel} onChange={e => setEditLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(group.id, 'sidebarGroup'); if (e.key === 'Escape') cancelEdit(); }} className="rounded-lg border border-blue-400 px-2 py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" autoFocus />
                                                <button onClick={() => saveEdit(group.id, 'sidebarGroup')} className="rounded-lg bg-blue-50 p-1.5 text-blue-600"><Check size={14} /></button>
                                                <button onClick={cancelEdit} className="rounded-lg bg-gray-100 p-1.5 text-gray-500"><X size={14} /></button>
                                            </div>
                                        ) : (
                                            <div className="group flex items-center gap-2">
                                                <h4 className="font-extrabold text-gray-800">{group.title}</h4>
                                                <button onClick={() => startEditing(`sidebarGroup_${group.id}`, group.title)} className="rounded-md p-1 text-gray-300 opacity-0 transition group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-500"><Edit2 size={14} /></button>
                                            </div>
                                        )}
                                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-400">{groupItems.length}개 메뉴</span>
                                    </div>
                                </div>
                                <div className="space-y-2 p-3">
                                    {groupItems.map((item, itemIndex) => {
                                        const globalIndex = sidebarConfig.findIndex(config => config.id === item.id);
                                        return (
                                            <div key={item.id} className={`flex flex-col gap-3 rounded-xl border p-3 transition md:flex-row md:items-center md:justify-between ${item.isVisible ? 'border-gray-100 bg-white' : 'border-transparent bg-gray-100 opacity-60'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col">
                                                        <button onClick={() => handleMoveSidebarConfig(globalIndex, -1)} disabled={itemIndex === 0} className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ArrowUp size={15} /></button>
                                                        <button onClick={() => handleMoveSidebarConfig(globalIndex, 1)} disabled={itemIndex === groupItems.length - 1} className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ArrowDown size={15} /></button>
                                                    </div>
                                                    <div>
                                                        {editingKey === `sidebar_${item.id}` ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <input value={editLabel} onChange={e => setEditLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id, 'sidebar'); if (e.key === 'Escape') cancelEdit(); }} className="rounded-lg border border-blue-400 px-2 py-1 text-sm font-bold outline-none" autoFocus />
                                                                <button onClick={() => saveEdit(item.id, 'sidebar')} className="rounded-lg bg-blue-50 p-1 text-blue-600"><Check size={14} /></button>
                                                                <button onClick={cancelEdit} className="rounded-lg bg-gray-100 p-1 text-gray-500"><X size={14} /></button>
                                                            </div>
                                                        ) : (
                                                            <div className="group flex items-center gap-2"><span className="font-bold text-gray-700">{item.label}</span><button onClick={() => startEditing(`sidebar_${item.id}`, item.label)} className="p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-blue-500"><Edit2 size={13} /></button></div>
                                                        )}
                                                        <span className="text-[10px] font-bold uppercase text-gray-400">{item.id}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 pl-9 md:pl-0">
                                                    <select value={item.groupId} onChange={e => handleChangeSidebarGroup(item.id, e.target.value)} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 outline-none focus:border-blue-400">
                                                        {sidebarGroups.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
                                                    </select>
                                                    <button onClick={() => handleUpdateSidebarConfig(item.id, 'isVisible', !item.isVisible)} className={`rounded-xl p-2.5 transition-all ${item.isVisible ? 'bg-blue-50 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>{item.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-gray-400">그룹명과 그룹 순서, 메뉴 순서·노출 여부를 바꿀 수 있습니다. 각 메뉴의 선택 상자에서 다른 그룹으로 이동할 수 있습니다.</p>
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

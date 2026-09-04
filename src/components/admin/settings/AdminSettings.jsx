import React, { useState } from 'react';
import { Settings, X, Check, ClipboardList, LayoutTemplate, Share2, Globe, ArrowRight } from 'lucide-react';
import Cropper from 'react-easy-crop';

// Custom Hooks
import useAdminSettings from './hooks/useAdminSettings';

// Modular Sections
import ProfileSettings from './components/ProfileSettings';
import LocationManager from './components/LocationManager';
import IntegrationConfig from './components/IntegrationConfig';
import LayoutDesigner from './components/LayoutDesigner';
import DutyChecklistSettings from './components/DutyChecklistSettings';
import OperatingHoursSettings from './components/OperatingHoursSettings';
import StaffPresenceSettings from './components/StaffPresenceSettings';
import WebAccessSettings from './components/WebAccessSettings';
import AdminPageHeader from '../common/AdminPageHeader';

const AdminSettings = ({ currentAdmin, locations, locationGroups = [], notices, fetchData, users, allLogs, responses = [], schoolLogs = [], setActiveMenu }) => {
    const isMaster = currentAdmin?.is_master || currentAdmin?.name === 'Rok' || currentAdmin?.name === 'admin';

    const {
        profilePreview,
        newAdminPassword, setNewAdminPassword,
        confirmAdminPassword, setConfirmAdminPassword,
        profileLoading,
        showEditor, setShowEditor,
        editorImageSrc,
        crop, setCrop,
        zoom, setZoom,
        rotation, setRotation,
        handleAdminProfileImageSelect, handleSaveCroppedImage, handleSaveAdminProfile,

        gsWebhookUrl, setGsWebhookUrl,
        lineChannelAccessToken, setLineChannelAccessToken,
        lineGroupId, setLineGroupId,
        lineVisitNotificationsEnabled, setLineVisitNotificationsEnabled,
        lineCoffeeChatNotificationsEnabled, setLineCoffeeChatNotificationsEnabled,
        lineProgramNotificationsEnabled, setLineProgramNotificationsEnabled,
        slackVisitNotificationsEnabled, setSlackVisitNotificationsEnabled,
        slackCoffeeChatNotificationsEnabled, setSlackCoffeeChatNotificationsEnabled,
        slackProgramNotificationsEnabled, setSlackProgramNotificationsEnabled,
        slackRentalNotificationsEnabled, setSlackRentalNotificationsEnabled,
        discordWebhookUrl, setDiscordWebhookUrl,
        kioskMasterPin, setKioskMasterPin,
        isBackingUp, syncProgress,
        handleSaveIntegrations, handleGoogleSheetsBackup,

        tempGroupName, setTempGroupName,
        editGroupId, setEditGroupId,
        selectedGroupIdForLocation, setSelectedGroupIdForLocation,
        tempLocationName, setTempLocationName,
        editLocationId, setEditLocationId,
        handleAddGroup, handleUpdateGroup, handleDeleteGroup, handleToggleGroupStatus,
        handleAddLocation, handleUpdateLocation, handleDeleteLocation,
        handleToggleLocationStatus,

        dashboardConfig, sidebarConfig, tabConfig,
        configLoading, sidebarConfigLoading, tabConfigLoading,
        handleMoveConfig, handleUpdateConfig, handleSaveDashboardConfig,
        handleMoveSidebarConfig, handleUpdateSidebarConfig, handleUpdateSidebarGroup,
        handleMoveSidebarGroup, handleChangeSidebarGroup, handleSaveSidebarConfig,
        handleMoveTabConfig, handleUpdateTabConfig, handleSaveTabConfig,
        operatingHours, hoursLoading,
        handleUpdateOperatingHours, handleSaveOperatingHours,
        isBadgeSystemEnabled, setIsBadgeSystemEnabled,
        selectedStaffConfig, staffSaving, handleSaveStaffPresenceConfig,
        checkinSurveyConfig, surveySaving, handleSaveCheckinSurveyConfig,
        checkoutSurveyConfig, checkoutSurveySaving, handleSaveCheckoutSurveyConfig
    } = useAdminSettings({
        currentAdmin, locations, locationGroups, fetchData, users, allLogs, responses, schoolLogs, notices
    });
    const [activeTab, setActiveTab] = useState('basic');

    return (
        <div className="w-full space-y-6 animate-fade-in-up pb-12">
            <AdminPageHeader
                title="시스템 설정"
                subtitle="센터 기본 정보 및 보안, 연동 설정 관리"
                icon={<Settings />}
            />

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-gray-100 pb-px overflow-x-auto scrollbar-none">
                <button
                    onClick={() => setActiveTab('basic')}
                    className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 -mb-px flex items-center gap-2 ${
                        activeTab === 'basic'
                            ? 'border-[#3182f6] text-[#3182f6]'
                            : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    <Settings size={16} />
                    <span>기본/공간 설정</span>
                </button>
                {isMaster && (
                    <>
                        <button
                            onClick={() => setActiveTab('operations')}
                            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 -mb-px flex items-center gap-2 ${
                                activeTab === 'operations'
                                    ? 'border-[#3182f6] text-[#3182f6]'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <ClipboardList size={16} />
                            <span>운영/설문 설정</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('integration')}
                            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 -mb-px flex items-center gap-2 ${
                                activeTab === 'integration'
                                    ? 'border-[#3182f6] text-[#3182f6]'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <Share2 size={16} />
                            <span>외부 연동 설정</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('layout')}
                            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 -mb-px flex items-center gap-2 ${
                                activeTab === 'layout'
                                    ? 'border-[#3182f6] text-[#3182f6]'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <LayoutTemplate size={16} />
                            <span>화면 디자인 설정</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('web_access')}
                            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 -mb-px flex items-center gap-2 ${
                                activeTab === 'web_access'
                                    ? 'border-[#3182f6] text-[#3182f6]'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <Globe size={16} />
                            <span>웹 접속 현황</span>
                        </button>
                    </>
                )}
            </div>

            {/* Tab Contents */}
            <div className="space-y-6">
                {activeTab === 'basic' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                        <ProfileSettings
                            currentAdmin={currentAdmin}
                            profilePreview={profilePreview}
                            newAdminPassword={newAdminPassword}
                            setNewAdminPassword={setNewAdminPassword}
                            confirmAdminPassword={confirmAdminPassword}
                            setConfirmAdminPassword={setConfirmAdminPassword}
                            profileLoading={profileLoading}
                            handleAdminProfileImageSelect={handleAdminProfileImageSelect}
                            handleSaveAdminProfile={handleSaveAdminProfile}
                        />

                        <LocationManager
                            isMaster={isMaster}
                            locations={locations}
                            locationGroups={locationGroups}
                            tempGroupName={tempGroupName}
                            setTempGroupName={setTempGroupName}
                            handleAddGroup={handleAddGroup}
                            editGroupId={editGroupId}
                            setEditGroupId={setEditGroupId}
                            handleUpdateGroup={handleUpdateGroup}
                            handleDeleteGroup={handleDeleteGroup}
                            handleToggleGroupStatus={handleToggleGroupStatus}
                            selectedGroupIdForLocation={selectedGroupIdForLocation}
                            setSelectedGroupIdForLocation={setSelectedGroupIdForLocation}
                            tempLocationName={tempLocationName}
                            setTempLocationName={setTempLocationName}
                            handleAddLocation={handleAddLocation}
                            editLocationId={editLocationId}
                            setEditLocationId={setEditLocationId}
                            handleUpdateLocation={handleUpdateLocation}
                            handleDeleteLocation={handleDeleteLocation}
                            handleToggleLocationStatus={handleToggleLocationStatus}
                        />

                        {isMaster && (
                            <div className="md:col-span-2">
                                <OperatingHoursSettings
                                    operatingHours={operatingHours}
                                    handleUpdateOperatingHours={handleUpdateOperatingHours}
                                    handleSaveOperatingHours={handleSaveOperatingHours}
                                    hoursLoading={hoursLoading}
                                />
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'operations' && isMaster && (
                    <div className="space-y-6">
                        <StaffPresenceSettings
                            users={users}
                            selectedStaffConfig={selectedStaffConfig}
                            onSave={handleSaveStaffPresenceConfig}
                            isSaving={staffSaving}
                        />
                        <div className="border border-blue-100 bg-blue-50 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div><p className="font-bold text-gray-900">입실·퇴실 설문은 설문조사에서 관리합니다</p><p className="text-sm text-gray-500 mt-1">설문 작성, 적용 설정, 기존 응답 확인을 한곳에서 할 수 있습니다.</p></div>
                            <button onClick={() => setActiveMenu?.('SURVEYS')} className="px-4 py-2.5 bg-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2">설문조사로 이동 <ArrowRight size={16} /></button>
                        </div>
                        <DutyChecklistSettings isMaster={isMaster} />
                    </div>
                )}

                {activeTab === 'integration' && isMaster && (
                    <div className="w-full">
                        <IntegrationConfig
                            gsWebhookUrl={gsWebhookUrl}
                            setGsWebhookUrl={setGsWebhookUrl}
                            lineChannelAccessToken={lineChannelAccessToken}
                            setLineChannelAccessToken={setLineChannelAccessToken}
                            lineGroupId={lineGroupId}
                            setLineGroupId={setLineGroupId}
                            lineVisitNotificationsEnabled={lineVisitNotificationsEnabled}
                            setLineVisitNotificationsEnabled={setLineVisitNotificationsEnabled}
                            lineCoffeeChatNotificationsEnabled={lineCoffeeChatNotificationsEnabled}
                            setLineCoffeeChatNotificationsEnabled={setLineCoffeeChatNotificationsEnabled}
                            lineProgramNotificationsEnabled={lineProgramNotificationsEnabled}
                            setLineProgramNotificationsEnabled={setLineProgramNotificationsEnabled}
                            slackVisitNotificationsEnabled={slackVisitNotificationsEnabled}
                            setSlackVisitNotificationsEnabled={setSlackVisitNotificationsEnabled}
                            slackCoffeeChatNotificationsEnabled={slackCoffeeChatNotificationsEnabled}
                            setSlackCoffeeChatNotificationsEnabled={setSlackCoffeeChatNotificationsEnabled}
                            slackProgramNotificationsEnabled={slackProgramNotificationsEnabled}
                            setSlackProgramNotificationsEnabled={setSlackProgramNotificationsEnabled}
                            slackRentalNotificationsEnabled={slackRentalNotificationsEnabled}
                            setSlackRentalNotificationsEnabled={setSlackRentalNotificationsEnabled}
                            discordWebhookUrl={discordWebhookUrl}
                            setDiscordWebhookUrl={setDiscordWebhookUrl}
                            kioskMasterPin={kioskMasterPin}
                            setKioskMasterPin={setKioskMasterPin}
                            isBadgeSystemEnabled={isBadgeSystemEnabled}
                            setIsBadgeSystemEnabled={setIsBadgeSystemEnabled}
                            isBackingUp={isBackingUp}
                            syncProgress={syncProgress}
                            handleSaveIntegrations={handleSaveIntegrations}
                            handleGoogleSheetsBackup={handleGoogleSheetsBackup}
                        />
                    </div>
                )}

                {activeTab === 'layout' && isMaster && (
                    <div className="w-full">
                        <LayoutDesigner
                            dashboardConfig={dashboardConfig}
                            sidebarConfig={sidebarConfig}
                            tabConfig={tabConfig}
                            configLoading={configLoading}
                            sidebarConfigLoading={sidebarConfigLoading}
                            tabConfigLoading={tabConfigLoading}
                            handleMoveConfig={handleMoveConfig}
                            handleUpdateConfig={handleUpdateConfig}
                            handleSaveDashboardConfig={handleSaveDashboardConfig}
                            handleMoveSidebarConfig={handleMoveSidebarConfig}
                            handleUpdateSidebarConfig={handleUpdateSidebarConfig}
                            handleUpdateSidebarGroup={handleUpdateSidebarGroup}
                            handleMoveSidebarGroup={handleMoveSidebarGroup}
                            handleChangeSidebarGroup={handleChangeSidebarGroup}
                            handleSaveSidebarConfig={handleSaveSidebarConfig}
                            handleMoveTabConfig={handleMoveTabConfig}
                            handleUpdateTabConfig={handleUpdateTabConfig}
                            handleSaveTabConfig={handleSaveTabConfig}
                        />
                    </div>
                )}

                {activeTab === 'web_access' && isMaster && (
                    <div className="w-full">
                        <WebAccessSettings
                            users={users}
                            fetchData={fetchData}
                        />
                    </div>
                )}
            </div>

            {/* Cropper Modal */}
            {showEditor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col h-[80vh] md:h-auto shadow-2xl">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-800">프로필 사진 조절</h3>
                            <button onClick={() => setShowEditor(false)} className="text-gray-400 hover:text-gray-600 transition p-2 rounded-full hover:bg-gray-100"><X size={24} /></button>
                        </div>
                        <div className="relative w-full flex-1 md:h-96 bg-gray-900">
                            <Cropper
                                image={editorImageSrc}
                                crop={crop}
                                zoom={zoom}
                                rotation={rotation}
                                aspect={1}
                                onCropChange={setCrop}
                                onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                                onZoomChange={setZoom}
                                onRotationChange={setRotation}
                                cropShape="round"
                                showGrid={false}
                            />
                        </div>
                        <div className="p-6 bg-gray-50 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-2 block">확대/축소</label>
                                <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-2 block">회전</label>
                                <input type="range" min={0} max={360} step={1} value={rotation} onChange={(e) => setRotation(e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-2">
                                <button onClick={() => setShowEditor(false)} className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition text-sm">취소</button>
                                <button onClick={handleSaveCroppedImage} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg flex items-center gap-2 text-sm"><Check size={18} /> 반영하기</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSettings;

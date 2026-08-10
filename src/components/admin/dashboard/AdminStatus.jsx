import React, { useState } from 'react';
import { useAdminStatus } from './hooks/useAdminStatus';

// Sub Components
import AdminStatusHeader from './components/AdminStatusHeader';
import ZoneCards from './components/ZoneCards';
import RealtimeActiveUsers from './components/RealtimeActiveUsers';
import ZoneDetailModal from './components/ZoneDetailModal';
import UserEditModal from '../users/modals/UserEditModal';

const AdminStatus = ({
    users = [],
    locations = [],
    locationGroups = [],
    zoneStats,
    currentLocations,
    handleForceCheckout,
    handleBatchCheckout,
    fetchData,
    setActiveMenu,
    allLogs = [],
    dailyVisitStats = {},
    isAlertEnabled,
    handleToggleAlert,
    checkinSurveys,
    visitNotes,
    surveyConfig
}) => {
    const [selectedUserForModal, setSelectedUserForModal] = useState(null);

    const {
        locationTab, setLocationTab,
        zoneDetailModal, setZoneDetailModal,
        isPast10PM,
        adminIdsSet,
        activeUserCount,
        filteredLocations,
        totalActive,
        activeUsersList,
        handleZoneClick
    } = useAdminStatus({ users, locations, locationGroups, zoneStats, currentLocations, dailyVisitStats, allLogs });

    const handleUserClick = (targetUser) => {
        if (!targetUser) return;
        const fullUser = users.find(u => u.id === targetUser.id || String(u.id) === String(targetUser.id)) || targetUser;
        setSelectedUserForModal(fullUser);
    };

    return (
        <div className="space-y-4 md:space-y-6 animate-fade-in-up">
            <AdminStatusHeader
                activeUserCount={activeUserCount}
                isPast10PM={isPast10PM}
                currentLocations={currentLocations}
                adminIdsSet={adminIdsSet}
                handleBatchCheckout={handleBatchCheckout}
                fetchData={fetchData}
                isAlertEnabled={isAlertEnabled}
                handleToggleAlert={handleToggleAlert}
            />

            <ZoneCards
                locationTab={locationTab}
                setLocationTab={setLocationTab}
                setActiveMenu={setActiveMenu}
                totalActive={totalActive}
                filteredLocations={filteredLocations}
                zoneStats={zoneStats}
                dailyVisitStats={dailyVisitStats}
                handleZoneClick={handleZoneClick}
            />

            <RealtimeActiveUsers
                activeUsersList={activeUsersList}
                handleForceCheckout={handleForceCheckout}
                checkinSurveys={checkinSurveys}
                visitNotes={visitNotes}
                surveyConfig={surveyConfig}
                onUserClick={handleUserClick}
            />

            <ZoneDetailModal
                zoneDetailModal={zoneDetailModal}
                setZoneDetailModal={setZoneDetailModal}
                handleForceCheckout={handleForceCheckout}
                checkinSurveys={checkinSurveys}
                surveyConfig={surveyConfig}
                onUserClick={handleUserClick}
            />

            {selectedUserForModal && (
                <UserEditModal
                    editingUser={selectedUserForModal}
                    setEditingUser={setSelectedUserForModal}
                    fetchData={fetchData}
                    locations={locations}
                />
            )}
        </div>
    );
};

export default AdminStatus;

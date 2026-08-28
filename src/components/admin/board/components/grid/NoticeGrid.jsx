import React from 'react';
import PropTypes from 'prop-types';
import NoticeCard from './NoticeCard';
import { VIEW_MODES } from '../../utils/constants';

const NoticeGrid = ({ 
    notices, 
    viewMode, 
    mode, 
    noticeStats, 
    onViewDetails, 
    onOpenParticipants, 
    onOpenFeedback,
    onStatusChange, 
    onEdit, 
    onDelete 
}) => {
    // Normalize viewMode to only support LARGE (큰 카드) and SMALLER (작은 카드)
    const activeMode = (viewMode === VIEW_MODES.LARGE || viewMode === VIEW_MODES.SMALLER) 
        ? viewMode 
        : VIEW_MODES.LARGE;

    // Grid container styles based on activeMode
    let gridClass = "grid gap-4 md:gap-6 lg:gap-8 ";
    if (activeMode === VIEW_MODES.LARGE) {
        gridClass += "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
    } else {
        gridClass += "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";
    }

    return (
        <div className={gridClass}>
            {notices.map(notice => (
                <NoticeCard
                    key={notice.id}
                    notice={notice}
                    viewMode={activeMode}
                    mode={mode}
                    noticeStats={noticeStats}
                    onViewDetails={onViewDetails}
                    onOpenParticipants={onOpenParticipants}
                    onOpenFeedback={onOpenFeedback}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
};

NoticeGrid.propTypes = {
    notices: PropTypes.array.isRequired,
    viewMode: PropTypes.string.isRequired,
    mode: PropTypes.string.isRequired,
    noticeStats: PropTypes.object.isRequired,
    onViewDetails: PropTypes.func.isRequired,
    onOpenParticipants: PropTypes.func.isRequired,
    onOpenFeedback: PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onEdit: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired
};

export default React.memo(NoticeGrid);

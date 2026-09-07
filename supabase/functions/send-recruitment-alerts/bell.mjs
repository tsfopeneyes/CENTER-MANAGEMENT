// Stable per interest, not per attempt: retries must not reset read state.
export async function recruitmentBellNotification(row) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`recruitment-bell:${row.id}`));
    const bytes = new Uint8Array(digest).slice(0,16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
    return {
        id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
        // Do not resolve recipients from the publicly editable profile table.
        target_group: `AUTH_${row.auth_user_id}`,
        notification_type: 'RECRUITMENT',
        notice_id: row.notice_id,
        content: `${String(row.title || '관심 프로그램').slice(0,150)}\n프로그램 신청이 시작됐어요!`,
    };
}

export async function saveRecruitmentBell(db,row) {
    const notification = await recruitmentBellNotification(row);
    const {error} = await db.from('app_notifications').insert(notification);
    if (!error) return;
    if (error.code !== '23505') throw new Error('bell_save_failed');
    const {data,error:readError} = await db.from('app_notifications')
        .select('target_group,notice_id,notification_type').eq('id',notification.id).single();
    if (readError || data?.target_group !== notification.target_group ||
        String(data?.notice_id) !== String(notification.notice_id) || data?.notification_type !== 'RECRUITMENT') {
        throw new Error('bell_identity_conflict');
    }
}

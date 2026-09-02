// Separate from the recruitment-start notification, with a stable ID so
// re-registering does not duplicate confirmations or reset existing reads.
export const saveInterestConfirmation = async (db, noticeId, authUserId, verifyUser) => {
    await verifyUser(authUserId);
    const {data:interest,error:interestError} = await db.from('program_recruitment_interests')
        .select('id').eq('notice_id',noticeId).eq('auth_user_id',authUserId).eq('enabled',true).single();
    if (interestError || !interest?.id) throw new Error('interest_confirmation_unavailable');
    // Only use the public calendar projection, never unpublished program bodies.
    const {data:program,error:programError} = await db.from('program_calendar_previews')
        .select('title').eq('id',noticeId).single();
    if (programError || !program) throw new Error('interest_confirmation_program_unavailable');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(`interest-confirmation:${interest.id}`))).slice(0,16);
    digest[6] = (digest[6] & 15) | 80;
    digest[8] = (digest[8] & 63) | 128;
    const hex = Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
    const notification = {
        id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
        target_group: `AUTH_${authUserId}`,
        notification_type: 'RECRUITMENT_SAVED',
        notice_id: noticeId,
        content: `관심 프로그램으로 등록됐어요!\n${String(program.title || '관심 프로그램').slice(0,150)}`,
    };
    await verifyUser(authUserId);
    const {error} = await db.from('app_notifications').insert(notification);
    if (!error) return;
    if (error.code !== '23505') throw new Error('interest_confirmation_save_failed');
    const {data:existing,error:readError} = await db.from('app_notifications')
        .select('target_group,notice_id,notification_type').eq('id',notification.id).single();
    if (readError || existing?.target_group !== notification.target_group ||
        String(existing?.notice_id) !== String(noticeId) || existing?.notification_type !== notification.notification_type) {
        throw new Error('interest_confirmation_identity_conflict');
    }
};

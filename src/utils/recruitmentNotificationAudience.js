// An admin viewing another profile must not attach their own private alerts.
export const recruitmentNotificationGroup = (profile, sessionUser) => {
    if (!profile?.id || !sessionUser?.id || sessionUser.is_anonymous) return null;
    const profileAuthId = profile.auth_user_id || profile.id;
    return profileAuthId === sessionUser.id ? `AUTH_${sessionUser.id}` : null;
};

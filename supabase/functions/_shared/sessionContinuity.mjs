// SERVER-ONLY policy kernel, not an endpoint and not deployed. Dependencies must
// be authoritative server reads, never request bodies or public editable users.
// No RPC, account creation, password changes or schema mutation is performed.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const result = (decision, reason) => ({protocol: 1, decision, reason});

export async function assessSessionContinuity(accessToken, {verifyToken, loadAccount, loadAssurance, now = Date.now}) {
    // verifyToken must check signature, issuer, audience, expiry AND live session
    // existence/revocation; a JWT decode/getSession alone does not satisfy this.
    const principal = await verifyToken(accessToken);
    const time = now();
    if (!principal || !uuid(principal.authUserId) || !uuid(principal.sessionId) ||
        principal.isAnonymous !== false || principal.live !== true ||
        !Number.isFinite(principal.expiresAt) || principal.expiresAt <= time) {
        return result('reauth', 'session_invalid');
    }
    // loadAccount must resolve an unambiguous 1:1 mapping from protected storage
    // and the current credential epoch. Never pick the first public users match.
    const account = await loadAccount(principal.authUserId);
    if (!account || account.authUserId !== principal.authUserId || !uuid(account.profileId) ||
        account.mappingVerified !== true || account.status !== 'active' || typeof account.mustChangePassword !== 'boolean' ||
        !Number.isSafeInteger(account.credentialVersion) || account.credentialVersion < 1) {
        return result('blocked', 'account_review_required');
    }
    if (account.mustChangePassword === true) return result('blocked', 'password_change_required');
    // A valid legacy Auth token is not evidence of safe password verification.
    // Assurance must be created ONLY by a vetted server login/reconfirmation or
    // an audited continuity import. Never create it merely because a JWT exists.
    const assurance = await loadAssurance(principal.sessionId);
    if (!assurance || assurance.authUserId !== principal.authUserId || assurance.profileId !== account.profileId ||
        assurance.sessionId !== principal.sessionId || assurance.credentialVersion !== account.credentialVersion ||
        assurance.status !== 'trusted') {
        return result('reauth', 'confirmation_required');
    }
    // The assurance records that this exact live provider session completed the
    // vetted password flow. Its timestamp limits the initial issuance window;
    // it must not turn an otherwise live, refreshable browser session into a
    // daily password prompt. Sign-out/revocation, account blocking and a
    // credential-version change still invalidate continuity authoritatively.
    return {...result('retain', 'verified'), authUserId: principal.authUserId, profileId: account.profileId,
        sessionId: principal.sessionId, validUntil: Math.min(principal.expiresAt, time + 60000)};
}

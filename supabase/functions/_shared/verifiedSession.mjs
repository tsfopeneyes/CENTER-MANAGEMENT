// Supabase validates the signature. Only then do we use JWT session claims,
// and a direct server DB read checks whether that session is still active.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const decodeClaims = token => {
    const pieces = token.split('.');
    if (pieces.length !== 3 || !pieces.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
    try {
        const part = pieces[1].replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')), c => c.charCodeAt(0));
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } catch { return null; }
};

export function createVerifiedSessionReader({supabaseUrl, publishableKey, loadLiveSession, fetcher = fetch, now = Date.now}) {
    const base = new URL(supabaseUrl);
    if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
        (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) {
        throw new Error('Invalid Auth server configuration');
    }
    if (!publishableKey || typeof loadLiveSession !== 'function') throw new Error('Missing Auth server configuration');
    const readClaims=(token,expectedAuthUserId=null)=>{
        if (typeof token !== 'string' || token.length > 8192) return null;
        const claims = decodeClaims(token);
        // Preflight only rejects malformed claims; it NEVER authenticates them.
        if (!claims || !uuid(claims.sub) || !uuid(claims.session_id) ||
            claims.iss !== base.origin + '/auth/v1' || claims.aud !== 'authenticated' ||
            claims.role !== 'authenticated' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now() ||
            expectedAuthUserId!==null&&claims.sub!==expectedAuthUserId) return null;
        return claims;
    };
    const readLive=async claims=>{
        const live=await loadLiveSession(claims.session_id,claims.sub);
        if(!live||live.sessionId!==claims.session_id||live.authUserId!==claims.sub||live.live!==true)return null;
        return {authUserId:claims.sub,sessionId:claims.session_id,isAnonymous:false,expiresAt:claims.exp*1000,live:true};
    };
    const verify=async (token, {signal} = {}) => {
        const claims=readClaims(token);if(!claims)return null;
        const response = await fetcher(base.origin + '/auth/v1/user', {
            method: 'GET', signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
            headers: {apikey: publishableKey, Authorization: `Bearer ${token}`},
        });
        if ([401, 403].includes(response.status)) return null;
        if (!response.ok) throw new Error('Authentication service unavailable');
        const user = await response.json();
        if (user?.id !== claims.sub || user.is_anonymous !== false) return null;
        // Do not infer membership/roles from user_metadata or browser profile IDs.
        return readLive(claims);
    };
    // A token returned by the configured password endpoint comes from the same
    // trusted Auth response. Validate its claims and live DB session directly,
    // avoiding a redundant /auth/v1/user round trip during login.
    verify.created=async(token,authUserId)=>{const claims=readClaims(token,authUserId);return claims?readLive(claims):null;};
    return verify;
}

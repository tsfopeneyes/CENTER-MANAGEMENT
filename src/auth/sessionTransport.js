// No default URL: never point the staged client at an unprepared live server.
// The future endpoint must verify JWT, live session, protected profile mapping
// and issuance evidence; this transport cannot authorize access by itself.
export function createSessionTransport({endpoint, publishableKey, fetcher = fetch}) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
        throw new Error('인증 서버에는 HTTPS 연결이 필요합니다.');
    }
    return async (accessToken, {signal}) => {
        const response = await fetcher(url.href, {
            method: 'POST', signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
            headers: {Authorization: `Bearer ${accessToken}`, apikey: publishableKey,
                'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'session-status', protocol: 1}),
        });
        // 401 is an authentication rejection; 403 is an authorization rejection.
        // 404, 429, 5xx and network errors must never delete a user's SDK session.
        if (response.status === 401) return {protocol: 1, decision: 'reauth'};
        if (response.status === 403) return {protocol: 1, decision: 'blocked'};
        if (!response.ok) throw new Error('인증 서버 연결을 확인하지 못했습니다.');
        return response.json();
    };
}

import {LoginError, invalidLogin} from './loginSecurity.mjs';

export function createPasswordGateway({supabaseUrl, publishableKey, fetcher = fetch}) {
    const url = new URL(supabaseUrl);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || !publishableKey) {
        throw new Error('Invalid password provider configuration');
    }
    return {
        async signIn(email, password, {signal}) {
            const response = await fetcher(url.origin + '/auth/v1/token?grant_type=password', {
                method:'POST',signal,redirect:'error',cache:'no-store',credentials:'omit',
                headers:{apikey:publishableKey,'Content-Type':'application/json'},
                body:JSON.stringify({email,password}),
            });
            // No hash-as-password fallback, automatic retry, shared auth client,
            // account creation or modification of the user's current session.
            if ([400,401,403,422].includes(response.status)) throw invalidLogin();
            if (!response.ok) throw new LoginError('temporarily_unavailable',503);
            return response.json();
        },
        async discardCreatedSession(accessToken) {
            if (typeof accessToken !== 'string' || !accessToken) return;
            // Only the newly returned token is used. Never "global" or "others".
            const response = await fetcher(url.origin + '/auth/v1/logout?scope=local', {
                method:'POST',signal:AbortSignal.timeout(3000),redirect:'error',cache:'no-store',credentials:'omit',
                headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`},
            });
            if (!response.ok && ![401,403,404].includes(response.status)) throw new Error('Session cleanup incomplete');
        },
    };
}

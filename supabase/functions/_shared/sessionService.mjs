import {assessSessionContinuity} from './sessionContinuity.mjs';
import {createVerifiedSessionReader} from './verifiedSession.mjs';
import {createSessionSnapshot} from './sessionReadStore.mjs';
import {createSessionStatusHandler} from './sessionStatusHandler.mjs';

// Explicit injection only; importing this file never connects to a database,
// reads .env, starts a listener, changes Supabase config or modifies an account.
export function createSessionService({pool, supabaseUrl, publishableKey, allowedOrigins, fetcher = fetch, now = Date.now, timeoutMs}) {
    const snapshot = createSessionSnapshot(pool);
    const assess = (token, {signal}) => snapshot(async store => {
        if (signal.aborted) throw new Error('Request cancelled');
        const verify = createVerifiedSessionReader({supabaseUrl, publishableKey, fetcher, now,
            loadLiveSession: store.loadLiveSession});
        const result = await assessSessionContinuity(token, {
            ...store, now, verifyToken: value => verify(value, {signal}),
        });
        if (signal.aborted) throw new Error('Request cancelled');
        return result;
    });
    return createSessionStatusHandler({assess, allowedOrigins, timeoutMs});
}

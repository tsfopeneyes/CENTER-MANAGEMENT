// Staged foundation: deliberately not connected to the production App yet.
// resolveSession MUST validate the token and protected member/session records on
// the server. A local profile, public users row or decoded JWT is not a substitute.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const terminalCodes = new Set(['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found']);

export function createSessionCoordinator({auth, resolveSession, expectedProfileId = null,
    now = Date.now, timeoutMs = 20000, schedule = setTimeout, cancel = clearTimeout}) {
    let revision = 0, pending = null, expiryTimer, queuedTimer, subscription;
    let active = false, context = expectedProfileId;
    const listeners = new Set();
    let state = Object.freeze({phase: 'checking', reason: 'initial', identity: null, revision});
    const publish = (phase, reason, identity = null) => {
        state = Object.freeze({phase, reason, identity, revision});
        for (const listener of listeners) listener();
        return state;
    };
    const invalidate = () => {
        revision++;
        cancel(expiryTimer);
        pending?.abort.abort();
        pending = null;
    };
    const recheckLater = () => {
        cancel(queuedTimer);
        // Supabase auth callbacks must finish before calling SDK methods again.
        queuedTimer = schedule(() => { if (active) void check(); }, 0);
    };
    const check = () => {
        if (pending) return pending.promise;
        const run = {revision, abort: new AbortController(), promise: null};
        const valid = () => revision === run.revision;
        pending = run;
        publish('checking', 'verifying');
        let timer;
        const work = async () => {
            // The SDK initializes and refreshes its own saved session. Never
            // reconstruct one from cached names, IDs, passwords or hashes.
            const {data, error} = await auth.getSession();
            if (!valid()) return state;
            if (error) {
                return terminalCodes.has(error.code)
                    ? publish('reauth', 'session_unavailable')
                    : publish('retry', 'connection_unavailable');
            }
            const session = data?.session;
            if (!session || session.user?.is_anonymous) return publish('reauth', 'session_missing');
            if (!uuid(session.user?.id) || !session.access_token || !Number.isFinite(session.expires_at)) {
                return publish('reauth', 'session_invalid');
            }
            if (session.expires_at * 1000 <= now()) return publish('retry', 'refresh_pending');
            const result = await resolveSession(session.access_token, {signal: run.abort.signal});
            if (!valid()) return state;
            if (result?.protocol !== 1) return publish('retry', 'server_not_ready');
            if (result.decision === 'reauth') return publish('reauth', 'confirmation_required');
            if (result.decision === 'blocked') return publish('blocked', 'account_review_required');
            if (result.decision !== 'retain' || result.authUserId !== session.user.id ||
                !uuid(result.profileId) || !uuid(result.sessionId) || !Number.isFinite(result.validUntil)) {
                return publish('retry', 'invalid_server_response');
            }
            // The expected profile is only an anti-mixup constraint, never proof
            // of identity. Admin student-preview needs a separate authorization.
            if (context && result.profileId !== context) return publish('blocked', 'account_changed');
            const validUntil = Math.min(result.validUntil, session.expires_at * 1000);
            if (validUntil <= now()) return publish('retry', 'verification_expired');
            const identity = Object.freeze({authUserId: result.authUserId, profileId: result.profileId,
                sessionId: result.sessionId, validUntil});
            cancel(expiryTimer);
            expiryTimer = schedule(() => {
                if (!valid()) return;
                invalidate();
                publish('checking', 'verification_expired');
                if (active) recheckLater();
            }, Math.min(validUntil - now(), 2147483647));
            return publish('ready', 'verified', identity);
        };
        const interrupted = new Promise(resolve => {
            run.abort.signal.addEventListener('abort', () => resolve(state), {once: true});
        });
        const timedOut = new Promise(resolve => {
            timer = schedule(() => {
                if (valid()) {
                    revision++;
                    publish('retry', 'connection_timeout');
                }
                run.abort.abort();
                resolve(state);
            }, timeoutMs);
        });
        run.promise = Promise.race([work(), interrupted, timedOut]).catch(() => {
            if (valid()) return publish('retry', 'connection_unavailable');
            return state;
        }).finally(() => {
            cancel(timer);
            if (pending === run) pending = null;
        });
        return run.promise;
    };
    return {
        getSnapshot: () => state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        check,
        start() {
            if (active) return;
            active = true;
            subscription = auth.onAuthStateChange(event => {
                invalidate();
                publish(event === 'SIGNED_OUT' ? 'reauth' : 'checking',
                    event === 'SIGNED_OUT' ? 'session_missing' : 'session_changed');
                if (event !== 'SIGNED_OUT') recheckLater();
            }).data.subscription;
            recheckLater();
        },
        stop() {
            active = false;
            subscription?.unsubscribe();
            subscription = null;
            cancel(queuedTimer);
            invalidate();
            publish('checking', 'stopped');
        },
        setExpectedProfile(profileId) {
            if (context === profileId) return;
            context = profileId;
            invalidate();
            publish('checking', 'profile_changed');
            if (active) recheckLater();
        },
        // Capture before a protected action; check again after awaits, before
        // applying its response. This never retries a mutation automatically.
        captureIdentity() {
            if (state.phase !== 'ready' || state.identity.validUntil <= now()) {
                throw new Error('인증 확인을 완료한 뒤 다시 시도해주세요.');
            }
            return Object.freeze({revision, ...state.identity});
        },
        assertCurrent(captured) {
            if (!captured || state.phase !== 'ready' || captured.revision !== revision ||
                !Number.isFinite(captured.validUntil) || captured.validUntil <= now() ||
                captured.authUserId !== state.identity.authUserId || captured.profileId !== state.identity.profileId ||
                captured.sessionId !== state.identity.sessionId || state.identity.validUntil <= now()) {
                throw new Error('인증 상태가 변경되었습니다. 작업 결과를 다시 확인해주세요.');
            }
        },
    };
}

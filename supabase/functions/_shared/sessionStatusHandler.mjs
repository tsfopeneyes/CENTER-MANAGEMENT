// Portable Request -> Response handler. No Deno.serve or production wiring yet.
// Does not accept passwords, names, role claims, profile IDs or database writes.
export function createSessionStatusHandler({assess, allowedOrigins = [], timeoutMs = 8000}) {
    const origins = new Set(allowedOrigins);
    if (origins.has('*')) throw new Error('Explicit origins required');
    return async request => {
        const origin = request.headers.get('Origin');
        const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff', Vary: 'Origin'};
        const respond = (status, body) => new Response(JSON.stringify(body), {status, headers});
        if (origin && !origins.has(origin)) return respond(403, {error: 'origin_not_allowed'});
        if (origin) headers['Access-Control-Allow-Origin'] = origin;
        if (request.method === 'OPTIONS') {
            headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
            headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type';
            return new Response(null, {status: 204, headers});
        }
        if (request.method !== 'POST') return respond(405, {error: 'method_not_allowed'});
        if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
            return respond(415, {error: 'json_required'});
        }
        const authorization = request.headers.get('Authorization') || '';
        if (!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(authorization)) {
            return respond(401, {protocol: 1, decision: 'reauth'});
        }
        const abort = new AbortController();
        const onAbort = () => abort.abort();
        request.signal.addEventListener('abort', onAbort, {once: true});
        if (request.signal.aborted) abort.abort();
        let timer;
        const timeout = new Promise(resolve => {
            timer = setTimeout(() => { abort.abort(); resolve(respond(503, {error: 'temporarily_unavailable'})); }, timeoutMs);
        });
        const work = async () => {
            const reader = request.body?.getReader();
            if (!reader) return respond(400, {error: 'invalid_request'});
            const cancelRead = () => { void reader.cancel().catch(() => {}); };
            abort.signal.addEventListener('abort', cancelRead, {once: true});
            let size = 0, chunks = [];
            try {
                while (!abort.signal.aborted) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > 2048) { await reader.cancel(); return respond(413, {error: 'request_too_large'}); }
                    chunks.push(value);
                }
            } finally { abort.signal.removeEventListener('abort', cancelRead); reader.releaseLock(); }
            if (abort.signal.aborted) return respond(503, {error: 'temporarily_unavailable'});
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            let input;
            try { input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
            catch { return respond(400, {error: 'invalid_request'}); }
            if (!input || input.action !== 'session-status' || input.protocol !== 1 ||
                Object.keys(input).some(key => !['action', 'protocol'].includes(key))) {
                return respond(400, {error: 'invalid_request'});
            }
            const result = await assess(authorization.slice(7), {signal: abort.signal});
            if (abort.signal.aborted) return respond(503, {error: 'temporarily_unavailable'});
            if (result?.protocol !== 1 || !['retain', 'reauth', 'blocked'].includes(result.decision)) {
                return respond(503, {error: 'temporarily_unavailable'});
            }
            if (result.decision !== 'retain') {
                return respond(result.decision === 'reauth' ? 401 : 403, {protocol: 1, decision: result.decision});
            }
            // Whitelist output. Never forward internal errors, database rows,
            // credential metadata, passwords, tokens or arbitrary adapter fields.
            return respond(200, {protocol: 1, decision: 'retain', authUserId: result.authUserId,
                profileId: result.profileId, sessionId: result.sessionId, validUntil: result.validUntil});
        };
        try { return await Promise.race([work(), timeout]); }
        catch { return respond(503, {error: 'temporarily_unavailable'}); }
        finally { clearTimeout(timer); request.signal.removeEventListener('abort', onAbort); }
    };
}

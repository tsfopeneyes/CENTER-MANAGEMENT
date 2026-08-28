// QR scans can hand an installed web app over to Samsung Internet mid-request.
// Plain fetch avoids the Supabase client's internally aborted signal in that window.
export const requestSupabaseRest = async (path, options = {}, attempts = 2, timeoutMs = 8000) => {
    let lastError;
    const method = (options.method || 'GET').toUpperCase();
    // Retrying a write after an aborted response can create a second row even
    // when the first request was committed successfully. Writes are reconciled
    // by the visit lifecycle instead of being sent a second time.
    const allowedAttempts = ['GET', 'HEAD'].includes(method) ? attempts : 1;

    for (let attempt = 0; attempt < allowedAttempts; attempt += 1) {
        let timeoutId;
        try {
            const controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${path}`,
                {
                    ...options,
                    headers: {
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                        ...(options.headers || {})
                    },
                    signal: controller.signal
                }
            );

            if (!response.ok) {
                throw new Error(`요청을 처리하지 못했습니다. (${response.status})`);
            }

            // POST/DELETE requests without `Prefer: return=representation` can
            // succeed with an empty 201/200 response body. Treat that as a
            // completed request instead of trying to parse it as JSON.
            if (response.status === 204) return null;
            const body = await response.text();
            return body ? JSON.parse(body) : null;
        } catch (error) {
            lastError = error;
            if (error?.name !== 'AbortError' || attempt === allowedAttempts - 1) break;
            await new Promise(resolve => window.setTimeout(resolve, 350));
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
        }
    }

    throw lastError;
};

// Edge Function calls use the same resilient path as QR writes. This avoids
// browser-client aborts while a mobile/PWA view is changing focus.
export const requestSupabaseFunction = async (functionName, body, attempts = 2, timeoutMs = 8000) => {
    let lastError;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        let timeoutId;
        try {
            const controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
                {
                    method: 'POST',
                    headers: {
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                }
            );

            const responseBody = await response.text();
            const result = responseBody ? JSON.parse(responseBody) : null;
            if (!response.ok) throw new Error(result?.error || `요청을 처리하지 못했습니다. (${response.status})`);
            return result;
        } catch (error) {
            lastError = error;
            if (error?.name !== 'AbortError' || attempt === attempts - 1) break;
            await new Promise(resolve => window.setTimeout(resolve, 350));
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
        }
    }

    throw lastError;
};

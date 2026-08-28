import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, unknown>;

const getSecret = (name: string) => Deno.env.get(name)?.trim() || "";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const jsonResponse = (body: JsonRecord, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const isUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isLocationId = (value: unknown): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const getSigningSecret = () => getSecret("KIOSK_QR_SIGNING_SECRET") || getSecret("SUPABASE_SERVICE_ROLE_KEY");

const signPayload = async (payload: JsonRecord) => {
  const secret = getSigningSecret();
  if (!secret) throw new Error("QR signing is not configured.");
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
};

const verifyToken = async (token: unknown, expectedKind: "qr" | "presence") => {
  if (typeof token !== "string") throw new Error("QR_TOKEN_MISSING");
  if (token.length > 4096) throw new Error("QR_TOKEN_INVALID");
  const [payloadPart, signaturePart, ...extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra.length) throw new Error("QR_TOKEN_INVALID");

  const expectedToken = await signPayload(JSON.parse(decoder.decode(base64UrlDecode(payloadPart))) as JsonRecord);
  const expectedSignature = expectedToken.split(".")[1];
  if (!timingSafeEqual(signaturePart, expectedSignature)) throw new Error("QR_TOKEN_INVALID");

  const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadPart))) as JsonRecord;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.kind !== expectedKind || typeof payload.exp !== "number" || payload.exp < nowSeconds) {
    throw new Error("QR_TOKEN_EXPIRED");
  }
  if (!isLocationId(payload.locationId) || !isUuid(payload.deviceId)) throw new Error("QR_TOKEN_INVALID");
  return payload as JsonRecord & { locationId: string; deviceId: string; exp: number };
};

const serviceFetch = async (path: string, options: RequestInit = {}) => {
  const supabaseUrl = getSecret("SUPABASE_URL");
  const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service access is not configured.");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.headers || {}),
    },
  });
};

const requireHaifnLocation = async (locationId: string) => {
  const locationResponse = await serviceFetch(
    `locations?id=eq.${encodeURIComponent(locationId)}&select=id,name,group_id&limit=1`,
  );
  if (!locationResponse.ok) throw new Error("Unable to verify the kiosk location.");
  const [location] = await locationResponse.json() as Array<{ id: string; name?: string; group_id?: string }>;
  if (!location) throw new Error("KIOSK_LOCATION_NOT_FOUND");

  let groupName = "";
  if (location.group_id) {
    const groupResponse = await serviceFetch(
      `location_groups?id=eq.${encodeURIComponent(location.group_id)}&select=name&limit=1`,
    );
    if (groupResponse.ok) {
      const [group] = await groupResponse.json() as Array<{ name?: string }>;
      groupName = group?.name || "";
    }
  }
  const branchText = `${location.name || ""} ${groupName}`.toLowerCase();
  if (!branchText.includes("하이픈") && !branchText.includes("haifn") && !branchText.includes("강동")) {
    throw new Error("KIOSK_LOCATION_NOT_HAIFN");
  }
  return { id: location.id, name: location.name || "하이픈" };
};

const getHaifnRotationStatus = async () => {
  const [locationsResponse, groupsResponse, devicesResponse] = await Promise.all([
    serviceFetch("locations?select=id,name,group_id"),
    serviceFetch("location_groups?select=id,name"),
    serviceFetch("kiosk_devices?is_active=eq.true&select=location_id"),
  ]);
  if (!locationsResponse.ok || !groupsResponse.ok || !devicesResponse.ok) {
    throw new Error("Unable to read the Haifn rotation status.");
  }
  const locations = await locationsResponse.json() as Array<{ id: string; name?: string; group_id?: string }>;
  const groups = await groupsResponse.json() as Array<{ id: string; name?: string }>;
  const devices = await devicesResponse.json() as Array<{ location_id: string }>;
  const haifnGroupIds = new Set(groups
    .filter((group) => /하이픈|haifn|강동/i.test(group.name || ""))
    .map((group) => group.id));
  const haifnLocationIds = new Set(locations
    .filter((location) => /하이픈|haifn|강동/i.test(location.name || "") || haifnGroupIds.has(location.group_id || ""))
    .map((location) => location.id));
  const activeDeviceCount = devices.filter((device) => haifnLocationIds.has(device.location_id)).length;
  return { active: activeDeviceCount > 0, activeDeviceCount };
};

const requireActiveDevice = async (deviceId: string, locationId: string, deviceSecret?: string) => {
  const response = await serviceFetch(
    `kiosk_devices?id=eq.${encodeURIComponent(deviceId)}&location_id=eq.${encodeURIComponent(locationId)}&is_active=eq.true&select=id,location_id,device_secret_hash&limit=1`,
  );
  if (!response.ok) throw new Error("Unable to verify the kiosk device.");
  const [device] = await response.json() as Array<{ id: string; location_id: string; device_secret_hash: string }>;
  if (!device) throw new Error("KIOSK_DEVICE_INACTIVE");
  if (deviceSecret) {
    const suppliedHash = await sha256(deviceSecret);
    if (!timingSafeEqual(suppliedHash, device.device_secret_hash)) throw new Error("KIOSK_DEVICE_INVALID");
  }
  return device;
};

type ActivationAttempt = {
  client_fingerprint: string;
  attempt_count: number;
  window_started_at: string;
  blocked_until?: string | null;
};

const getActivationFingerprint = async (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
  return sha256(`${getSigningSecret()}:${forwarded}`);
};

const getActivationAttempt = async (clientFingerprint: string): Promise<ActivationAttempt | null> => {
  const response = await serviceFetch(
    `kiosk_activation_attempts?client_fingerprint=eq.${encodeURIComponent(clientFingerprint)}&select=*&limit=1`,
  );
  if (!response.ok) throw new Error("Unable to verify the kiosk activation rate limit.");
  const [attempt] = await response.json() as ActivationAttempt[];
  return attempt || null;
};

const ensureActivationAllowed = async (clientFingerprint: string) => {
  const attempt = await getActivationAttempt(clientFingerprint);
  if (attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > Date.now()) {
    throw new Error("KIOSK_SETUP_RATE_LIMITED");
  }
  return attempt;
};

const recordActivationFailure = async (clientFingerprint: string, current: ActivationAttempt | null) => {
  const now = new Date();
  const windowStart = current?.window_started_at ? new Date(current.window_started_at) : now;
  const isNewWindow = now.getTime() - windowStart.getTime() > 15 * 60 * 1000;
  const attemptCount = isNewWindow ? 1 : (current?.attempt_count || 0) + 1;
  const response = await serviceFetch("kiosk_activation_attempts?on_conflict=client_fingerprint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{
      client_fingerprint: clientFingerprint,
      attempt_count: attemptCount,
      window_started_at: (isNewWindow ? now : windowStart).toISOString(),
      blocked_until: attemptCount >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null,
      updated_at: now.toISOString(),
    }]),
  });
  if (!response.ok) throw new Error("Unable to update the kiosk activation rate limit.");
};

const clearActivationFailures = async (clientFingerprint: string) => {
  await serviceFetch(
    `kiosk_activation_attempts?client_fingerprint=eq.${encodeURIComponent(clientFingerprint)}`,
    { method: "DELETE" },
  );
};

const activateDevice = async (request: Request, payload: JsonRecord) => {
  const setupPin = getSecret("KIOSK_SETUP_PIN");
  if (!setupPin) throw new Error("KIOSK_SETUP_NOT_CONFIGURED");
  const clientFingerprint = await getActivationFingerprint(request);
  const activationAttempt = await ensureActivationAllowed(clientFingerprint);
  if (typeof payload.setupPin !== "string" || !timingSafeEqual(payload.setupPin, setupPin)) {
    await recordActivationFailure(clientFingerprint, activationAttempt);
    throw new Error("KIOSK_SETUP_PIN_INVALID");
  }
  if (!isLocationId(payload.locationId)) throw new Error("KIOSK_LOCATION_INVALID");
  const location = await requireHaifnLocation(payload.locationId);
  const deviceSecret = crypto.randomUUID() + crypto.randomUUID();
  const response = await serviceFetch("kiosk_devices?select=id,location_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify([{
      location_id: location.id,
      device_secret_hash: await sha256(deviceSecret),
      display_name: typeof payload.displayName === "string" ? payload.displayName.slice(0, 100) : "하이픈 키오스크",
    }]),
  });
  if (!response.ok) throw new Error("Unable to activate the kiosk device.");
  const [device] = await response.json() as Array<{ id: string }>;
  await clearActivationFailures(clientFingerprint);
  return { deviceId: device.id, deviceSecret, location };
};

const issueQr = async (payload: JsonRecord) => {
  if (!isLocationId(payload.locationId) || !isUuid(payload.deviceId) || typeof payload.deviceSecret !== "string") {
    throw new Error("KIOSK_DEVICE_INVALID");
  }
  const location = await requireHaifnLocation(payload.locationId);
  await requireActiveDevice(payload.deviceId, payload.locationId, payload.deviceSecret);
  await serviceFetch(`kiosk_devices?id=eq.${encodeURIComponent(payload.deviceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 75;
  const token = await signPayload({
    kind: "qr",
    deviceId: payload.deviceId,
    locationId: payload.locationId,
    iat: issuedAt,
    exp: expiresAt,
    nonce: crypto.randomUUID(),
  });
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString(), location };
};

const deactivateDevice = async (payload: JsonRecord) => {
  if (!isLocationId(payload.locationId) || !isUuid(payload.deviceId) || typeof payload.deviceSecret !== "string") {
    throw new Error("KIOSK_DEVICE_INVALID");
  }
  await requireActiveDevice(payload.deviceId, payload.locationId, payload.deviceSecret);
  const response = await serviceFetch(`kiosk_devices?id=eq.${encodeURIComponent(payload.deviceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: false, last_seen_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("Unable to deactivate the kiosk device.");
  return { deactivated: true };
};

const exchangeQr = async (payload: JsonRecord) => {
  const qr = await verifyToken(payload.token, "qr");
  await requireActiveDevice(qr.deviceId, qr.locationId);
  const location = await requireHaifnLocation(qr.locationId);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;
  const presenceGrant = await signPayload({
    kind: "presence",
    deviceId: qr.deviceId,
    locationId: qr.locationId,
    iat: issuedAt,
    exp: expiresAt,
    nonce: crypto.randomUUID(),
  });
  return { presenceGrant, expiresAt: new Date(expiresAt * 1000).toISOString(), location };
};

const validatePresence = async (payload: JsonRecord) => {
  const grant = await verifyToken(payload.presenceGrant, "presence");
  await requireActiveDevice(grant.deviceId, grant.locationId);
  if (payload.locationId && payload.type !== "CHECKOUT" && payload.locationId !== grant.locationId) {
    throw new Error("QR_LOCATION_MISMATCH");
  }
  return { valid: true, locationId: grant.locationId, expiresAt: new Date(grant.exp * 1000).toISOString() };
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "POST requests only" }, 405);

  try {
    const payload = await request.json() as JsonRecord;
    let result: JsonRecord;
    if (payload.action === "activate-device") result = await activateDevice(request, payload);
    else if (payload.action === "issue-qr") result = await issueQr(payload);
    else if (payload.action === "deactivate-device") result = await deactivateDevice(payload);
    else if (payload.action === "rotation-status") result = await getHaifnRotationStatus();
    else if (payload.action === "exchange-qr") result = await exchangeQr(payload);
    else if (payload.action === "validate-presence") result = await validatePresence(payload);
    else return jsonResponse({ error: "Unsupported action" }, 400);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "QR request failed";
    const isAccessError = /^(QR_|KIOSK_)/.test(message);
    return jsonResponse({ error: message }, isAccessError ? 401 : 500);
  }
});

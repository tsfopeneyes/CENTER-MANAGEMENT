import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getSecret = (name: string) => Deno.env.get(name)?.trim() || "";
const isUuid = (value: unknown) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
// Some guest profiles created by the legacy kiosk use UUID-shaped values with
// zeroed version/variant nibbles. PostgreSQL stores those in the UUID column
// normally, so accept them only where a public.users profile ID is expected.
// Supabase Auth user IDs continue to use the stricter UUID validator above.
const isProfileId = (value: unknown) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const hashPassword = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getAuthenticatedUserId = async (request: Request): Promise<string> => {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("A signed-in account is required.");
  const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = getSecret("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) throw new Error("Authentication service is not configured.");

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: serviceRoleKey },
  });
  if (!response.ok) throw new Error("Your sign-in has expired. Please sign in again.");
  const user = await response.json() as { id?: string };
  if (!isUuid(user.id)) throw new Error("Unable to verify the signed-in account.");
  return user.id;
};

const getAuthenticatedProfileId = async (request: Request): Promise<string> => {
  const authUserId = await getAuthenticatedUserId(request);
  const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = getSecret("SUPABASE_URL");
  const response = await fetch(`${supabaseUrl}/rest/v1/users?or=(id.eq.${encodeURIComponent(authUserId)},auth_user_id.eq.${encodeURIComponent(authUserId)})&select=id&limit=1`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) throw new Error("Unable to load the signed-in profile.");
  const [profile] = await response.json() as Array<{ id?: string }>;
  if (!isProfileId(profile?.id)) throw new Error("Your account is not linked to a profile yet.");
  return profile.id;
};

const requireStaffAccount = async (request: Request, staffId: string) => {
  const profileId = await getAuthenticatedProfileId(request);
  if (profileId !== staffId) throw new Error("You can only manage your own coffee chat requests.");

  const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = getSecret("SUPABASE_URL");
  const response = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(profileId)}&select=role,user_group&limit=1`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) throw new Error("Unable to verify staff permissions.");
  const [user] = await response.json() as Array<{ role?: string; user_group?: string }>;
  const isStaff = user?.role?.toLowerCase() === "admin" || user?.role?.toLowerCase() === "staff" || user?.user_group?.toLowerCase() === "staff" || user?.user_group === "관리자";
  if (!isStaff) throw new Error("Only staff can manage coffee chat requests.");
};

// An administrator can open the student-preview screen, but this is still
// verified against their real signed-in account rather than trusting the
// previewed profile stored in the browser.
const requireStudentOrStaffPreviewAccess = async (request: Request, studentId: string) => {
  const profileId = await getAuthenticatedProfileId(request);
  if (profileId === studentId) return;

  const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = getSecret("SUPABASE_URL");
  const response = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(profileId)}&select=role,user_group&limit=1`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) throw new Error("Unable to verify preview permissions.");
  const [user] = await response.json() as Array<{ role?: string; user_group?: string }>;
  const isAdmin = user?.role?.toLowerCase() === "admin" || user?.user_group === "관리자";
  if (!isAdmin) throw new Error("Only administrators can preview another student's coffee chats.");
};

const isSlackCategoryEnabled = async (category: unknown): Promise<boolean> => {
  if (typeof category !== "string" || !category.trim()) return true;
  const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = getSecret("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) return true;

  const key = `slack_${category}_notifications_enabled`;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/global_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, {
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    });
    if (!response.ok) return true;
    const rows = await response.json() as Array<{ value?: string }>;
    return rows[0]?.value !== "false";
  } catch {
    // 설정 조회 장애가 신청·알림 전체를 막지는 않도록 기존 기본값(전송)을 유지합니다.
    return true;
  }
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST requests only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await request.json();
    const { action, message, sendLine = false, lineTarget = "enough", sendDiscord = true, sendSlack = false, slackThreadTs, notificationCategory, locationName, sendGoogleSheets = false, googleSheetsPayload } = payload;

    // Legacy profiles are linked to Supabase Auth only after their existing
    // password is verified server-side. No raw password is stored or returned.
    if (action === "ensure-auth-link") {
      const { profileId, password } = payload;
      if (!isProfileId(profileId) || typeof password !== "string" || !password) throw new Error("Invalid account link request.");
      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      if (!serviceRoleKey || !supabaseUrl) throw new Error("Authentication service is not configured.");

      const profileResponse = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(profileId)}&select=id,phone,password,auth_user_id&limit=1`, {
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      });
      if (!profileResponse.ok) throw new Error("Profile could not be loaded.");
      const [profile] = await profileResponse.json() as Array<{ id: string; phone?: string; password?: string; auth_user_id?: string }>;
      const passwordHash = await hashPassword(password);
      if (!profile || (profile.password !== password && profile.password !== passwordHash)) throw new Error("Password verification failed.");

      const email = `${String(profile.phone || "").replace(/[^0-9]/g, "")}@youth-access.app`;
      if (!email || email === "@youth-access.app") throw new Error("An email or phone number is required to secure this account.");
      let authUserId = profile.auth_user_id || "";
      if (!authUserId) {
        const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: passwordHash, email_confirm: true }),
        });
        if (!createResponse.ok) throw new Error("This account could not be linked automatically.");
        const created = await createResponse.json() as { id?: string };
        if (!isUuid(created.id)) throw new Error("Authentication account creation failed.");
        authUserId = created.id;
        const linkResponse = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(profileId)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
          body: JSON.stringify({ auth_user_id: authUserId }),
        });
        if (!linkResponse.ok) throw new Error("Account link could not be saved.");
      }
      return new Response(JSON.stringify({ success: true, email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reset-student-password") {
      const { profileId, birth, phoneBack4, password } = payload;
      if (
        !isProfileId(profileId) ||
        typeof birth !== "string" || !/^\d{6}(?:\d{2})?$/.test(birth.trim()) ||
        typeof phoneBack4 !== "string" || !/^\d{4}$/.test(phoneBack4.trim()) ||
        typeof password !== "string" || password.length < 4 || password.length > 128
      ) {
        throw new Error("비밀번호 초기화 요청 정보가 올바르지 않습니다.");
      }

      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      if (!serviceRoleKey || !supabaseUrl) throw new Error("인증 서비스가 설정되지 않았습니다.");

      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(profileId)}&select=id,birth,phone,phone_back4,password,auth_user_id,role,user_group,is_master&limit=1`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
      );
      if (!profileResponse.ok) throw new Error("회원 정보를 확인하지 못했습니다.");
      const [profile] = await profileResponse.json() as Array<{
        id: string;
        birth?: string;
        phone?: string;
        phone_back4?: string;
        password?: string;
        auth_user_id?: string;
        role?: string;
        user_group?: string;
        is_master?: boolean;
      }>;
      const isAdmin = profile?.is_master === true || profile?.role === "admin" || profile?.user_group === "관리자";
      if (!profile || isAdmin) throw new Error("이 계정은 온라인 비밀번호 초기화를 사용할 수 없습니다.");

      const storedBirth = String(profile.birth || "").replace(/\D/g, "");
      const suppliedBirth = birth.trim();
      const birthMatches = storedBirth === suppliedBirth ||
        (storedBirth.length === 6 && suppliedBirth.length === 8 && suppliedBirth.slice(-6) === storedBirth);
      const storedBack4 = String(profile.phone_back4 || "") || String(profile.phone || "").replace(/\D/g, "").slice(-4);
      if (!birthMatches || storedBack4 !== phoneBack4.trim()) {
        throw new Error("생년월일 또는 휴대폰 번호 뒤 4자리가 일치하지 않습니다.");
      }

      const nextPasswordHash = await hashPassword(password);
      const previousPasswordHash = String(profile.password || "");
      const updateProfilePassword = async (passwordHash: string) => fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: passwordHash }),
        },
      );

      const profileUpdateResponse = await updateProfilePassword(nextPasswordHash);
      if (!profileUpdateResponse.ok) throw new Error("비밀번호를 저장하지 못했습니다.");

      // A linked legacy account stores its Auth ID separately. Newer accounts
      // share the profile ID, so check that ID when no explicit link exists.
      const possibleAuthUserId = profile.auth_user_id || (isUuid(profile.id) ? profile.id : "");
      if (possibleAuthUserId) {
        const authLookupResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(possibleAuthUserId)}`, {
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
        });
        if (authLookupResponse.ok) {
          const authUpdateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(possibleAuthUserId)}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ password: nextPasswordHash }),
          });
          if (!authUpdateResponse.ok) {
            // Keep the application profile and Auth account consistent when
            // the second half of the update cannot be completed.
            if (previousPasswordHash) await updateProfilePassword(previousPasswordHash);
            throw new Error("로그인 비밀번호 동기화를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
          }
        } else if (authLookupResponse.status !== 404) {
          if (previousPasswordHash) await updateProfilePassword(previousPasswordHash);
          throw new Error("로그인 계정 상태를 확인하지 못했습니다.");
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Coffee-chat requests are created here because regular student sessions
    // are not Supabase Auth sessions and are therefore blocked by table RLS.
    // Keep the privileged write narrowly scoped and validate every value first.
    if (action === "create-coffee-chat") {
      const { studentId, staffId, topics, coffeeChatMessage } = payload;
      if (!isUuid(studentId) || !isUuid(staffId)) throw new Error("Invalid coffee chat participant.");
      if (await getAuthenticatedProfileId(request) !== studentId) throw new Error("You can only create coffee chats for your own account.");
      if (!Array.isArray(topics) || topics.length < 1 || topics.length > 5 || topics.some((topic) => typeof topic !== "string" || !topic.trim() || topic.length > 30)) {
        throw new Error("Invalid coffee chat topics.");
      }
      if (coffeeChatMessage !== undefined && coffeeChatMessage !== null && (typeof coffeeChatMessage !== "string" || coffeeChatMessage.length > 1_000)) {
        throw new Error("Invalid coffee chat message.");
      }

      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      if (!serviceRoleKey || !supabaseUrl) throw new Error("Coffee chat service is not configured.");

      const response = await fetch(`${supabaseUrl}/rest/v1/coffee_chats`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          student_id: studentId,
          staff_id: staffId,
          topics: topics.map((topic) => topic.trim()),
          message: typeof coffeeChatMessage === "string" && coffeeChatMessage.trim() ? coffeeChatMessage.trim() : null,
          status: "PENDING",
        }),
      });
      if (!response.ok) throw new Error(`Coffee chat could not be saved. (${response.status})`);
      const [coffeeChat] = await response.json();

      // Do not rely only on the coffee_chats Realtime publication here. If a
      // staff member is already signed in while its subscription is offline,
      // the request used to be invisible until a manual refresh (and could be
      // missed altogether). A personal in-app notification gives the request
      // a durable delivery path as well as a browser notification when the
      // app_notifications listener is connected.
      let notificationCreated = false;
      try {
        const studentResponse = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(studentId)}&select=name&limit=1`, {
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
        });
        const students = studentResponse.ok ? await studentResponse.json() as Array<{ name?: string }> : [];
        const studentName = students[0]?.name?.trim() || "학생";
        const topicText = topics.map((topic) => topic.trim()).join(", ");
        const messageText = typeof coffeeChatMessage === "string" && coffeeChatMessage.trim()
          ? `\n메시지: ${coffeeChatMessage.trim()}`
          : "";

        const notificationResponse = await fetch(`${supabaseUrl}/rest/v1/app_notifications`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            target_group: `USER_${staffId}`,
            content: `☕ ${studentName}님이 커피챗을 신청했어요.\n주제: ${topicText}${messageText}`,
            notification_type: "PERSONAL",
          }),
        });
        notificationCreated = notificationResponse.ok;
        if (!notificationCreated) console.error("Coffee chat in-app notification could not be saved.", await notificationResponse.text());
      } catch (notificationError) {
        // The request itself has been saved, so preserve it even if its
        // secondary notification channel is temporarily unavailable.
        console.error("Coffee chat in-app notification failed.", notificationError);
      }

      return new Response(JSON.stringify({ success: true, coffeeChat, notificationCreated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Student dashboard fallback: coffee_chats is protected by RLS for some
    // legacy student sessions. Let the dashboard retrieve only the latest
    // request for the supplied student, rather than silently showing no card.
    if (action === "get-coffee-chat-status") {
      const { studentId } = payload;
      if (!isUuid(studentId)) throw new Error("Invalid coffee chat participant.");
      await requireStudentOrStaffPreviewAccess(request, studentId);

      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      if (!serviceRoleKey || !supabaseUrl) throw new Error("Coffee chat service is not configured.");

      const response = await fetch(
        `${supabaseUrl}/rest/v1/coffee_chats?student_id=eq.${encodeURIComponent(studentId)}&select=*&order=created_at.desc&limit=1`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
      );
      if (!response.ok) throw new Error(`Coffee chat status could not be loaded. (${response.status})`);
      const coffeeChats = await response.json();
      const studentIds = [...new Set(coffeeChats.map((chat: { student_id?: string }) => chat.student_id).filter(isUuid))];
      const namesByStudentId = new Map<string, string>();
      if (studentIds.length > 0) {
        const studentsResponse = await fetch(
          `${supabaseUrl}/rest/v1/users?id=in.(${studentIds.map(encodeURIComponent).join(",")})&select=id,name,school,birth`,
          { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
        );
        if (studentsResponse.ok) {
          const students = await studentsResponse.json() as Array<{ id?: string; name?: string; school?: string; birth?: string }>;
          students.forEach((student) => {
            if (student.id && student.name) namesByStudentId.set(student.id, student.name);
          });
        }
      }
      const pendingCoffeeChats = coffeeChats.map((chat: { student_id?: string }) => ({
        ...chat,
        student_name: chat.student_id ? namesByStudentId.get(chat.student_id) || "학생" : "학생",
      }));
      return new Response(JSON.stringify({ success: true, coffeeChat: pendingCoffeeChats[0] || null, coffeeChats: pendingCoffeeChats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Staff dashboard fallback for the same legacy RLS restriction. This is
    // what powers the visible "신청 확인" entry and the accept/reject modal.
    if (action === "get-pending-coffee-chat") {
      const { staffId } = payload;
      if (!isUuid(staffId)) throw new Error("Invalid coffee chat participant.");
      await requireStaffAccount(request, staffId);

      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      if (!serviceRoleKey || !supabaseUrl) throw new Error("Coffee chat service is not configured.");

      const response = await fetch(
        `${supabaseUrl}/rest/v1/coffee_chats?staff_id=eq.${encodeURIComponent(staffId)}&status=eq.PENDING&select=*&order=created_at.desc`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
      );
      if (!response.ok) throw new Error(`Pending coffee chat could not be loaded. (${response.status})`);
      const coffeeChats = await response.json();
      const studentIds = [...new Set(coffeeChats.map((chat: { student_id?: string }) => chat.student_id).filter(isUuid))];
      const profilesByStudentId = new Map<string, { name?: string; school?: string; birth?: string }>();
      if (studentIds.length > 0) {
        const studentsResponse = await fetch(
          `${supabaseUrl}/rest/v1/users?id=in.(${studentIds.map(encodeURIComponent).join(",")})&select=id,name,school,birth`,
          { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
        );
        if (studentsResponse.ok) {
          const students = await studentsResponse.json() as Array<{ id?: string; name?: string; school?: string; birth?: string }>;
          students.forEach((student) => {
            if (student.id) profilesByStudentId.set(student.id, student);
          });
        }
      }
      const pendingCoffeeChats = coffeeChats.map((chat: { student_id?: string }) => ({
        ...chat,
        student_name: chat.student_id ? profilesByStudentId.get(chat.student_id)?.name || "학생" : "학생",
        student_school: chat.student_id ? profilesByStudentId.get(chat.student_id)?.school || "" : "",
        student_birth: chat.student_id ? profilesByStudentId.get(chat.student_id)?.birth || "" : "",
      }));
      return new Response(JSON.stringify({ success: true, coffeeChat: pendingCoffeeChats[0] || null, coffeeChats: pendingCoffeeChats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-active-coffee-chat") {
      const { staffId } = payload;
      if (!isUuid(staffId)) throw new Error("Invalid staff account.");
      await requireStaffAccount(request, staffId);
      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      const now = new Date().toISOString();
      const response = await fetch(
        `${supabaseUrl}/rest/v1/coffee_chats?staff_id=eq.${encodeURIComponent(staffId)}&status=eq.ACCEPTED&ends_at=gt.${encodeURIComponent(now)}&select=*&order=ends_at.desc&limit=1`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
      );
      if (!response.ok) throw new Error(`Active coffee chat could not be loaded. (${response.status})`);
      const [coffeeChat] = await response.json() as Array<{ student_id?: string }>;
      let studentName = "학생";
      let studentGroup: string | undefined;
      if (coffeeChat?.student_id && isUuid(coffeeChat.student_id)) {
        const studentResponse = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(coffeeChat.student_id)}&select=name,user_group&limit=1`, {
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
        });
        if (studentResponse.ok) {
          const [student] = await studentResponse.json() as Array<{ name?: string; user_group?: string }>;
          studentName = student?.name || studentName;
          studentGroup = student?.user_group;
        }
      }
      return new Response(JSON.stringify({
        success: true,
        coffeeChat: coffeeChat ? { ...coffeeChat, student_name: studentName, student_group: studentGroup } : null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update-active-coffee-chat") {
      const { coffeeChatId, operation } = payload;
      if (!isUuid(coffeeChatId) || !["END", "EXTEND"].includes(operation)) throw new Error("Invalid coffee chat update.");
      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      const currentResponse = await fetch(`${supabaseUrl}/rest/v1/coffee_chats?id=eq.${encodeURIComponent(coffeeChatId)}&select=staff_id,ends_at&limit=1`, {
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      });
      if (!currentResponse.ok) throw new Error("Coffee chat could not be loaded.");
      const [currentCoffeeChat] = await currentResponse.json() as Array<{ staff_id?: string; ends_at?: string }>;
      if (!isUuid(currentCoffeeChat?.staff_id)) throw new Error("Coffee chat was not found.");
      await requireStaffAccount(request, currentCoffeeChat.staff_id);
      const now = Date.now();
      const currentEnd = new Date(currentCoffeeChat.ends_at || 0).getTime();
      const endsAt = operation === "END"
        ? new Date(now - 1000).toISOString()
        : new Date(Math.max(currentEnd, now) + 30 * 60 * 1000).toISOString();
      const response = await fetch(`${supabaseUrl}/rest/v1/coffee_chats?id=eq.${encodeURIComponent(coffeeChatId)}&status=eq.ACCEPTED`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ ends_at: endsAt }),
      });
      if (!response.ok) throw new Error(`Coffee chat could not be updated. (${response.status})`);
      const [coffeeChat] = await response.json();
      if (!coffeeChat) throw new Error("This coffee chat is no longer active.");
      return new Response(JSON.stringify({ success: true, coffeeChat }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-coffee-chat-status") {
      const { coffeeChatId, status, rejectionReason, acceptanceMessage } = payload;
      if (!isUuid(coffeeChatId) || !["ACCEPTED", "REJECTED"].includes(status)) {
        throw new Error("Invalid coffee chat status update.");
      }
      if (status === "REJECTED" && (typeof rejectionReason !== "string" || !rejectionReason.trim() || rejectionReason.length > 1_000)) {
        throw new Error("A rejection reason is required.");
      }
      if (status === "ACCEPTED" && (typeof acceptanceMessage !== "string" || !acceptanceMessage.trim() || acceptanceMessage.length > 1_000)) {
        throw new Error("An acceptance message is required.");
      }

      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      if (!serviceRoleKey || !supabaseUrl) throw new Error("Coffee chat service is not configured.");

      const currentResponse = await fetch(`${supabaseUrl}/rest/v1/coffee_chats?id=eq.${encodeURIComponent(coffeeChatId)}&select=staff_id&limit=1`, {
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      });
      if (!currentResponse.ok) throw new Error("Coffee chat could not be loaded.");
      const [currentCoffeeChat] = await currentResponse.json() as Array<{ staff_id?: string }>;
      if (!isUuid(currentCoffeeChat?.staff_id)) throw new Error("Coffee chat was not found.");
      await requireStaffAccount(request, currentCoffeeChat.staff_id);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/coffee_chats?id=eq.${encodeURIComponent(coffeeChatId)}&status=eq.PENDING`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(status === "ACCEPTED"
            ? (() => {
              const acceptedAt = new Date();
              return { status, accepted_at: acceptedAt.toISOString(), ends_at: new Date(acceptedAt.getTime() + 30 * 60 * 1000).toISOString(), accepted_message: acceptanceMessage.trim() };
            })()
            : { status, rejection_reason: rejectionReason.trim() }),
        },
      );
      if (!response.ok) throw new Error(`Coffee chat status could not be updated. (${response.status})`);
      const [coffeeChat] = await response.json();
      if (!coffeeChat) throw new Error("This coffee chat is no longer pending.");
      return new Response(JSON.stringify({ success: true, coffeeChat }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The home screen shows only whether a displayed staff member is currently
    // unavailable. It never returns the student or any conversation details.
    if (action === "get-busy-coffee-chat-staff") {
      const { staffIds } = payload;
      if (!Array.isArray(staffIds) || staffIds.length > 100 || staffIds.some((id) => !isUuid(id))) {
        throw new Error("Invalid staff list.");
      }
      if (staffIds.length === 0) {
        return new Response(JSON.stringify({ success: true, staffIds: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY");
      const supabaseUrl = getSecret("SUPABASE_URL");
      const now = new Date().toISOString();
      const response = await fetch(
        `${supabaseUrl}/rest/v1/coffee_chats?staff_id=in.(${staffIds.map(encodeURIComponent).join(",")})&status=eq.ACCEPTED&ends_at=gt.${encodeURIComponent(now)}&select=staff_id`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
      );
      if (!response.ok) throw new Error(`Busy staff status could not be loaded. (${response.status})`);
      const busyChats = await response.json() as Array<{ staff_id?: string }>;
      const busyStaffIds = [...new Set(busyChats.map((chat) => chat.staff_id).filter(isUuid))];
      return new Response(JSON.stringify({ success: true, staffIds: busyStaffIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action !== "notify" || typeof message !== "string" || !message.trim()) throw new Error("A notification message is required.");
    if (message.length > 4_000) throw new Error("Notification message is too long.");

    const results: Record<string, string> = {};
    const jobs: Promise<void>[] = [];

    if (sendDiscord) {
      const url = getSecret("DISCORD_WEBHOOK_URL");
      if (url) jobs.push(fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: message }) }).then((response) => {
        if (!response.ok) throw new Error(`Discord returned ${response.status}`);
        results.discord = "sent";
      })); else results.discord = "not configured";
    }

    if (sendLine) {
      const url = getSecret(lineTarget === "haifn" ? "LINE_HAIFN_PROXY_URL" : "LINE_ENOUGH_PROXY_URL");
      if (url) jobs.push(fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }).then((response) => {
        if (!response.ok) throw new Error(`LINE proxy returned ${response.status}`);
        results.line = "sent";
      })); else results.line = "not configured";
    }

    const visitLocationText = `${typeof locationName === "string" ? locationName : ""} ${message}`;
    const isEnoughPlaceAlert = /이높플레이스|이높|ENOUGH[_\s-]?PLACE|강서/i.test(visitLocationText);
    const isVisitAlert = /^\[(?:GUEST )?CHECK-(?:IN|OUT)\]/m.test(message);
    const isHaifnAlert = /하이픈|HAIFN|강동/i.test(visitLocationText);

    // Slack can be called by older cached kiosk/mobile clients that do not send
    // notificationCategory or locationName. The final guard must therefore use
    // the actual message too, rather than trusting client-provided metadata.
    // Any 이높플레이스 alert is blocked globally; visit alerts also require an
    // explicit 하이픈 location.
    const blockedVisitSlack = isEnoughPlaceAlert || (isVisitAlert && !isHaifnAlert);
    const slackCategoryEnabled = await isSlackCategoryEnabled(notificationCategory);

    if (sendSlack && !blockedVisitSlack && slackCategoryEnabled) {
      const token = getSecret("SLACK_BOT_TOKEN");
      const channel = getSecret("SLACK_ALERT_CHANNEL_ID");
      if (token && channel) {
        jobs.push(fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ channel, text: message, ...(typeof slackThreadTs === "string" && slackThreadTs ? { thread_ts: slackThreadTs } : {}) }),
        }).then(async (response) => {
          const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
          if (!response.ok || !payload?.ok) throw new Error(`Slack returned ${payload?.error || response.status}`);
          results.slack = "sent";
          if (typeof (payload as { ts?: string }).ts === "string") results.slackThreadTs = (payload as { ts: string }).ts;
        }));
      } else {
        results.slack = "not configured";
      }
    } else if (sendSlack && blockedVisitSlack) {
      results.slack = "skipped for non-haifn visit";
    } else if (sendSlack && !slackCategoryEnabled) {
      results.slack = "disabled by admin setting";
    }

    if (sendGoogleSheets) {
      const url = getSecret("GOOGLE_SHEETS_WEBHOOK_URL");
      if (url && googleSheetsPayload) jobs.push(fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(googleSheetsPayload) }).then((response) => {
        if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
        results.googleSheets = "sent";
      })); else results.googleSheets = "not configured";
    }

    await Promise.all(jobs);
    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Notification failed" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

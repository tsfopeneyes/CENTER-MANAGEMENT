import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getSecret = (name: string) => Deno.env.get(name)?.trim() || "";
const isUuid = (value: unknown) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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

    // Coffee-chat requests are created here because regular student sessions
    // are not Supabase Auth sessions and are therefore blocked by table RLS.
    // Keep the privileged write narrowly scoped and validate every value first.
    if (action === "create-coffee-chat") {
      const { studentId, staffId, topics, coffeeChatMessage } = payload;
      if (!isUuid(studentId) || !isUuid(staffId)) throw new Error("Invalid coffee chat participant.");
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
      return new Response(JSON.stringify({ success: true, coffeeChat }), {
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  ChevronDown,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../../supabaseClient";
import AdminPageHeader from "../common/AdminPageHeader";
const TARGETS = [
  ["ALL", "전체"],
  ["REGION_GANGDONG", "하이픈"],
  ["REGION_GANGSEO", "이높플레이스"],
  ["SCHOOL", "특정 학교"],
  ["USERS", "특정 이용자"],
];
const LINKS = [
  ["HOME", "웹앱 홈"],
  ["NONE", "연결 없음"],
  ["NOTICE", "공지사항"],
  ["PROGRAM", "프로그램"],
];
const isStaffUser = (user) => {
  const role = String(user?.role || "").toLowerCase(),
    group = String(user?.user_group || "").toLowerCase();
  return (
    ["admin", "staff"].includes(role) ||
    group === "staff" ||
    user?.user_group === "관리자"
  );
};
const normalizeSearch = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
export default function AdminPushNotifications() {
  const [form, setForm] = useState({
    title: "",
    body: "",
    target: "ALL",
    school: "",
    userIds: [],
    linkType: "HOME",
    noticeId: "",
  });
  const [notices, setNotices] = useState([]),
    [users, setUsers] = useState([]),
    [schools, setSchools] = useState([]),
    [history, setHistory] = useState([]),
    [search, setSearch] = useState(""),
    [sending, setSending] = useState(false),
    [loading, setLoading] = useState(true),
    [deletingId, setDeletingId] = useState("");
  const load = useCallback(async (options = {}) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    const loadAllUsers = async () => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const result = await supabase
          .from("users")
          .select("id,name,school,role,user_group")
          .order("name")
          .range(from, from + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data || []));
        if (!result.data || result.data.length < 1000) break;
      }
      return rows;
    };
    try {
      const [n, u, s] = await Promise.all([
        supabase
          .from("notices")
          .select("id,title,category,created_at")
          .in("category", ["NOTICE", "PROGRAM"])
          .order("created_at", { ascending: false })
          .limit(150),
        loadAllUsers(),
        supabase.from("schools").select("id,name,region").order("name"),
      ]);
      if (n.error) console.error(n.error);
      setNotices(n.data || []);
      setUsers(u);
      setSchools(s.data || []);
      const h = await supabase.functions.invoke("send-push", {
        body: { action: "list-dispatches" },
      });
      if (h.error) console.error("Failed to load push history:", h.error);
      else setHistory(h.data?.dispatches || []);
    } catch (error) {
      console.error("Failed to load notification targets:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const refreshReceipts = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    const intervalId = window.setInterval(refreshReceipts, 10000);
    window.addEventListener("focus", refreshReceipts);
    document.addEventListener("visibilitychange", refreshReceipts);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshReceipts);
      document.removeEventListener("visibilitychange", refreshReceipts);
    };
  }, [load]);
  const linked = useMemo(
    () =>
      notices.filter((n) =>
        form.linkType === "NOTICE"
          ? n.category === "NOTICE"
          : form.linkType === "PROGRAM"
            ? n.category === "PROGRAM"
            : false,
      ),
    [notices, form.linkType],
  );
  const foundUsers = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return [];
    return users.filter((u) => {
      const searchable = normalizeSearch(
        `${u.name || ""} ${u.school || ""} ${u.role || ""} ${u.user_group || ""} ${isStaffUser(u) ? "스탭 스태프 staff 직원 선생님 관리자" : ""}`,
      );
      return searchable.includes(q);
    });
  }, [users, search]);
  const targetLabel =
    form.target === "SCHOOL"
      ? form.school || "학교 미선택"
      : form.target === "USERS"
        ? `${form.userIds.length}명 선택`
        : TARGETS.find((x) => x[0] === form.target)?.[1];
  const toggleUser = (id) =>
    setForm((current) => ({
      ...current,
      userIds: current.userIds.includes(id)
        ? current.userIds.filter((x) => x !== id)
        : [...current.userIds, id],
    }));
  const deleteHistory = async (item) => {
    if (
      !confirm(
        "이 발송 내역을 삭제할까요?\n이용자의 소식함에서도 함께 사라집니다.",
      )
    )
      return;
    setDeletingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: { action: "delete-dispatch", dispatchId: item.id },
      });
      if (error) throw error;
      if (!data?.success || !data?.deletedCount)
        throw new Error(data?.error || "삭제된 내역이 없습니다.");
      await load();
    } catch (error) {
      alert(`발송 내역을 삭제하지 못했습니다.\n${error.message || ""}`);
    } finally {
      setDeletingId("");
    }
  };
  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim())
      return alert("알림 제목과 내용을 입력해주세요.");
    if (form.target === "SCHOOL" && !form.school)
      return alert("학교를 선택해주세요.");
    if (form.target === "USERS" && !form.userIds.length)
      return alert("이용자를 한 명 이상 선택해주세요.");
    if (["NOTICE", "PROGRAM"].includes(form.linkType) && !form.noticeId)
      return alert("연결할 게시글을 선택해주세요.");
    const targetRegions =
      form.target === "REGION_GANGDONG"
        ? ["강동"]
        : form.target === "REGION_GANGSEO"
          ? ["강서"]
          : [];
    const notice = notices.find((n) => String(n.id) === String(form.noticeId));
    const url =
      form.linkType === "HOME"
        ? "/"
        : form.linkType === "NONE"
          ? ""
          : notice
            ? `/?noticeId=${notice.id}`
            : "/";
    if (
      !confirm(
        `${targetLabel}에게 알림을 보낼까요?\n\n${form.title}\n${form.body}`,
      )
    )
      return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: {
          title: form.title.trim(),
          body: form.body.trim(),
          targetKind: form.target,
          targetRegions,
          schoolName: form.school,
          userIds: form.userIds,
          url,
          manual: true,
        },
      });
      if (error) throw error;
      const targetCount = Number(data?.targetCount || 0);
      const successCount = Number(data?.successCount || 0);
      const failureCount = Number(data?.failureCount || 0);
      const failureReason =
        Array.isArray(data?.failureReasons) && data.failureReasons.length
          ? `\n원인: ${data.failureReasons.join(", ")}`
          : "";
      if (!data?.success || targetCount === 0)
        throw new Error(
          data?.message === "No valid tokens found"
            ? "선택한 이용자에게 연결된 알림 기기가 없습니다. 이용자 기기에서 알림을 켠 뒤 다시 시도해주세요."
            : data?.message || "발송 대상 기기를 찾지 못했습니다.",
        );
      if (successCount === 0)
        throw new Error(
          `대상 기기 ${targetCount}대 모두 전송에 실패했습니다.${failureReason}`,
        );
      alert(
        `알림을 보냈습니다.\n대상 기기 ${targetCount}대 · 성공 ${successCount}대${failureCount ? ` · 실패 ${failureCount}대${failureReason}` : ""}`,
      );
      setForm((current) => ({ ...current, title: "", body: "" }));
      await load();
    } catch (error) {
      alert(`알림을 보내지 못했습니다.\n${error.message || ""}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminPageHeader
        title="알림 보내기"
        subtitle="게시글 작성 없이 이용자에게 웹 푸시와 소식함 알림을 보냅니다."
        icon={<BellRing />}
      />
      <div className="space-y-6">
        <form
          onSubmit={send}
          className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:p-8"
        >
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <label className="block text-sm font-bold text-gray-800">
                알림 제목
                <input
                  value={form.title}
                  maxLength={50}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 outline-none focus:border-blue-500"
                  placeholder="제목을 입력하세요"
                />
              </label>
              <label className="block text-sm font-bold text-gray-800">
                알림 내용
                <textarea
                  value={form.body}
                  maxLength={80}
                  rows={5}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 outline-none focus:border-blue-500"
                  placeholder="핵심 내용을 앞부분에 간단히 입력하세요"
                />
                <span className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>기기에 따라 뒷부분이 생략될 수 있어요.</span>
                  <span>{form.body.length}/80자</span>
                </span>
              </label>
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xs font-bold text-gray-400">
                  {targetLabel} · 미리보기
                </p>
                <p className="mt-3 font-extrabold">
                  {form.title || "알림 제목"}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
                  {form.body || "보낼 알림 내용이 여기에 표시됩니다."}
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <section>
            <p className="mb-3 text-sm font-bold text-gray-800">발송 대상</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TARGETS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm({ ...form, target: v })}
                  className={`min-h-[54px] break-keep rounded-xl border px-2.5 py-3 text-[13px] font-bold leading-5 ${form.target === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {form.target === "SCHOOL" && (
              <select
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold"
              >
                <option value="">학교 선택</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                    {s.region ? ` · ${s.region}` : ""}
                  </option>
                ))}
              </select>
            )}
            {form.target === "USERS" && (
              <div className="mt-3 rounded-2xl border border-gray-200 p-3">
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3">
                  <Search size={16} className="shrink-0 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="이름, 학교 또는 스탭 검색"
                    className="min-w-0 w-full bg-transparent py-3 text-sm outline-none"
                  />
                </div>
                {form.userIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.userIds.map((id) => {
                      const u = users.find((x) => x.id === id);
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => toggleUser(id)}
                          className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"
                        >
                          {u?.name || "이용자"}
                          <X size={12} />
                        </button>
                      );
                    })}
                  </div>
                )}
                {search.trim() && foundUsers.length > 0 && (
                  <p className="mt-3 px-3 text-xs font-bold text-blue-600">
                    검색 결과 {foundUsers.length}명
                  </p>
                )}
                <div className="mt-2 max-h-56 overflow-y-auto">
                  {!search.trim() ? (
                    <p className="px-3 py-6 text-center text-sm font-medium text-gray-400">
                      이름이나 학교를 입력하면 일치하는 이용자와 스탭이
                      표시됩니다.
                    </p>
                  ) : foundUsers.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm font-medium text-gray-400">
                      검색 결과가 없습니다.
                    </p>
                  ) : (
                    foundUsers.map((u) => {
                      const isStaff = isStaffUser(u);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={form.userIds.includes(u.id)}
                            onChange={() => toggleUser(u.id)}
                            className="h-4 w-4 shrink-0"
                          />
                          <span className="min-w-0 truncate text-sm font-bold text-gray-800">
                            {u.name}
                          </span>
                          {isStaff && (
                            <span className="shrink-0 rounded-md bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-600">
                              스탭
                            </span>
                          )}
                          <span className="ml-auto min-w-0 truncate text-right text-xs text-gray-400">
                            {u.school || "학교 미등록"}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
              </section>
              <section>
            <p className="mb-3 text-sm font-bold text-gray-800">
              알림을 눌렀을 때
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LINKS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, linkType: v, noticeId: "" })
                  }
                  className={`rounded-xl border px-3 py-3 text-sm font-bold ${form.linkType === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {["NOTICE", "PROGRAM"].includes(form.linkType) && (
              <select
                value={form.noticeId}
                onChange={(e) => setForm({ ...form, noticeId: e.target.value })}
                className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold"
              >
                <option value="">연결할 게시글 선택</option>
                {linked.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            )}
              </section>
            </div>
          </div>
          <button
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white disabled:opacity-50"
          >
            <Send size={18} />
            {sending ? "보내는 중…" : "지금 보내기"}
          </button>
        </form>
        <History
          loading={loading}
          history={history}
          load={() => load()}
          onDelete={deleteHistory}
          deletingId={deletingId}
        />
      </div>
    </div>
  );
}
function History({ loading, history, load, onDelete, deletingId }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-black">최근 발송 내역</h3>
          <p className="mt-1 text-xs text-gray-400">
            삭제하면 이용자의 소식함에서도 사라집니다.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl bg-gray-50 p-2.5 text-gray-500"
          aria-label="새로고침"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {loading ? (
        <p className="py-12 text-center text-sm text-gray-400">불러오는 중…</p>
      ) : history.length ? (
        <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
          {history.map((item) => {
            const expanded = expandedId === item.id;
            const successCount = (item.attempts || []).filter(
              (attempt) => attempt.accepted,
            ).length;
            const failureCount = (item.attempts || []).length - successCount;
            const displayedCount = (item.attempts || []).filter(
              (attempt) => attempt.displayedAt,
            ).length;
            const clickedCount = (item.attempts || []).filter(
              (attempt) => attempt.clickedAt,
            ).length;
            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50"
              >
                <div className="flex items-center px-3 py-2 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                    aria-expanded={expanded}
                  >
                    <span className="min-w-0 flex-1 truncate font-extrabold text-gray-900">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-gray-400">
                      {new Date(item.created_at).toLocaleDateString("ko-KR")}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === item.id}
                    onClick={() => onDelete(item)}
                    className="ml-1 shrink-0 rounded-xl p-2.5 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    aria-label={`${item.title} 발송 내역 삭제`}
                    title="발송 내역 삭제"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {expanded && (
                  <div className="border-t border-gray-200 bg-white px-5 py-5">
                    <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">
                      {item.body}
                    </p>
                    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs font-bold text-gray-400">
                          발송 대상
                        </dt>
                        <dd className="mt-1 font-bold text-gray-800">
                          {item.target_label}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-gray-400">
                          전송 시각
                        </dt>
                        <dd className="mt-1 font-bold text-gray-800">
                          {new Date(item.created_at).toLocaleString("ko-KR")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-gray-400">
                          수신 상태
                        </dt>
                        <dd className="mt-1 font-bold text-gray-800">
                          {item.attempts?.length
                            ? `서버 접수 ${successCount}대 · 기기 표시 ${displayedCount}대 · 클릭 ${clickedCount}대${failureCount ? ` · 실패 ${failureCount}대` : ""}`
                            : "기기별 수신 기록 없음"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5">
                      <p className="text-xs font-bold text-gray-400">수신자</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(item.recipients || []).map((recipient) => (
                          <span
                            key={recipient.id}
                            className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"
                          >
                            {recipient.name}
                            {recipient.school ? ` · ${recipient.school}` : ""}
                          </span>
                        ))}
                        {!item.recipients?.length && (
                          <span className="text-sm text-gray-400">
                            수신자 정보 없음
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-gray-400">
          직접 발송한 알림이 없습니다.
        </p>
      )}
    </section>
  );
}

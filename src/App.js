import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  updateDoc,
  doc,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import {
  QrCode,
  Scan,
  LogOut,
  User,
  MapPin,
  Settings,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Link,
  Save,
  Loader2,
  ExternalLink,
  ArrowRightCircle,
  Clock,
  Lock,
  UserPlus,
  AlertTriangle,
  KeyRound,
  Database,
  Webhook,
  FileJson,
  ChevronRight,
  X,
  DownloadCloud,
  Search,
  ShieldCheck,
  Info,
  AlertCircle,
} from "lucide-react";

// =================================================================
// ⚠️ [필수 수정] 아래 부분을 본인의 Firebase 설정 코드로 교체하세요!
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCPiDkLkXKX69alGt317HVBhYVIMMdKTnc",
  authDomain: "center-management-63ffe.firebaseapp.com",
  projectId: "center-management-63ffe",
  storageBucket: "center-management-63ffe.firebasestorage.app",
  messagingSenderId: "634268781296",
  appId: "1:634268781296:web:7b8a07a334593395639035",
  measurementId: "G-G87S0P290J",
};
// =================================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "default-app-id"; // 고정값 사용

// --- Constants ---
const CENTER_CONFIG = {
  "강동 센터": ["2,3F 라운지", "4F 워크숍룸", "4F 회의실", "6F 멤버십"],
  "강서 센터": ["이높플레이스"],
};
const CENTER_NAMES = Object.keys(CENTER_CONFIG);
const AGE_OPTIONS = ["중1", "중2", "중3", "고1", "고2", "고3", "졸업생"];

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("landing");
  const [authMode, setAuthMode] = useState("login");

  useEffect(() => {
    const initAuth = async () => {
      // 익명 로그인 사용
      await signInAnonymously(auth);
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const renderView = () => {
    switch (view) {
      case "landing":
        return <LandingPage setView={setView} />;
      case "user-auth":
        return (
          <UserAuth
            user={user}
            setView={setView}
            authMode={authMode}
            setAuthMode={setAuthMode}
          />
        );
      case "user-dashboard":
        return <UserDashboard user={user} setView={setView} />;
      case "kiosk":
        return <KioskMode user={user} setView={setView} />;
      case "admin-login":
        return <AdminLogin setView={setView} />;
      case "admin":
        return <AdminDashboard user={user} setView={setView} />;
      default:
        return <LandingPage setView={setView} />;
    }
  };

  if (!user)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-blue-600 font-bold">
        시스템 로딩중...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      {renderView()}
    </div>
  );
}

// --- Common UI Components ---
function Modal({
  isOpen,
  title,
  message,
  type = "info",
  onConfirm,
  onCancel,
  confirmText = "확인",
  cancelText = "취소",
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden transform scale-100">
        <div
          className={`p-4 flex items-center gap-3 border-b ${
            type === "error" ? "bg-red-50" : "bg-gray-50"
          }`}
        >
          {type === "error" ? (
            <AlertCircle className="text-red-500" />
          ) : (
            <Info className="text-blue-500" />
          )}
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
        </div>
        <div className="p-6 text-gray-600 whitespace-pre-wrap">{message}</div>
        <div className="p-4 bg-gray-50 flex justify-end gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg font-bold transition ${
              type === "error"
                ? "bg-red-500 hover:bg-red-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Components ---

function LandingPage({ setView }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gradient-to-br from-blue-600 to-indigo-800 text-white">
      <div className="mb-8 p-4 bg-white/10 rounded-full">
        <QrCode size={64} />
      </div>
      <h1 className="text-4xl font-bold mb-2">CenterPass</h1>
      <p className="text-lg text-blue-100 mb-12">
        강동/강서 통합 센터 이용자 관리
      </p>

      <div className="grid gap-4 w-full max-w-md">
        <button
          onClick={() => setView("user-auth")}
          className="flex items-center justify-center gap-3 p-4 bg-white text-blue-700 rounded-xl font-bold shadow-lg hover:bg-blue-50 transition-all"
        >
          <User size={24} /> 이용자 로그인 / 가입
        </button>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setView("kiosk")}
            className="flex flex-col items-center gap-2 p-4 bg-blue-700/50 border border-blue-400/30 rounded-xl hover:bg-blue-700/70 transition-all"
          >
            <Scan size={24} />
            <span className="text-sm">키오스크 모드</span>
          </button>
          <button
            onClick={() => setView("admin-login")}
            className="flex flex-col items-center gap-2 p-4 bg-blue-700/50 border border-blue-400/30 rounded-xl hover:bg-blue-700/70 transition-all"
          >
            <ShieldCheck size={24} />
            <span className="text-sm">관리자 로그인</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminLogin({ setView }) {
  const [inputId, setInputId] = useState("");
  const [inputPw, setInputPw] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    if (inputId === "admin" && inputPw === "1234") {
      setView("admin");
    } else {
      setError("아이디 또는 비밀번호가 일치하지 않습니다.");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 items-center justify-center p-6">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm">
        <div className="text-center mb-6">
          <ShieldCheck size={48} className="mx-auto text-blue-600 mb-2" />
          <h2 className="text-2xl font-bold text-gray-800">관리자 로그인</h2>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              아이디
            </label>
            <input
              type="text"
              className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호
            </label>
            <input
              type="password"
              className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
              value={inputPw}
              onChange={(e) => setInputPw(e.target.value)}
              placeholder="1234"
            />
          </div>
          <button className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition">
            로그인
          </button>
          <button
            type="button"
            onClick={() => setView("landing")}
            className="w-full py-3 text-gray-500 hover:text-gray-700"
          >
            취소
          </button>
        </form>
      </div>
    </div>
  );
}

function UserAuth({ user, setView, authMode, setAuthMode }) {
  const [formData, setFormData] = useState({
    name: "",
    gender: "남",
    school: "",
    age: "중1",
    phone: "",
    password: "",
    homeCenter: "강동 센터",
  });
  const [loginData, setLoginData] = useState({ name: "", password: "" });
  const [findPwData, setFindPwData] = useState({ name: "", phone: "" });
  const [foundPassword, setFoundPassword] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scriptUrl, setScriptUrl] = useState("");
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "" });

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "app_settings",
        "config"
      );
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setScriptUrl(
          docSnap.data().googleScriptUrl || docSnap.data().webhookUrl || ""
        );
      }
    };
    fetchSettings();
  }, []);

  const syncSignupToSheet = async (userData) => {
    if (!scriptUrl) return;
    try {
      const payload = {
        type: "signup",
        timestamp: new Date().toLocaleString(),
        ...userData,
      };
      await fetch(scriptUrl, {
        method: "POST",
        body: JSON.stringify(payload),
        mode: "no-cors",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const usersRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "center_users"
      );
      const q = query(usersRef, where("phone", "==", formData.phone));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existingData = snapshot.docs[0].data();
        if (existingData.name === formData.name) {
          const updatedUser = {
            ...formData,
            registeredAt: existingData.registeredAt || serverTimestamp(),
            lastStatus: existingData.lastStatus || "out",
            lastLocation: existingData.lastLocation || "외부",
            uid: existingData.uid,
          };
          await setDoc(
            doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "center_users",
              snapshot.docs[0].id
            ),
            updatedUser
          );
          await syncSignupToSheet(updatedUser);
          localStorage.setItem("center_user", JSON.stringify(updatedUser));
          setModal({
            isOpen: true,
            title: "업데이트 성공",
            message: "회원 정보가 업데이트되었습니다.",
          });
          return;
        } else {
          throw new Error("이미 등록된 전화번호입니다.");
        }
      }

      if (formData.password.length !== 4)
        throw new Error("비밀번호는 4자리 숫자여야 합니다.");

      const newUser = {
        ...formData,
        registeredAt: serverTimestamp(),
        lastStatus: "out",
        lastLocation: "외부",
        uid: crypto.randomUUID(),
      };
      await addDoc(usersRef, newUser);
      await syncSignupToSheet(newUser);
      localStorage.setItem("center_user", JSON.stringify(newUser));
      setView("user-dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const usersRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "center_users"
      );
      const q = query(usersRef, where("name", "==", loginData.name.trim()));
      const snapshot = await getDocs(q);
      let foundUser = null;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (
          String(data.password).trim() === String(loginData.password).trim()
        ) {
          foundUser = { id: doc.id, ...data };
        }
      });
      if (foundUser) {
        localStorage.setItem("center_user", JSON.stringify(foundUser));
        setView("user-dashboard");
      } else {
        throw new Error("이름 또는 비밀번호가 일치하지 않습니다.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFindPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const usersRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "center_users"
      );
      const q = query(
        usersRef,
        where("name", "==", findPwData.name.trim()),
        where("phone", "==", findPwData.phone.trim())
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setFoundPassword(snapshot.docs[0].data().password);
      } else {
        throw new Error("일치하는 사용자 정보가 없습니다.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        onConfirm={() => {
          setModal({ isOpen: false });
          if (modal.title === "업데이트 성공") setView("user-dashboard");
        }}
      />
      <div className="p-4 bg-white shadow-sm flex items-center gap-2">
        <button onClick={() => setView("landing")} className="text-gray-500">
          &larr; 뒤로
        </button>
        <span className="font-bold text-lg text-blue-600">CenterPass</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="flex border-b">
            <button
              className={`flex-1 p-4 font-bold ${
                authMode === "login"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-400"
              }`}
              onClick={() => setAuthMode("login")}
            >
              로그인
            </button>
            <button
              className={`flex-1 p-4 font-bold ${
                authMode === "register"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-400"
              }`}
              onClick={() => setAuthMode("register")}
            >
              회원가입
            </button>
          </div>
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            {authMode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이름
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
                    value={loginData.name}
                    onChange={(e) =>
                      setLoginData({ ...loginData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호 (4자리)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    required
                    className="w-full p-3 border rounded-lg outline-none focus:border-blue-500"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({
                        ...loginData,
                        password: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {loading ? "확인 중..." : "QR코드 보기"}
                </button>
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("find-pw");
                      setError("");
                      setFoundPassword(null);
                    }}
                    className="text-sm text-gray-500 hover:text-blue-600 underline"
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
              </form>
            )}

            {authMode === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                {!scriptUrl && (
                  <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded-lg flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span>
                      관리자 설정에서 구글 시트 연동 URL이 설정되지 않았습니다.
                    </span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    주 이용 센터 *
                  </label>
                  <select
                    className="w-full p-2 border rounded-lg mt-1 bg-blue-50 text-blue-900 font-bold"
                    value={formData.homeCenter}
                    onChange={(e) =>
                      setFormData({ ...formData, homeCenter: e.target.value })
                    }
                  >
                    {CENTER_NAMES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    이름 *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border rounded-lg mt-1"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    비밀번호 (4자리 숫자) *
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    inputMode="numeric"
                    className="w-full p-2 border rounded-lg mt-1"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        password: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      성별 *
                    </label>
                    <select
                      className="w-full p-2 border rounded-lg mt-1"
                      value={formData.gender}
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value })
                      }
                    >
                      <option value="남">남</option>
                      <option value="여">여</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      나이 *
                    </label>
                    <select
                      required
                      className="w-full p-2 border rounded-lg mt-1"
                      value={formData.age}
                      onChange={(e) =>
                        setFormData({ ...formData, age: e.target.value })
                      }
                    >
                      {AGE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    학교/소속 *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border rounded-lg mt-1"
                    value={formData.school}
                    onChange={(e) =>
                      setFormData({ ...formData, school: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    휴대전화번호 *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="010-0000-0000"
                    className="w-full p-2 border rounded-lg mt-1"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {loading ? "가입 중..." : "가입하기"}
                </button>
              </form>
            )}

            {authMode === "find-pw" && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold text-gray-800">
                    비밀번호 찾기
                  </h3>
                  <p className="text-sm text-gray-500">
                    가입 정보를 입력해주세요.
                  </p>
                </div>
                {foundPassword ? (
                  <div className="p-6 bg-green-50 rounded-xl border border-green-100 text-center">
                    <p className="text-gray-600 text-sm mb-2">
                      회원님의 비밀번호는
                    </p>
                    <p className="text-3xl font-bold text-green-600 tracking-widest mb-2">
                      {foundPassword}
                    </p>
                    <button
                      onClick={() => {
                        setAuthMode("login");
                        setFoundPassword(null);
                      }}
                      className="mt-4 text-sm text-blue-600 underline"
                    >
                      로그인하러 가기
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleFindPassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        이름
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full p-3 border rounded-lg outline-none"
                        value={findPwData.name}
                        onChange={(e) =>
                          setFindPwData({ ...findPwData, name: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        휴대전화번호
                      </label>
                      <input
                        type="tel"
                        required
                        className="w-full p-3 border rounded-lg outline-none"
                        value={findPwData.phone}
                        onChange={(e) =>
                          setFindPwData({
                            ...findPwData,
                            phone: e.target.value,
                          })
                        }
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                    >
                      {loading ? "확인 중..." : "비밀번호 확인"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className="w-full py-3 text-gray-500 font-medium hover:text-gray-700"
                    >
                      취소
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 3. User Dashboard
function UserDashboard({ setView }) {
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    const stored = localStorage.getItem("center_user");
    if (stored) setCurrentUser(JSON.parse(stored));
    else setView("user-auth");
  }, [setView]);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col items-center justify-center p-6 text-white relative">
      <button
        onClick={() => {
          localStorage.removeItem("center_user");
          setView("landing");
        }}
        className="absolute top-6 right-6 p-2 bg-white/20 rounded-full hover:bg-white/30"
      >
        <LogOut size={20} />
      </button>
      <div className="bg-white text-gray-900 rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600 font-bold text-2xl">
          {currentUser.name[0]}
        </div>
        <h2 className="text-2xl font-bold mb-1">{currentUser.name}</h2>
        <p className="text-gray-500 mb-6">
          {currentUser.school} · {currentUser.age}
        </p>
        <div className="mt-2 text-sm bg-blue-50 text-blue-800 px-3 py-1 rounded-full">
          {currentUser.homeCenter || "강동 센터"}
        </div>
        <div className="bg-white border-4 border-gray-900 p-4 rounded-xl mb-6 mt-6">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${currentUser.uid}`}
            alt="QR Code"
            className="w-[180px] h-[180px]"
          />
        </div>
        <p className="text-center text-sm text-gray-500 bg-gray-50 p-3 rounded-lg w-full">
          입장 및 장소 이동 시<br />이 QR코드를 리더기에 스캔해주세요.
        </p>
      </div>
      <button
        onClick={() => setView("landing")}
        className="mt-8 text-blue-200 hover:text-white underline"
      >
        메인 화면으로 돌아가기
      </button>
    </div>
  );
}

// 4. Kiosk Mode
function KioskMode({ user, setView }) {
  const [mode, setMode] = useState("entry");
  const [selectedCenter, setSelectedCenter] = useState("강동 센터"); // Default
  const [locationName, setLocationName] = useState(
    CENTER_CONFIG["강동 센터"][0]
  );
  const [lastScan, setLastScan] = useState(null);
  const [simulateList, setSimulateList] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [scriptUrl, setScriptUrl] = useState("");
  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "artifacts", appId, "public", "data", "center_users")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSimulateList(
        snapshot.docs.map((d) => ({ firestoreId: d.id, ...d.data() }))
      );
    });
    const fetchSettings = async () => {
      const docRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "app_settings",
        "config"
      );
      const docSnap = await getDoc(docRef);
      if (docSnap.exists())
        setScriptUrl(
          docSnap.data().googleScriptUrl || docSnap.data().webhookUrl || ""
        );
    };
    fetchSettings();
    return () => unsubscribe();
  }, [user]);

  // Update locations when center changes
  useEffect(() => {
    setLocationName(CENTER_CONFIG[selectedCenter][0]);
  }, [selectedCenter]);

  const syncToGoogleSheet = async (data) => {
    if (!scriptUrl) return;
    try {
      const payload = {
        type: "log",
        timestamp: new Date().toLocaleString(),
        name: data.userName,
        action: data.action,
        location: data.location,
        center: data.center,
      };
      await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        mode: "no-cors",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const processScan = async (uid) => {
    const foundUser = simulateList.find((u) => u.uid === uid);
    if (!foundUser) {
      setModal({
        isOpen: true,
        title: "오류",
        message: "등록되지 않은 QR코드입니다.",
        type: "error",
      });
      return;
    }

    try {
      const userRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "center_users",
        foundUser.firestoreId
      );
      const logsRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "center_logs"
      );
      let updateData = {},
        logData = {
          userId: foundUser.uid,
          userName: foundUser.name,
          timestamp: serverTimestamp(),
          center: selectedCenter,
        };

      if (mode === "entry") {
        if (
          foundUser.lastStatus === "in" &&
          foundUser.lastLocation === locationName &&
          foundUser.lastCenter === selectedCenter
        ) {
          setLastScan({
            name: foundUser.name,
            action: "이미 이곳에 있습니다",
            time: new Date().toLocaleTimeString(),
          });
          setTimeout(() => setLastScan(null), 2000);
          return;
        }
        updateData = {
          lastStatus: "in",
          lastLocation: locationName,
          lastCenter: selectedCenter,
          lastActionTime: serverTimestamp(),
        };
        logData.action = foundUser.lastStatus === "in" ? "장소이동" : "체크인";
        logData.location = locationName;
      } else {
        if (foundUser.lastStatus === "out") {
          setLastScan({
            name: foundUser.name,
            action: "이미 퇴실 상태입니다",
            time: new Date().toLocaleTimeString(),
          });
          setTimeout(() => setLastScan(null), 2000);
          return;
        }
        updateData = {
          lastStatus: "out",
          lastLocation: "외부",
          lastCenter: selectedCenter,
          lastActionTime: serverTimestamp(),
        };
        logData.action = "체크아웃";
        logData.location = "외부";
      }

      await updateDoc(userRef, updateData);
      await addDoc(logsRef, logData);
      syncToGoogleSheet(logData);
      setLastScan({
        name: foundUser.name,
        action: logData.action,
        time: new Date().toLocaleTimeString(),
      });
      setTimeout(() => setLastScan(null), 3000);
    } catch (err) {
      console.error(err);
      setModal({
        isOpen: true,
        title: "오류",
        message: "처리 중 오류가 발생했습니다.",
        type: "error",
      });
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={() => setModal({ isOpen: false, title: "", message: "" })}
      />
      <div className="w-1/3 bg-slate-800 p-6 flex flex-col justify-between border-r border-slate-700">
        <div>
          <button
            onClick={() => setView("landing")}
            className="mb-8 text-slate-400 hover:text-white flex items-center gap-2"
          >
            &larr; 홈으로
          </button>

          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">
              센터 선택 (설치 장소)
            </label>
            <select
              className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 font-bold"
              value={selectedCenter}
              onChange={(e) => setSelectedCenter(e.target.value)}
            >
              {CENTER_NAMES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-8">
            <label className="block text-sm text-slate-400 mb-2">
              키오스크 위치
            </label>
            <select
              className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            >
              {CENTER_CONFIG[selectedCenter].map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-slate-400">모드 선택</p>
            <button
              onClick={() => setMode("entry")}
              className={`w-full p-6 rounded-xl text-left transition-all border-2 ${
                mode === "entry"
                  ? "bg-green-600 border-green-400 shadow-lg"
                  : "bg-slate-700 border-transparent hover:bg-slate-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 size={32} />
                <div>
                  <div className="text-2xl font-bold">입장 / 이동</div>
                  <div className="text-sm opacity-80">체크인 및 장소 이동</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setMode("out")}
              className={`w-full p-6 rounded-xl text-left transition-all border-2 ${
                mode === "out"
                  ? "bg-red-600 border-red-400 shadow-lg"
                  : "bg-slate-700 border-transparent hover:bg-slate-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <XCircle size={32} />
                <div>
                  <div className="text-2xl font-bold">퇴실</div>
                  <div className="text-sm opacity-80">센터 퇴실</div>
                </div>
              </div>
            </button>
          </div>
        </div>
        <div className="text-slate-500 text-sm text-center">
          현재 설정: {selectedCenter} / {locationName}
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-black relative">
        <div className="absolute top-6 right-6">
          <select
            className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm max-w-xs"
            onChange={(e) => {
              if (e.target.value) processScan(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">[시뮬레이션] 사용자 선택</option>
            {simulateList.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.name} ({u.school})
              </option>
            ))}
          </select>
        </div>
        {lastScan ? (
          <div className="animate-in fade-in zoom-in duration-300 text-center">
            <div
              className={`inline-flex items-center justify-center w-32 h-32 rounded-full mb-6 shadow-2xl ${
                lastScan.action.includes("체크아웃")
                  ? "bg-red-500"
                  : "bg-green-500"
              }`}
            >
              {lastScan.action.includes("체크아웃") ? (
                <XCircle size={64} className="text-white" />
              ) : (
                <CheckCircle2 size={64} className="text-white" />
              )}
            </div>
            <h2 className="text-5xl font-bold mb-2">{lastScan.name}님</h2>
            <p
              className={`text-3xl ${
                lastScan.action.includes("체크아웃")
                  ? "text-red-400"
                  : "text-green-400"
              }`}
            >
              {lastScan.action} 완료
            </p>
            <p className="text-slate-400 mt-2">{lastScan.time}</p>
          </div>
        ) : (
          <div className="text-center opacity-50 flex flex-col items-center">
            <div className="w-64 h-64 border-4 border-dashed border-slate-500 rounded-3xl flex items-center justify-center mb-6 relative overflow-hidden bg-slate-900">
              <Scan size={64} className="text-slate-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">QR코드를 스캔해주세요</h2>
            <button
              onClick={() => setShowScanner(!showScanner)}
              className="mt-8 px-4 py-2 bg-slate-800 rounded-full text-sm hover:bg-slate-700 transition"
            >
              {showScanner ? "카메라 끄기" : "웹캠 스캐너 켜기"}
            </button>
            {showScanner && (
              <div className="mt-4 w-[300px] h-[300px] bg-black rounded overflow-hidden relative">
                <Html5QrcodeScannerWrapper onScan={processScan} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Html5QrcodeScannerWrapper({ onScan }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const script = document.createElement("script");
    script.src =
      "[https://unpkg.com/html5-qrcode](https://unpkg.com/html5-qrcode)";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);
  }, []);
  useEffect(() => {
    if (!loaded || !window.Html5QrcodeScanner) return;
    try {
      const scanner = new window.Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scanner.render((decodedText) => {
        onScan(decodedText);
        scanner.pause(true);
        setTimeout(() => scanner.resume(), 3000);
      });
      return () => scanner.clear().catch(console.error);
    } catch (e) {
      console.error(e);
    }
  }, [loaded]);
  return loaded ? (
    <div id="reader" className="w-full h-full"></div>
  ) : (
    <div className="text-white">로딩중...</div>
  );
}

// 5. Admin Dashboard
function AdminDashboard({ user, setView }) {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState("status");
  const [filterCenter, setFilterCenter] = useState("ALL");
  const [scriptUrl, setScriptUrl] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastAutoCheckout, setLastAutoCheckout] = useState(null);
  const [modal, setModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: null,
    onCancel: null,
  });

  useEffect(() => {
    if (!user) return;
    const unsubUsers = onSnapshot(
      query(
        collection(db, "artifacts", appId, "public", "data", "center_users")
      ),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubLogs = onSnapshot(
      query(
        collection(db, "artifacts", appId, "public", "data", "center_logs"),
        orderBy("timestamp", "desc")
      ),
      (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    getDoc(
      doc(db, "artifacts", appId, "public", "data", "app_settings", "config")
    ).then(
      (s) =>
        s.exists() &&
        setScriptUrl(
          s.data().googleScriptUrl || docSnap.data().webhookUrl || ""
        )
    );
    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, [user]);

  // 22:00 Auto Checkout
  useEffect(() => {
    const timer = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 22 && now.getMinutes() === 0) {
        const today = now.toDateString();
        if (lastAutoCheckout !== today) {
          setLastAutoCheckout(today);
          const inUsers = users.filter((u) => u.lastStatus === "in");
          if (inUsers.length > 0) {
            const batch = writeBatch(db);
            const ts = serverTimestamp();
            inUsers.forEach((u) => {
              batch.update(
                doc(
                  db,
                  "artifacts",
                  appId,
                  "public",
                  "data",
                  "center_users",
                  u.id
                ),
                { lastStatus: "out", lastLocation: "외부", lastActionTime: ts }
              );
              addDoc(
                collection(
                  db,
                  "artifacts",
                  appId,
                  "public",
                  "data",
                  "center_logs"
                ),
                {
                  userId: u.uid,
                  userName: u.name,
                  action: "자동퇴실(22:00)",
                  location: "외부",
                  timestamp: ts,
                }
              );
            });
            await batch.commit();
          }
        }
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [users, lastAutoCheckout]);

  const saveSettings = async () => {
    try {
      setSaveStatus("saving");
      await setDoc(
        doc(db, "artifacts", appId, "public", "data", "app_settings", "config"),
        { googleScriptUrl: scriptUrl },
        { merge: true }
      );
      setSaveStatus("saved");
      setModal({
        isOpen: true,
        title: "저장 완료",
        message: "설정이 성공적으로 저장되었습니다.",
      });
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (e) {
      setSaveStatus("error");
      setModal({
        isOpen: true,
        title: "오류",
        message: "설정 저장 중 문제가 발생했습니다.",
        type: "error",
      });
    }
  };

  const executeImport = async () => {
    setModal({ isOpen: false });
    setImportLoading(true);
    setModal({
      isOpen: true,
      title: "복원 중",
      message:
        "구글 시트에서 데이터를 불러오고 있습니다...\n잠시만 기다려 주세요.",
    });

    try {
      const response = await fetch(scriptUrl, {
        method: "GET",
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`네트워크 오류 (${response.status})`);

      const text = await response.text();

      if (text.trim().startsWith("<")) {
        throw new Error(
          "스크립트 권한 오류입니다.\n배포 시 '액세스 권한 승인'을 '모든 사용자(Anyone)'로 설정했는지 확인하세요."
        );
      }

      let sheetUsers;
      try {
        sheetUsers = JSON.parse(text);
      } catch (e) {
        throw new Error(
          "데이터 형식이 올바르지 않습니다.\n(스크립트에서 JSON을 반환하지 않음)"
        );
      }

      if (!Array.isArray(sheetUsers) || sheetUsers.length === 0) {
        setModal({
          isOpen: true,
          title: "알림",
          message:
            '가져올 데이터가 없습니다.\n구글 시트 "Members" 탭을 확인하세요.',
        });
        setImportLoading(false);
        return;
      }

      let count = 0;
      const usersRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "center_users"
      );

      for (const u of sheetUsers) {
        const cleanPhone = String(u.phone).trim();
        if (cleanPhone) {
          // Check duplicates (simple check against current snapshot users)
          const exists = users.some(
            (existing) => existing.phone === cleanPhone
          );
          if (!exists) {
            await addDoc(usersRef, {
              name: String(u.name).trim(),
              gender: u.gender,
              age: u.age,
              school: String(u.school).trim(),
              phone: cleanPhone,
              password: String(u.password || "1234").trim(),
              homeCenter: u.homeCenter || "강동 센터",
              registeredAt: serverTimestamp(),
              lastStatus: "out",
              lastLocation: "외부",
              uid: crypto.randomUUID(),
            });
            count++;
          }
        }
      }
      setModal({
        isOpen: true,
        title: "복원 완료",
        message: `총 ${sheetUsers.length}개 데이터 중\n${count}명을 새로 복원했습니다.`,
      });
    } catch (e) {
      console.error(e);
      setModal({
        isOpen: true,
        title: "복원 실패",
        message: `원인: ${e.message}`,
        type: "error",
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportFromSheet = async () => {
    if (!scriptUrl)
      return setModal({
        isOpen: true,
        title: "알림",
        message: "먼저 스크립트 URL을 설정하고 저장해주세요.",
      });
    if (!scriptUrl.includes("/exec"))
      return setModal({
        isOpen: true,
        title: "URL 오류",
        message:
          '올바른 배포 URL이 아닙니다.\nURL 끝이 "/exec"로 끝나야 합니다.',
        type: "error",
      });

    setModal({
      isOpen: true,
      title: "데이터 복원 확인",
      message:
        "구글 시트 'Members' 탭의 정보를 불러와\n앱에 복원하시겠습니까?\n\n(주의: Apps Script가 '새 버전'으로 배포되었는지 꼭 확인하세요)",
      onConfirm: executeImport,
      onCancel: () => setModal({ isOpen: false }),
      confirmText: "복원 시작",
      cancelText: "취소",
    });
  };

  const exportToCSV = () => {
    const csv =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [
        "시간,이름,활동,위치,센터",
        ...filteredLogs.map(
          (l) =>
            `${
              l.timestamp
                ? new Date(l.timestamp.seconds * 1000).toLocaleString()
                : ""
            },${l.userName},${l.action},${l.location},${l.center || ""}`
        ),
      ].join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = "logs.csv";
    link.click();
  };

  // Filter Logic based on Center Tab
  const activeUsers = users.filter(
    (u) =>
      u.lastStatus === "in" &&
      (filterCenter === "ALL" || u.lastCenter === filterCenter)
  );
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.includes(searchTerm) ||
      u.school.includes(searchTerm) ||
      (u.phone && u.phone.includes(searchTerm));
    const matchesCenter =
      filterCenter === "ALL" || u.homeCenter === filterCenter;
    return matchesSearch && matchesCenter;
  });
  const filteredLogs = logs.filter(
    (l) => filterCenter === "ALL" || l.center === filterCenter
  );

  // Location Stats aggregation
  const locationStats = activeUsers.reduce((acc, u) => {
    acc[u.lastLocation] = (acc[u.lastLocation] || 0) + 1;
    return acc;
  }, {});

  // Determine which locations to show in dashboard
  const displayLocations =
    filterCenter === "ALL"
      ? [...CENTER_CONFIG["강동 센터"], ...CENTER_CONFIG["강서 센터"]]
      : CENTER_CONFIG[filterCenter];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={() => {
          if (modal.onConfirm) modal.onConfirm();
          else setModal({ ...modal, isOpen: false });
        }}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
      />

      <header className="bg-white shadow z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="text-blue-600" />
            <h1 className="text-xl font-bold text-gray-800">관리자 대시보드</h1>
          </div>
          <button
            onClick={() => setView("landing")}
            className="text-sm text-gray-500 hover:text-blue-600"
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Center Filter Tabs */}
        <div className="md:col-span-4 flex gap-2 mb-2">
          {["ALL", ...CENTER_NAMES].map((c) => (
            <button
              key={c}
              onClick={() => setFilterCenter(c)}
              className={`px-4 py-2 rounded-lg font-bold transition ${
                filterCenter === c
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-white text-gray-500 hover:bg-gray-100"
              }`}
            >
              {c === "ALL" ? "전체 보기" : c}
            </button>
          ))}
        </div>

        <div className="md:col-span-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="text-gray-500 text-sm mb-1">현재 입실 인원</div>
            <div className="text-3xl font-bold text-blue-600">
              {activeUsers.length}명
            </div>
          </div>
          {displayLocations.map((loc) => (
            <button
              key={loc}
              onClick={() => setSelectedLocation(loc)}
              className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-left hover:bg-blue-50 transition cursor-pointer group"
            >
              <div className="flex justify-between items-center mb-1">
                <div className="text-gray-500 text-xs truncate">{loc}</div>
                <ChevronRight
                  size={16}
                  className="text-gray-300 group-hover:text-blue-400"
                />
              </div>
              <div className="text-2xl font-bold text-gray-800">
                {locationStats[loc] || 0}명
              </div>
            </button>
          ))}
        </div>
        {selectedLocation && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-lg">{selectedLocation} 현황</h3>
                <button onClick={() => setSelectedLocation(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <ul className="space-y-2">
                  {activeUsers
                    .filter((u) => u.lastLocation === selectedLocation)
                    .map((u) => (
                      <li
                        key={u.id}
                        className="flex justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="font-bold">{u.name}</div>
                          <div className="text-xs text-gray-500">
                            {u.school}
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        <div className="md:col-span-4 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="border-b flex justify-between items-center px-6 py-4">
            <div className="flex space-x-4">
              {["status", "users", "logs", "settings"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`pb-2 font-medium transition-colors ${
                    tab === t
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-gray-400"
                  }`}
                >
                  {t === "status"
                    ? "실시간"
                    : t === "users"
                    ? "이용자"
                    : t === "logs"
                    ? "로그"
                    : "설정"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <a
                href={TARGET_SHEET_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 text-sm rounded hover:bg-green-200 transition"
              >
                <FileSpreadsheet size={16} /> 시트
              </a>
              {tab === "logs" && (
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition"
                >
                  <Save size={16} /> CSV
                </button>
              )}
            </div>
          </div>
          <div className="p-6 overflow-auto flex-1">
            {tab === "status" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeUsers.length > 0 ? (
                  activeUsers.map((u) => (
                    <div
                      key={u.id}
                      className="p-4 rounded-lg border border-green-200 bg-green-50"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-bold text-lg">{u.name}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            ({u.school})
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-200 text-green-800">
                          입실중
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin size={14} />
                        {u.lastLocation}{" "}
                        <span className="ml-1 text-xs bg-white px-1 rounded border">
                          {u.lastCenter}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-10 text-gray-500">
                    현재 입실 중인 이용자가 없습니다.
                  </div>
                )}
              </div>
            )}
            {tab === "users" && (
              <div>
                <div className="mb-4 relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-2.5 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="검색..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-gray-400 border-b text-sm">
                      <th className="py-2">이름</th>
                      <th className="py-2">소속센터</th>
                      <th className="py-2">학교</th>
                      <th className="py-2">연락처</th>
                      <th className="py-2">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="py-3 font-medium">{u.name}</td>
                        <td className="py-3">
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {u.homeCenter || "-"}
                          </span>
                        </td>
                        <td className="py-3">{u.school}</td>
                        <td className="py-3">{u.phone}</td>
                        <td className="py-3">
                          {u.lastStatus === "in" ? (
                            <span className="text-green-600 font-bold">
                              입실
                            </span>
                          ) : (
                            <span className="text-gray-400">퇴실</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "logs" && (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-400 border-b text-sm">
                    <th className="py-2">시간</th>
                    <th className="py-2">이름</th>
                    <th className="py-2">활동</th>
                    <th className="py-2">위치</th>
                    <th className="py-2">센터</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="py-3">
                        {l.timestamp
                          ? new Date(
                              l.timestamp.seconds * 1000
                            ).toLocaleString()
                          : "-"}
                      </td>
                      <td className="py-3">{l.userName}</td>
                      <td className="py-3">{l.action}</td>
                      <td className="py-3">{l.location}</td>
                      <td className="py-3 text-xs text-gray-500">
                        {l.center || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "settings" && (
              <div className="max-w-xl mx-auto">
                <h3 className="text-lg font-bold mb-4">설정</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">
                    Apps Script URL
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                  />
                </div>
                <button
                  onClick={saveSettings}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold"
                >
                  {saveStatus === "saving" ? (
                    <Loader2 className="animate-spin" />
                  ) : saveStatus === "saved" ? (
                    "저장 완료!"
                  ) : (
                    "설정 저장"
                  )}
                </button>
                <hr className="my-6" />
                <button
                  onClick={handleImportFromSheet}
                  disabled={importLoading}
                  className="w-full py-2 bg-green-600 text-white rounded font-bold flex items-center justify-center gap-2"
                >
                  {importLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <DownloadCloud />
                  )}{" "}
                  구글 시트에서 복원
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  구글 시트 'Members' 탭의 데이터를 불러옵니다. 배포 버전을 꼭
                  확인하세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

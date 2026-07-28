// firebase-messaging-sw.js
// 백그라운드 푸시 알림을 수신하기 위한 서비스 워커입니다.
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

// 관리자님: 여기에 파이어베이스 웹 콘솔에서 발급받으신 firebaseConfig 설정 내용을 그대로 붙여넣어 주세요!
// 예시: const firebaseConfig = { apiKey: "AIzaSy...", authDomain: "...", ... };
const firebaseConfig = {
  apiKey: "AIzaSyDwk6Kzplfyf6k3sTy-OqZ5NmfqQkVVFnU",
  authDomain: "sci-center-6f265.firebaseapp.com",
  projectId: "sci-center-6f265",
  storageBucket: "sci-center-6f265.firebasestorage.app",
  messagingSenderId: "598421604467",
  appId: "1:598421604467:web:2b57d2c17961e111124206",
  measurementId: "G-B5HD4MZNY2"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // FCM SDK는 payload에 notification 객체가 있으면 자동으로 알림을 노출하므로,
  // data-only 메시지일 때만 수동으로 showNotification을 호출하여 중복 팝업 방지합니다.
  if (!payload.notification) {
    const notificationTitle = payload.data?.title || "새 알림";
    const notificationOptions = {
      body: payload.data?.body || "확인 부탁드립니다.",
      icon: '/vite.svg',
      data: payload.data
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

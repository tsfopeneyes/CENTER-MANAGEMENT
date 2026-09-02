# 기존 로그인 유지 조건 및 공통 인증 기반 검증

2026-08-31. 운영 조회·데이터 수정·로그인 전환·배포 없음.

후속 구현: 실제 읽기 전용 HTTP 처리와 보호 저장소 조회를 추가해 격리 DB/HTTP에서 검증했다.
최신 서버 진행 범위와 남은 작업은 [auth-session-server-progress.md](./auth-session-server-progress.md)를 따른다.
아래 엔드포인트/조회 구현 미완료 표시는 최초 공통 모듈 구현 시점의 기록이다.

## 결론

전원 재로그인이 필수라고 확정할 수 없고, 기존 세션 전부를 안전하게 승계할 수 있다고도
확정할 수 없다. 이번 조사는 현재 로컬 소스와 이전 작업 기록에 대한 검토다.
운영 이용자별 기기 상태와 이전 세션의 발급 근거는 조회하지 않았으며 대상 인원은 미확인이다.

| 기기/서버 조건 | 처리 |
| --- | --- |
| 유효 세션 + 신뢰 가능한 회원 연결 + 검증된 해당 세션 발급/승계 근거 | 자동 유지 |
| 세션 없음·폐기·갱신 불가 또는 발급 근거 없음 | 현재 화면에서 본인 재확인 |
| 일시적 통신 오류·서버 미준비·응답 시간 초과 | 세션 삭제 없이 재시도 안내, 보호 쓰기 보류 |
| 연결 충돌·정지·본인과 다른 프로필 | 자동 연결 금지, 계정 확인 |
| 관리자 초기화 뒤 임시 비밀번호 사용 | 새 비밀번호 설정 전 일반 기능 접근 금지 |

인증 재확인은 직접 로그아웃하거나 화면을 이동시키는 방식으로 구현하지 않는다.
현재 공통 모듈은 상태 판정 기반이며, 실제 비밀번호 확인 서버/화면은 아직 전환되지 않았다.

## 소스에서 확인한 근거

- src/pages/GuestMobileWelcome.jsx: 공개 회원 조회와 브라우저 비밀번호 확인값 비교 후 로그인.
  회원 객체를 localStorage에 저장하며 현재 확인값까지 포함될 수 있다.
- src/utils/verifiedProfileLogin.js: ensure-auth-link 후 해시 비밀번호/원래 비밀번호 호환 로그인.
- supabase/functions/dispatch-notification/index.ts: ensure-auth-link의 public.users.password 비교와
  회원 연결 사용. 해당 토큰이 새 안전 기준을 통과해 발급됐다는 증거를 별도로 제공하지 않는다.
- src/hooks/useStudentDashboard.jsx 및 src/pages/AdminDashboard.jsx: 저장된 회원 객체를 바탕으로
  초기 데이터를 조회한다. 관리자 객체가 저장되어 있다는 사실은 서버 권한 증명이 아니다.
- src/utils/interestSession.js 및 src/api/recruitmentInterestsApi.js: 하트는 SDK 세션 Auth ID 사용.
  이 경로만으로 앱 전체의 프로필 일치/신뢰 가능한 계정 연결이 보장되지는 않는다.
- docs/account-auth-operational-preflight.md: 이전 점검에서 공개 회원 읽기/쓰기 및 약한 RPC
  경로가 기록됐다. 현재 운영 정책을 재조회한 결과가 아니다.

따라서 유효 JWT나 public.users.auth_user_id 일치만을 승계 근거로 삼지 않는다.
기존 이름·전화번호·비밀번호 해시·클라이언트 역할/메타데이터를 자동 승계 근거로 사용하지 않는다.
이것이 실제 도용이나 특정 이용자 장애가 발생했다는 증거는 아니다.

## 이번에 구현한 범위

- src/auth/sessionCoordinator.js: 공통 상태, 동시 확인 합치기, 제한 시간, 만료,
  SDK 이벤트 반영, 계정 변경/중단 뒤 늦은 응답 무시, 작업 전후 동일 계정 확인.
- src/auth/SessionProvider.jsx: React 구독과 화면 복귀/온라인 이벤트 처리.
  자식을 상태마다 제거하지 않아 작성 내용 유지가 가능하다. 그 자체가 라우트/API 권한 검사는 아니다.
- src/auth/sessionTransport.js: 명시적으로 지정한 서버에만 확인 요청. 토큰을 URL/로그/공유 상태에
  보관하지 않는다. 리다이렉트와 캐시 금지, 401/403과 통신/서버 장애 구분, 자동 재전송 없음.
- supabase/functions/_shared/sessionContinuity.mjs: 서버 검증 정책 모듈. JWT 검증/활성 세션,
  보호된 1:1 회원 연결, 자격 버전, 해당 세션의 신뢰 근거와 만료를 모두 만족해야 retain.
  독자 토큰을 발급하지 않는다. 보호된 근거 조회 구현이나 HTTP 엔드포인트는 아직 없다.
- scripts/test-session-continuity.mjs: 위 규칙과 경쟁 상황을 검증하는 격리 테스트.

**기존 App/main/로그인/하트 실행 경로에 새 모듈을 연결하지 않았다.**
운영 서버가 준비되지 않은 상태에서 화면부터 인증을 강제하던 과거 실패를 반복하지 않기 위함이다.
새 환경 변수나 기존 인증을 우회하는 운영 옵션도 추가하지 않았다.

별도 전체 빌드에서 기존 RecruitmentInterestButton.jsx의 JSX 조건식 닫는 중괄호 누락을 발견했다.
코드 복원본에도 동일한 오류가 있음을 확인하고 `/>` 뒤 `}` 하나만 추가했다.
이는 기존 파일에 대한 이번 작업의 유일한 앱 수정이며 인증 동작 변경은 아니다.

## 서버 연결 전에 반드시 구현할 계약

1. verifyToken: 서명·발급자·대상·만료 검증 및 실제 활성 session_id 확인. JWT 단순 디코딩 금지.
2. loadAccount: 서버에서만 관리 가능한 회원 연결·정지·자격 버전 조회. 공개 수정 가능한 users
   행을 그대로 신뢰하지 않는다. 첫 일치 행만 선택하지 않고 충돌을 거절한다.
3. loadAssurance: 검증된 서버 로그인/재확인 또는 별도 감사된 승계 근거만 사용한다.
   유효한 JWT를 받았다는 이유만으로 근거를 생성하는 순환 검증은 금지한다.
4. 세 조회는 오류를 미존재로 바꾸지 않는다. 조회 실패는 5xx/503로 전달하고 세션을 유지한다.
5. 상태 조회 응답은 UX를 위한 것으로 보호 작업의 서버/RLS 재검사를 대신하지 않는다.
6. 실제 재확인·가입·복구 서버를 완성하고 RLS·Storage·Realtime·RPC fallback에 동일 원칙 적용 후
   기능별 연결한다. 초기화 상태는 전용 비밀번호 변경 권한만 주고 일반 세션으로 승격하지 않는다.

이 계약을 위한 보호 저장소/권한 변경은 운영 승인이 필요한 다음 단계다.
기존 DB 스키마/원본 로그 변경 금지 규칙은 그대로 유지한다.

## 검증

- Node 격리 테스트: 신뢰 근거 없는 유효 토큰, 익명·폐기·만료, 연결 위조/충돌,
  임시 비밀번호 제한, 여러 탭 이벤트, 타임아웃 후 늦은 성공, 변경 전 계정 응답,
  동시 확인, 네트워크 복구, 불필요한 signOut/재시도 없음 통과.
- localhost:5173/scratch/session-continuity-preview.html: 실제 Provider/coordinator/서버 정책을
  가상 의존성으로 함께 실행. 390px·1440px, 입력 보존, 페이지 이동 없음, 상태별 저장 차단 통과.
  격리 Chrome 사용, 외부 요청 0건·JS 오류 0건. 실제 회원 로그인·비밀번호·신청·알림 요청 없음.
- 기존 test-auth-link-integrity, test-interest-confirmation, test-calendar-rules 통과.
- 기존 배포 산출물의 check-legacy-auth-bundle 통과. 전체 앱의 새 인증 적용 완료를 의미하지 않는다.
- npm run build -- --outDir scratch/auth-session-build 통과(1분 22초).
  기존 Browserslist/큰 번들 경고는 남았다. 기존 dist 전체의 해시가 코드 복원본과 동일함을 확인했다.
  새 인증 모듈은 운영 진입점에 포함되지 않으며 별도 격리 화면에서 컴파일/동작 검증했다.
- 운영 Auth/Edge/RLS 통합·실기기 세션 승계·실제 본인 확인은 아직 미검증이다.

## 백업 및 원복 준비 확인

사용자가 문제 시 원복 가능성을 요청해 실제 파일과 상태 기록을 다시 확인했다.

- 암호화 백업: C:/Users/Jin/AppData/Local/SCI-Center-Backups/backup-20260831-165947-4fad9228bd1f4dc5b392c488abfbfb97
  오늘 17:00:34 KST 완료. database.dump.age / roles.sql.age / recovery-key.age 모두 존재하고
  기록된 파일 크기·SHA256과 일치한다. 이번에는 복호화하지 않았다.
- 17:08:24 KST 복원 기록: auth.users / auth.identities / public.users 복원 성공.
  full_database_restore_verified=false. 전체 서비스 복구가 검증됐다고 주장하지 않는다.
- 백업 시점 이후 운영 데이터 변화가 있으며 승인된 미연결 Auth 정리 이전 백업이다.
  이 백업을 운영에 통째로 덮으면 이후 데이터 손실/정리된 계정 재생성이 발생할 수 있다.
- 코드/설정/기존 dist 복원본: backups/auth-baseline-20260831-213543.
  654개 파일 복사·SHA256 재검사 일치. .env 비밀 설정 파일은 복사하지 않았다.
  새 공통 모듈 초안도 일부 포함하지만 기존 실행 경로는 그대로인 시점이다.
  위 하트 JSX 문법 오류도 포함된 작업 시점 복원본이며, 소스 전체가 빌드 성공한 지점이라는 뜻은 아니다.
  원래 dist는 덮어쓰지 않았다. 빌드 결과와 소스 원복 상태는 별도로 확인해야 한다.
  빌드 통과한 하트 수정 파일을 같은 복원본의 verified-fixes/src/components/student/components에
  별도로 보관했다. 기존 소스와의 차이는 닫는 중괄호 한 글자다. 새 공통 모듈 외 기존 src 변경이
  이 파일 하나뿐임을 해시로 확인했다. 원복 소스를 다시 빌드할 때 이 검증된 수정도 함께 고려한다.
- 코드 복원본은 이 PC의 로컬 보관본이며 암호화 DB 백업과 별개다. 다른 장치의 재해 복구까지
  보장하지 않는다. 환경 비밀값·서버 설정·Storage 파일 실체는 별도 보존/접근 수단이 필요하다.

### 원복 순서 원칙

1. 이번 분리 단계에서 문제가 있으면 새 모듈/시험 화면만 비활성 상태로 두고 기존 앱을 사용한다.
   기존 파일을 덮거나 DB를 복원할 필요가 없다. 새 파일 정리는 파일별 검토 후 진행한다.
2. 기존 코드 수정 전에는 복원본을 기준으로 변경 파일 목록·해시를 기록한다. 현재 다른 작업의
   변경도 많으므로 git reset --hard 또는 전체 폴더 덮어쓰기를 사용하지 않는다.
3. 운영 변경 직전 최신 DB 백업, 전체 복구 리허설, 서버/정책 버전과 안전한 호환 복구 지점을 확보한다.
4. 운영 장애 시 새 기능 활성화를 중단하고 신규 쓰기를 보존한다. 화면 복원은 서버와 호환되는
   검증된 버전으로만 수행한다. 공개 비밀번호·약한 인증 RPC를 다시 켜지 않는다.
5. DB 복원이 필요하면 격리 환경에 먼저 복원하고 이후 신규 기록과 비교해 복구 대상을 확정한다.
   운영 데이터에 과거 백업을 바로 덮지 않는다. 실제 복구/배포는 구체적 범위 승인 후 수행한다.

기술 근거:
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/reference/javascript/auth-getsession
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange

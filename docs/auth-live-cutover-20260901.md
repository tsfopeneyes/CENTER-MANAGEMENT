# 인증 구조 운영 전환 기록 — 2026-09-01

- 전환 직전 전체 DB 암호화 백업을 생성하고 암호화 읽기·해시를 확인했다.
- 별도 로컬 PostgreSQL에 `auth.users`, `auth.identities`, `public.users`를 복원했다.
  복원 건수는 프로필 278, Auth/identity 213이며 미연결·중복·고아 계정은 0이었다.
- 비공개 `account_security` 기반과 기능별 `NOLOGIN NOBYPASSRLS` 역할을 적용했다.
- 기존 Auth 계정 213개와 현재 세션 280개를 비공개 매핑·세션 보증에 부트스트랩했다.
- 배포 런타임은 Supabase 관리 `auth` 스키마를 직접 조회하지 않는다. 토큰과 Auth 사용자 상태는
  `/auth/v1/user` 및 Admin Auth API로 확인하고, 자체 DB는 매핑·역할·보증만 판정한다.
- `account-auth`와 `dispatch-notification`을 배포하고 `/health` 준비 상태를 확인했다.
- Firebase Hosting의 보안 인증 플래그를 활성화했다. 기본 도메인과
  `https://app.schoolchurchimpact.org`가 같은 활성 번들을 제공하고 후보 조회 CORS가 200임을 확인했다.
- 과거 인증·병합 RPC의 공개 실행 권한을 철회했다.
- Storage 공개 쓰기 정책은 0개다. Supabase 플랫폼의 테이블 ACL은 유지되지만 RLS 쓰기 정책이 없어
  브라우저 역할은 직접 저장할 수 없고, 업로드는 서버 경로를 사용한다.
- 인증·계정 관련 자동 회귀 47개가 모두 통과했다. 빌드의 기존 대형 청크 및 Browserslist 경고만 남았다.

복구 자료는 `C:/Users/Jin/AppData/Local/SCI-Center-Backups/backup-20260901-102643-9142d54c0b364135b63843f582a63131`에 있다.
복구에는 사용자가 별도로 보관한 백업 암호가 필요하다.

# 인증 서버 구현 진행 — 2026-08-31

후속으로 로그인·현재 화면 재확인 서버를 추가했다. 최신 구현/검증 범위는
[auth-login-server-progress.md](./auth-login-server-progress.md)를 참고한다.
아래 로그인 서버 미구현 표시는 읽기 전용 서버를 완성한 시점의 기록이다.

사용자 승인 범위: 전체 인증·회원 연결·권한 구조를 안전하게 개편한다.
앱 전체 기능/디자인을 다시 만드는 작업은 아니다. 운영 변경·배포 승인은 아직 받지 않았다.

## 이번에 완료한 범위

이전의 공통 브라우저 모듈과 서버 판정 규칙에 실제 읽기 전용 서버 구성요소를 연결했다.
기존 로그인/가입/하트 실행 경로, Supabase 설정, 기존 DB, 기존 dist는 수정하지 않았다.

- verifiedSession.mjs: Supabase Auth 사용자 확인 요청으로 토큰을 검증한 뒤 발급자/대상/
  만료/사용자 ID/세션 ID를 확인한다. 실제 auth.sessions 존재·기한 및 계정 정지도 검사한다.
  토큰 단순 디코딩은 사전 거절에만 사용하며, 서명 검증을 대신하지 않는다.
- sessionReadStore.mjs: 파라미터화한 직접 SELECT만 사용한다. 각 요청은 전용 연결의
  REPEATABLE READ READ ONLY 트랜잭션을 사용하고 완료/오류 뒤 ROLLBACK 및 연결 반환한다.
  BEGIN 결과가 불확실하거나 ROLLBACK이 실패하면 연결을 폐기한다. 공개 회원 테이블 fallback 없음.
- sessionStatusHandler.mjs: Web Request/Response HTTP 처리, 명시적 Origin, 2KB 입력 제한,
  8초 기본 제한, 인증 실패/권한 거부/장애 구분, 민감값 없는 응답, no-store 처리.
  이름·회원 ID·관리자 역할·비밀번호를 요청 본문으로 받지 않는다. 인증 상태 조회만 제공한다.
- sessionService.mjs: 위 요소와 기존 판정 규칙을 결합한다. 설정/연결은 명시적으로 주입하며
  import만으로 서버를 시작하거나 환경 비밀값을 읽지 않는다.
- supabase/manual/proposals/auth-session-foundation.sql: 보호된 회원 연결과 세션 신뢰 근거의
  저장 구조 및 읽기 전용 역할 제안. 운영 migration 폴더에 넣지 않았다. 기존 자료를 가져오거나
  계정을 연결하는 seed는 없고, 기본 상태는 미확인/비밀번호 변경 필요/신뢰 폐기다.

검토용 SQL은 격리 PGlite에서만 실행했다. 운영에 적용하지 않았다.
새 표는 기존 회원·인증 ID를 참조하며 삭제를 자동 전파하지 않는다. auth.sessions에는 외래 키를
걸지 않아 로그아웃/세션 정리 작업을 막지 않으며, 세션 존재 여부를 매 요청 확인한다.

## 검증 결과

`node scripts/test-session-service.mjs` 통과:

- 실제 loopback HTTP → 기존 sessionTransport/coordinator → 서버 → 독립 PostgreSQL 쿼리 연결.
- 보호 연결·신뢰 근거가 있는 세션 유지, 누락/만료/폐기/정지/연결 충돌/자격 버전 변경 거절.
- 임시 비밀번호 변경 필요 상태에서 일반 인증 승계 거절.
- anon/authenticated의 보호 테이블 접근 차단. 시험 reader 역할의 비밀번호 열 조회·쓰기 차단.
- READ ONLY 트랜잭션 내 쓰기 거절, 실패 시 연결 반환/폐기, 원본 회원 행 보존.
- 공개 회원 객체를 바꿔도 보호된 회원 연결은 바뀌지 않음.
- 401/403과 429/5xx 구분, 잘못된 발급자/대상/역할/만료/세션 ID 거절.
- 잘못된 본문/추가 프로필 ID/큰 입력/허용되지 않은 Origin을 DB 접근 전 거절.
- 중간에 멈춘 요청 본문 취소, 응답 시간 제한, 내부 오류·토큰·비밀번호 응답 유출 방지.

Supabase Auth의 상위 HTTP 응답은 가상으로 대체했다. 실제 Supabase 서명 검증·Edge 환경·
운영 역할/정책이 통과했다고 주장하지 않는다. 실제 네트워크 사용은 로컬 loopback 시험뿐이다.

기존 `test-session-continuity.mjs`도 통과했고 localhost:5173의 격리 인증 화면 HTTP 200을 확인했다.
프런트 파일을 이번에 변경하지 않아 전체 프런트 빌드는 반복하지 않았다. 이전 빌드 통과 기록은
docs/session-continuity-readiness.md를 참고한다.

## 운영 연결 전 남은 작업

1. 로그인·본인 재확인 서버: 표준 Supabase Auth 비밀번호 검증, 공유 시도 제한,
   이름/동명이인 처리, 안전한 기존 자격 전환, 검증된 세션 신뢰 근거 등록을 구현한다.
   현재 status 조회만으로 신뢰 근거를 생성하지 않는다.
2. 가입·초기화·변경 서버: 중복 방지·단계별 재시도/복구, 관리자 확인 및 임시 비밀번호
   만료/시도 제한/강제 변경, 관련 세션 폐기와 감사 기록을 구현한다.
3. 실제 배포 환경에서 보호 저장소/인증 세션 조회 권한을 확인한다. 제안된 reader는 테스트
   환경에서 검증했으며, 운영 PUBLIC 상속 권한·auth 테이블 RLS가 같은지는 미확인이다.
   DB 연결 역할과 connection timeout/pool 크기를 명시하고 민감 열 접근 불가를 재검증해야 한다.
4. 각 기능의 RLS/서버 권한을 전환한다. status 응답은 UI 상태이며 실제 쓰기 허가를 대신하지 않는다.
   토큰 검증과 상태 확인 사이의 변경도 실제 보호 작업 시점에 다시 검사해야 한다.
5. 요청 제한/운영 관찰/준비 상태 확인 및 Edge 런타임 진입점을 준비하고, 서버 준비 후
   공통 인증을 기존 화면에 연결한다. 현재 운영 함수 config/진입점은 추가하지 않았다.
6. 최신 백업, 전체 서비스 복구 리허설, 기존 기기 영향 범위와 운영 변경안을 검토 후 승인받는다.

현재는 기존 이용자의 로그인 상태를 변경하지 않는다. 기존 인증 일괄 승인·강제 로그아웃·
비밀번호 초기화·계정 병합·시험 알림을 수행하지 않았다.

## 참고

- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/database/postgres/row-level-security

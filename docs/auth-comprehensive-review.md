# 인증·권한 구조 종합 검토

현재 이용 경험 유지와 DB 구조 변경 허용을 함께 반영한다. 이 문서는 기능/운영 변경 동의 요청이
아니며 내부 구조와 검증 순서를 정리한다. 전체 보안 전환은 아직 완료되지 않았다.

## 운영에서 확인한 근거

Supabase 관리 화면에서 구조만 READ ONLY 조회했다. 회원 정보/비밀번호/로그 본문은 읽지 않았다.
조회 쿼리는 `supabase/manual/auth-security-inventory.sql`, 결과는
`docs/auth-security-inventory-20260831.json`에 있다. 이 파일은 아래 권한 정리 **이전** 목록이다.

- public 53개, storage 8개 테이블 및 정책 137개를 수집했다.
- RLS 비활성 public 테이블: duty_checklist_settings, duty_logs, global_settings,
  haifn_items, haifn_transactions.
- users 외에도 logs, messages, notice_responses, user_badges 등 여러 테이블에 PUBLIC 역할의
  넓은 허용 정책이 있다. 공개 게시물 조회처럼 의도된 공개 기능과 개인정보 접근을 구분해야 한다.
  정책 하나만 보고 결론내리지 않고 grant·다른 restrictive 정책·함수 경로까지 함께 확인한다.
- get_login_candidates, legacy_login_sync, merge_duplicate_users, merge_guest_to_member,
  upgrade_guest_account는 SECURITY DEFINER이며 anon/authenticated EXECUTE가 있다.
  내부 권한 검증을 모두 감사한 것은 아니고 실제 호출/계정 변경 실험은 하지 않았다.
- security_barrier 옵션만 있는 공개 뷰가 있다. 이것이 RLS 위임/인가와 같은 의미는 아니다.
  program_calendar_previews는 공개 프로그램 기능에 필요하므로 필터/열을 검증하며 유지해야 한다.
- 반환 타입이 trigger인 함수는 직접 호출 가능한 RPC와 같지 않다. EXECUTE 목록을 전부 동일한
  취약점으로 분류하지 않는다. Storage는 버킷 공개 설정/URL/파일 소유권 점검이 추가로 필요하다.

## 코드에서 확인한 결합 문제

1. `userApi.fetchUser`가 공개 회원 행 전체를 받고 `updateProfile`이 전달된 객체를 그대로 쓴다.
   password/role/auth_user_id/승인 상태를 일반 프로필 읽기·수정 경로와 분리해야 한다.
2. `verifiedProfileLogin`과 `ensure-auth-link`는 공개 회원 password 및 해시를 native Auth
   비밀번호로 사용하는 기존 경로에 의존한다. 새 코드만 추가하고 이를 열어 두면 우회로가 남는다.
3. `dispatch-notification`에 알림 처리와 계정 연결/비밀번호 초기화가 함께 있다.
   `reset-student-password`는 생년월일·뒤 네 자리 비교로 초기화하며 관리자 직접 확인 경로와 별개다.
   로컬 소스 점검 결과이며 그 소스 전체의 현재 배포 일치를 확인한 것은 아니다.
4. 관리자 화면은 공개 users의 role/status/password를 직접 갱신한다. 이를 보호된 서버 명령으로
   옮기되 관리자에게 새 화면/새 승인 절차를 임의 추가하지 않는다.
5. 이름 `admin`, 공개 role/user_group/is_master, 클라이언트 캐시는 서버 관리자 권한 근거가 될 수 없다.
6. 신규 권한 검사 결과를 반환하는 것만으로 뒤의 DB 쓰기가 보호되지는 않는다. 실제 쓰기 시점에도
   해당 요청의 주체/권한 조건이 적용되도록 RLS 또는 같은 트랜잭션의 조건부 쓰기가 필요하다.

## 목표 구조

| 책임 | 기준 | 하지 않는 것 |
|---|---|---|
| 비밀번호·세션 | Supabase Auth, 표준 SDK의 갱신/저장 | 공개 password 의존, 자체 토큰·해시 로그인 |
| 회원 연결·관리 권한 | 서버만 변경하는 보호 테이블 | 공개 이름/역할·브라우저 캐시로 승인 |
| 일반 화면 데이터 | 필요한 열만 반환, 사용자/역할별 grant와 RLS | users 전체 공개, 요청 객체 통째 갱신 |
| 계정 변경·가입 완료 | 서버 명령, 동일 DB 트랜잭션·완료 기록 | 중간 실패 시 계정 삭제·기존 기록 덮어쓰기 |
| 기존 세션 전환 | 검증 가능한 발급/연결 근거만 유지 | 무조건 전원 로그아웃, JWT 존재만으로 신뢰 |
| 장애 복구 | 최신 암호화 백업·전체 복구 리허설·작업 기록 | 오래된 백업으로 새 운영 기록 덮어쓰기 |

새 세션 신뢰 근거는 레거시 발급 경로 및 자격 폐기를 판별하는 보조 기록이다. Supabase Auth와
별도의 로그인 시스템을 운영하려는 것이 아니다. 운영 검증을 거쳐 불필요한 보조 상태는 줄여야 한다.
평소 로그인 입력/프로필 수정/보호자 승인 동작을 유지하고 서버 내부로 책임을 이동한다.
2026-09-01 사용자 결정에 따라 새 영구 비밀번호는 6자 이상으로 맞추고, 관리자 초기화용 네 자리는
native Auth와 분리된 일회용 변경 자격으로 유지한다. 기존 회원의 로그인 자격은 이 준비 단계에서 바꾸지 않는다.

## 이번에 실제 적용한 최소 권한 정리

2026-08-31 23:11 KST 무렵, public.users에서 anon/authenticated의 TRUNCATE, REFERENCES, TRIGGER만
REVOKE했다. 기존 SELECT/INSERT/UPDATE/DELETE와 8개 RLS 정책은 유지했다.
`restrict-client-users-ddl-privileges.sql`은 로컬 PGlite 시험 후 실행했고, 예상 권한과 다르면
트랜잭션을 중단하도록 검사를 포함한다. 커밋 후 별도 READ ONLY 조회로 두 역할 모두
CRUD=true, 제거 대상=false 및 users RLS=true/정책 8개를 확인했다.
`auth-users-privileges-applied-20260831.json`에 결과를 저장했다.

이는 데이터/스키마/로그를 바꾸지 않는 좁은 권한 정리다. 변경 전 grant 목록이 있어 메타데이터
변경 범위를 추적할 수 있다. 이전 암호화 백업은 무결성을 확인했지만 최신 전체 서비스 복구
보장이 아니다. 데이터 이동/광범위 정책 전환은 최신 백업과 복구 시험 후 진행한다.
**현재의 넓은 읽기·수정 권한을 해결한 것은 아니며 보안 전환 완료로 간주하지 않는다.**

## 이번에 보완한 준비 코드

- `auth-roles-foundation.sql`: 기본 disabled/member인 보호 역할 저장소. 자동 관리자 import 없음.
  클라이언트와 로그인/가입 worker는 관리자 역할을 쓸 수 없다. 운영에서는 미적용.
- `accountAuthorization.mjs`: 확인된 실제 세션+보호 연결을 검사하고, 본인 작업은 대상 ID를
  제한하며 관리 작업은 보호된 활성 admin 역할만 허용한다. 요청 body/캐시의 관리자 표시를 무시한다.
- `validateSelfProfileUpdate`: 학교/교회/소개글의 명시적 필드만 처리한다. 전체 프로필 수정
  엔드포인트가 아니며 사진·알림·허용된 preferences는 별도 좁은 명령으로 연결해야 한다.
- 권한 검사 응답은 클라이언트가 재사용하는 권한 증명서가 아니다. 실제 route가 작업 종류를
  정하고 매번 호출해야 하며, 쓰기 직전 권한 회수 경합은 DB 정책/트랜잭션으로 추가 검증해야 한다.

직원 기능 권한은 현재 기능별 동작에 맞춰 별도 검증한다. 준비 코어의 admin 전용 동작을
이유로 기존 직원 화면을 임의 축소하거나 새 역할을 부여하지 않는다.

## 적용 순서와 완료 조건

1. 현재 수행한 최소 권한 정리 유지, 민감 데이터 접근 및 인증/병합 함수부터 우선 검토.
2. 보호 계정/역할과 서버 명령을 준비하고 관리자/직원/회원 연결을 검증한다. 공개 역할을 무검증 복사하지 않는다.
3. 프로필·로그인·관리자 계정 처리의 새 서버와 현재 UI를 격리 환경에서 연결한다.
4. 기존 취약 발급/변경 경로를 닫는 변경과 대응 클라이언트 전환을 함께 준비한다.
   위험한 구형 경로를 장기 호환 수단으로 유지하지 않는다.
5. 신청·포인트·출입·당직·메시지·알림·Storage를 기능별 권한 테스트와 함께 전환한다.
   본인/타인/관리자/직원/게스트/미로그인 각 주체에 대해 허용과 거절을 모두 확인한다.
6. 최신 백업·전체 복구 리허설, 같은 ID/내용/연결 보존, 실제 Auth/다중 탭/모바일/장애 시험 후 확대한다.

아직 2–6의 실제 앱/운영 전환은 완료되지 않았다. 필요한 운영 경험 변경안은 내부 작업 후
한 번에 제안하며 Firebase 배포는 별도 명시적 지시 전 실행하지 않는다.

검증: test-client-users-privileges, test-account-authorization 및 기존 로그인/세션/가입 저장 회귀 테스트.
실제 DB에서는 카탈로그 조회와 좁은 REVOKE만 수행했다. 회원/계정 변경, 로그 수정, 사이트 배포 없음.

공식 근거:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/password-security

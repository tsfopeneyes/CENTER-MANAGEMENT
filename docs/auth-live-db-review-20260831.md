# 실제 DB 구조·권한 점검 및 변경 허용 반영

> 후속 진행: 종합 점검 후 users의 anon/authenticated TRUNCATE·REFERENCES·TRIGGER 권한만
> 운영에서 제거하고 커밋 이후 재확인했다. `auth-comprehensive-review.md`와
> `auth-users-privileges-applied-20260831.json` 참고. 아래 “미변경”은 최초 읽기 전용 점검 시점이다.

사용자가 인증 구조 개선을 위한 DB 변경을 허용했다. 기존 데이터를 보존하며 필요한 구조와
권한을 단계적으로 전환한다. 현재 이용 경험/운영 방식 변경을 임의 적용하거나 배포하는 허용과는 다르다.

## 이번에 실제 확인한 범위

로컬 .env의 DB 접속 정보가 없는 것과 별개로, 기존 Supabase 관리 화면의 로그인으로
SCHOOLCHURCH 프로젝트 `erecqalsxoxrufggvmcc`에 접근할 수 있었다. 앞선 “DB 구조 미확인” 상태를 갱신한다.
비밀번호, 쿠키, 저장된 세션, API 키를 조회/출력하지 않았다.

관리 화면 SQL Editor에서 `BEGIN READ ONLY`, 로컬 15초 statement timeout, 구조 SELECT,
`ROLLBACK`으로 점검했다. 첫 쿼리의 결과에 transaction_read_only=on을 확인했다.
두 번째 쿼리는 편집기의 텍스트 치환 문제로 1회 문법 오류가 났고, 전체 선택으로 본문을
바꾼 뒤 정상 조회했다. DDL/회원 수정/로그 삭제/권한 변경은 실행하지 않았다.

## 확인 사항

- public.users: RLS 활성, 사용자 정의 트리거 없음.
- password: nullable, 기본값 없음. 공개 회원 신규 저장 시 password를 생략할 수 있다.
- 필수 입력 열: name, phone, phone_back4. id/created_at도 NOT NULL이지만 기본값이 있다.
- auth_user_id: nullable UUID, UNIQUE 제약 있음. 기본키는 id이며 조회된 users 제약은 두 개다.
- 신규 서버가 사용하는 auth.users의 id/email/raw_app_meta_data/banned_until/is_anonymous와
  auth.sessions의 id/user_id/not_after 열이 존재한다.
- 신규 account_security 스키마는 운영 DB에 아직 없다.
- global_settings, haifn_items, haifn_transactions: RLS 비활성. 이번에는 이 세 테이블의
  전체 grant/접근 경로를 모두 감사한 것이 아니므로 외부에서 가능한 모든 동작을 단정하지 않는다.
- users의 anon/authenticated에는 SELECT/INSERT/UPDATE/DELETE 및 TRUNCATE/REFERENCES/TRIGGER
  테이블 권한이 부여되어 있다. 실제 API 노출/동작을 침투 테스트한 것은 아니다.
- users에는 PUBLIC 역할의 SELECT USING true, INSERT WITH CHECK true, ALL USING true
  permissive 정책들이 존재한다. 자기 행만 수정하는 정책과 함께 있어도 이 허용 정책들이
  접근을 넓힌다. RLS 활성 표시만으로 보호되고 있다고 판단할 수 없다.

정확한 정책 조건·grant·제약의 개인정보 없는 조회 결과는 `auth-db-access-review-20260831.json`에 저장했다.
회원 원문/전화번호/비밀번호/원시 로그는 조회하지 않았다.

## 코드에 반영한 실제 구조

새 회원 저장 트랜잭션에 기존 public.users.auth_user_id 저장을 추가했다. 보호된 계정 연결과
같은 Auth ID를 저장하며, 권한 판단의 기준은 보호된 연결이다. 공개 필드만으로 인증하지 않는다.
회원 INSERT의 제한적 정책에 auth_user_id=id 검사를 넣었다. 신규 회원만 대상이며 기존 다른 ID
연결을 변경/병합하지 않는다. 격리 fixture도 실제 필수 열·기본값·UNIQUE에 맞추어 보강했다.
`node scripts/test-membership-finalizer.mjs` 다시 통과했다.

## 백업 확인

2026-08-31 17:00 KST 암호화 백업의 세 파일 크기/SHA256을 현재 파일과 다시 비교해 모두 일치했다.
별도 17:08 기록에서 계정 세 테이블의 실제 복원 성공을 확인했다. **전체 DB/서비스 복구는
아직 검증되지 않았고**, Storage 파일·서버 비밀값이 포함된 완전한 서비스 백업도 아니다.
백업은 이후 계정 정리와 새 이용 기록 이전 시점이므로 변경 직전의 최신 백업을 대체하지 못한다.
관리 대시보드의 마지막 자동 백업 표시도 No backups였다. 로컬 암호화 백업과 혼동하지 않는다.

## 다음 적용 원칙

DB를 바꾸지 않는 것이 목표가 아니다. 표준 Auth와 보호된 회원/권한 연결을 기준으로,
공개 비밀번호 의존과 광범위 허용 정책을 안전하게 제거하는 것이 목표다.

1. 기존 화면이 사용하는 읽기/쓰기·RPC별 최소 권한과 대체 경로를 확인한다.
2. 보호 구조를 추가하고 검증한다. 단순히 테이블만 추가해도 기존 과도한 권한이 닫히지는 않는다.
3. 기존 가입/로그인/관리자/게스트 경로와 맞는 서버·정책 조합을 격리 환경에서 검증한다.
4. 최신 백업/복구 리허설 후 호환 가능한 단위로 DB 정책과 서버 경로를 전환한다.

광범위 정책을 지금 즉시 삭제하면 현재 클라이언트가 의존하는 동작이 중단될 수 있다.
보안상 긴급 차단이 필요한 경우에도 영향과 범위를 명시해야 한다. 이번에는 허용 여부가 아니라
호환성·복구 준비가 DB 적용의 남은 조건이다. 불필요한 재승인을 반복해서 요청하지 않는다.

# 인증 전환용 백업 준비 — 운영 백업 성공 확인 전

2026-08-31. 이 문서는 도구 준비 상태이며, 백업 생성·복구 성공의 증거가 아니다.
운영 DB, 회원, Auth 자격 증명, 로그, 배포 상태는 변경하지 않았다.

## 준비한 표준 도구

- PostgreSQL 공식 Windows 다운로드 안내가 연결하는 EDB 배포본을 HTTPS로 받았다.
- 파일: `scratch/backup-tools-17.11/postgresql.zip` (340,719,294 bytes).
- 다운로드 출처: <https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip>.
- SHA-256: `6EABDF00D2893713B75DB4336A23C3FDF505F056E217EC6E2E95D901750CFEA3`.
  이는 받은 파일의 식별값이지, 공급자가 게시한 체크섬과의 대조 결과가 아니다.
- `scratch/backup-tools-17.11/unpacked/pgsql/bin/pg_dump.exe`, `pg_restore.exe`,
  `psql.exe`의 `--version` 실행은 모두 PostgreSQL 17.11로 확인했다.
- `pg_dump.exe`의 Windows 서명 상태는 `NotSigned`였다. 서명 검증 성공으로 표현하지 않는다.
- 필수 도구 확보 후 부가 관리 앱의 압축 해제는 중단했다. `pgsql/bin`의 실행 파일·라이브러리
  68개는 다운로드한 ZIP 안의 원본과 SHA-256을 대조해 모두 일치함을 확인했다.
  전체 배포판이 설치됐거나 DB 서버 실행 준비가 끝났다고 해석하지 않는다.
- Windows 서비스 설치, 시스템 PATH 변경, DB 서버 실행, 유료 기능 활성화는 하지 않았다.
- 이 도구 폴더에는 다운로드한 공개 배포 파일만 있고 운영 백업이나 비밀번호는 넣지 않았다.
  `scratch/`는 Git 추적 대상에서 제외되어 있다.

공식 출처: [PostgreSQL Windows 다운로드](https://www.postgresql.org/download/windows/),
[EDB 바이너리 배포](https://www.enterprisedb.com/download-postgresql-binaries).

## 실제 백업 전에 필요한 사항

1. 운영자가 관리하는 암호화된 보관 장소와 복호화 수단을 정한다. 저장소/키 접근자는 센터 운영자로 제한한다.
   복호화 키는 백업과 분리해 보관하고, 다른 장치에서도 운영자가 복구할 수 있는지 확인한다.
2. 정상적인 DB 접속 정보를 운영자가 안전한 로컬 입력 단계에서 제공한다.
   DB 비밀번호를 채팅, 소스, 명령행 인수, 콘솔 기록에 넣지 않는다.
   과거 스크립트의 비밀번호 후보나 브라우저·CLI 자격 증명 저장소에서 추출한 값을 사용하지 않는다.
   비밀번호를 모른다고 자동 재설정하지 않는다. 의존 서비스와 영향 확인 후 별도 승인한다.
3. DB 호스트와 인증서를 검증하는 TLS 연결을 준비한다. 인증서 검사를 끄거나 오류를 무시하지 않는다.
4. 백업은 표준 `pg_dump`/Supabase 백업 절차로 수행한다. 임의의 관리 SQL 행 내보내기나
   직접 만든 파일 포맷을 전체 DB 백업처럼 사용하지 않는다.

## 포함·복구 검증 범위

- 회원 프로필과 Auth 사용자/연결, 관리자 신뢰 목록, 원본 기록·신청·포인트를 포함한다.
- 스키마, 함수, 트리거, RLS 정책, 권한, 필요한 역할/확장과 마이그레이션 이력을 검토한다.
- 파일 저장소의 실제 파일, 서버 함수·설정·비밀값은 DB 덤프만으로 복구된다고 가정하지 않는다.
  필요한 항목별 별도 복구 방법과 보관 책임자를 기록한다.
- 네이티브 PostgreSQL 복구와 Supabase 플랫폼 복구는 동일하지 않다. 대상 환경의 관리 역할,
  Auth/Storage 스키마, 확장과 암호화 설정 호환성을 공식 절차에 따라 확인한다.
- 외부 알림/웹훅이 차단된 격리된 환경에 복구하고, 데이터·권한·계정 연결을 대조한다.
  복구 환경에서 운영에 연결하거나 실제 회원에게 알림을 보내지 않는다.
- 파일 크기, 체크섬, 행 개수만으로 복구 성공이라 판단하지 않는다.
  현재 준비된 로컬 인증 테스트도 실제 운영 백업 복구 시험을 대신하지 않는다.
- 실제 전환 직전에는 승인된 점검 시간에 새 기준 시점의 백업을 확보하고 변경 중 유입되는 기록을 고려한다.

참고: [Supabase 백업·복구 절차](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[백업 범위와 제한](https://supabase.com/docs/guides/platform/backups).

## 전환 중단 조건 유지

백업·복구가 확인돼도 미연결 Auth 12개와 인증 정보가 없는 활성 회원 12명의 소유권/복구 문제가 남는다.
두 집단을 같은 사람이라고 추정하거나 임의로 연결·삭제·병합하지 않는다.
재개 조건 전체는 [운영 사전 점검](./account-auth-operational-preflight.md)을 따른다.

## 2026-08-31 후속: 사용자 직접 입력 실행기

- 사용자는 다른 외부 DB 연동은 없으며 관리 화면에서 DB 비밀번호를 변경했다고 알렸다.
  비밀번호 자체는 수신·조회·저장하지 않았다. 실제 새 접속은 아래 실행기의 사용자 입력으로만 검증한다.
- 사용자가 내려받은 CA 인증서: `C:/Users/Jin/Downloads/prod-ca-2021.crt`.
- 공식 age 1.3.2 Windows 배포본을 프로젝트의 `scratch/backup-age-1.3.2/`에 준비했다.
  GitHub 공식 릴리스의 SHA-256과 받은 ZIP을 대조했다:
  `f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7`.
- 실행기: `scripts/start-encrypted-db-backup.ps1`, 처리기: `scripts/encrypted-db-backup.mjs`.
  `-CheckOnly`는 도구/인증서 확인만 하며 암호 입력·DB 접속·백업 생성은 하지 않는다.
- 실제 실행은 운영자가 보이는 로컬 터미널에서 `진행`과 DB 비밀번호를 직접 입력해야 한다.
  DB 비밀번호는 가려진 입력 → 비공개 표준 입력 → PostgreSQL 자식 프로세스 환경으로만 전달한다.
  채팅, 명령행 인수, 소스, 디스크, 실행 로그에 기록하지 않는다. 실행 중 프로세스 메모리에는 존재한다.
- 연결은 지정된 프로젝트의 세션 풀러/5432, `verify-full`과 CA 인증서 검증을 사용한다.
  DB 명령은 접속 확인 SELECT, 읽기 전용 `pg_dump`, `pg_dumpall --roles-only --no-role-passwords`뿐이다.
- 백업 대상: `AppData/Local/SCI-Center-Backups/backup-<시각>-<난수>/`.
  새 실행 폴더만 현재 Windows 사용자와 SYSTEM으로 접근을 제한한다. 기존 폴더 권한은 변경하지 않는다.
  새 경로를 매번 만들며 기존 백업을 덮어쓰지 않는다. 프로젝트/로컬 웹 서버 밖에 저장한다.
- 별도 백업 암호는 age 자체의 터미널 입력으로 정한다. 복구용 키는 `recovery-key.age`로 암호화한다.
  운영자가 같은 암호로 복호화해 키가 일치하는지 확인한 뒤 DB 내보내기를 시작한다.
  평문 복구키는 메모리에만 두고, 공개키로 표준 PostgreSQL 덤프/역할 파일을 스트림 암호화한다.
- 결과 파일은 `database.dump.age`, `roles.sql.age`, `recovery-key.age`, 비밀값 없는 `status.json`이다.
  오류 진단 원문은 비밀번호/SQL/개인정보 노출을 막기 위해 출력하지 않는다.
- 암호화 전후 바이트/해시 일치, `pg_restore --list`, 필수 회원·인증·기록 테이블의 목차 포함을 확인한다.
  이는 **실제 데이터베이스 복구 검증이 아니다**. 성공 상태도 `encrypted-copy-checked-restore-not-tested`이며
  `database_restore_verified=false`, `account_cutover_allowed=false`를 유지한다.
- 실패한 실행 폴더/부분 암호화 파일은 삭제하지 않고 `incomplete`로 남긴다. 재실행은 새 폴더에서 한다.
- 관리 역할의 비밀번호, Storage 실제 파일, 서버 비밀값은 포함되지 않으므로 별도 복구 계획이 필요하다.
  글로벌 역할과 DB 덤프의 시점은 하나의 스냅샷이 아니다. 전환 직전 점검 시간에 재백업해야 한다.
- 백업 암호는 운영자의 비밀번호 관리 앱 등 별도 수단에 보관하고, 복구키를 포함한 폴더 전체가 필요하다.
  이 PC의 사본 하나만으로 장치 고장 대응까지 끝났다고 해석하지 않는다.

검증: `node scripts/test-encrypted-db-backup.mjs` 통과. 실제 age 실행 파일로 가상 바이너리의
암복호화, 기존 파일 덮어쓰기 방지, 생산 프로세스 실패, 파일 변조·잘못된 덤프 거부를 확인했다.
운영 DB는 테스트에 사용하지 않았다. 실제 대화형 암호 입력과 운영 덤프·복구는 별도 단계다.

출처: [age 공식 배포](https://github.com/FiloSottile/age/releases/tag/v1.3.2),
[age 사용 설명](https://github.com/FiloSottile/age/blob/v1.3.2/doc/age.1.ronn),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[pg_dumpall](https://www.postgresql.org/docs/17/app-pg-dumpall.html),
[Supabase 인증서 연결](https://supabase.com/docs/guides/database/psql).

## 2026-08-31 연결 실패 진단 보완

- 사용자가 실행한 `backup-20260831-161836-f0ba7a3ec50b4bdebff858186cd9c4d5`는
  `connection` 단계에서 중단됐다. 폴더에는 `status.json`만 있으며 DB 사본은 생성되지 않았다.
- 기존 실행기는 원본 오류를 버리므로 이 실행의 정확한 원인을 사후 복원할 수 없다.
  비밀번호 오류라고 단정하거나 재설정하지 않는다.
- 새 비밀번호를 사용하지 않는 점검 결과: DNS 조회 성공, PostgreSQL SSLRequest 후
  내려받은 CA와 실제 풀러 호스트명으로 엄격한 TLS 검증 성공. 인증 패킷·SQL을 보내지 않았다.
- 네이티브 psql 17.11도 암호를 공급하지 않고 `--no-password`, 빈 비밀번호 파일 경로로
  연결 협상을 검사했다. 결과는 예상한 `password-not-supplied`이며 비밀번호 입력 요청 단계까지
  도달했다는 뜻이다. **사용자 실제 실행에서 비밀번호가 누락됐다는 진단은 아니다.**
- 이 진단 과정의 샌드박스에서는 자식 실행이 EPERM으로 차단됐다. 승인된 별도 실행에서 검증했다.
  사용자가 연 대화형 창의 최초 실패 원인을 샌드박스 오류로 단정하지 않는다.
- 연결 오류는 표준 오류를 메모리에 최대 16 KiB만 받아 고정된 허용 목록 코드로 분류한다.
  원문은 출력/파일 저장하지 않고 버퍼를 지운다. 상태 파일에는 `failed_reason` 코드만 추가한다.
  읽기 전용 상태, 대상 DB/버전 불일치, 인증 거절, 인증서, 네트워크, 실행 권한을 구분한다.
- TLS 검증/읽기 전용 차단 조건은 유지한다. 자동 재시도, 비밀번호 추측, 자격 증명 저장소 조회,
  DB 설정 변경, 배포는 하지 않았다. 실제 입력을 통한 재확인이 필요하다.
- 가상 데이터 회귀 테스트 통과: 오류 분류/원문 비노출, 분할된 오류 메시지/크기 제한,
  없는 실행 파일, 연결 상태 검증 및 기존 암호화·변조·덮어쓰기 방지 테스트.
  PowerShell `-CheckOnly`와 JavaScript 구문 검사도 통과했다.
- 실제 백업·복구 검증과 계정 소유권 문제는 여전히 미완료이며 운영 전환은 계속 차단한다.

## 2026-08-31 후속: 읽기 전용 연결 검사 및 큰 파일 검증 수정

이전 작업 `캘린더 개편 작업 이어가기 (2)`의 마지막 실패는
`backup-20260831-162531-5f9568b06bab4beabe52af8c13654660/status.json`의
`connection / readonly-check`다. 비밀번호 인증·SELECT 실행 이후 검사에서 중단됐으며
백업 파일은 생성되지 않았다. 사용자에게 비밀번호를 다시 변경하도록 요구하지 않는다.

- Supavisor 공식 변경 기록은 `search_path` 등 일부를 제외한 startup 옵션은 전달하지 않는다고
  명시한다. 기존 `PGOPTIONS`의 `default_transaction_read_only=on`만 믿는 검사는 이 연결과
  맞지 않는다. 실제 실패와 일치하지만 해당 운영 서버의 배포 버전까지 조회한 것은 아니다.
- 직접 DB 주소의 IPv6 경로는 이 PC에서 `NetworkUnreachable`이었다. 유료 IPv4 설정,
  시스템 네트워크 설정, 인증서 검증, 서버/역할 기본 설정은 변경하지 않았다.
- 접속 검사는 `BEGIN READ ONLY` 안에서 `transaction_read_only`를 확인하고 `ROLLBACK`한다.
  시간 제한도 해당 트랜잭션 안에서만 설정한다. 실제 트랜잭션이 `off`면 여전히 중단한다.
  기본값 `default_transaction_read_only`와 실제 상태를 분리해 비밀값 없는 결과로 기록한다.
- `pg_dump`는 자체 `REPEATABLE READ, READ ONLY` 트랜잭션으로 데이터를 읽는다.
  사전 검사 연결이 별도 백업 연결까지 보호한다고 주장하지 않는다.
- 역할 내보내기는 고정 인수 `pg_dumpall --database=postgres --roles-only --no-role-passwords`를
  유지한다. 이 도구는 역할 카탈로그를 읽으며 **별도의 읽기 전용 트랜잭션을 열지는 않는다**.
  가상 DB의 실제 쿼리 기록에서 SELECT/세션 SET만 수행하고 DDL/DML 쓰기가 없음을 확인한다.
  실행기의 읽기 전용 설명은 데이터 변경을 하지 않는 표준 내보내기를 뜻하며,
  모든 연결에 DB 차원의 쓰기 금지 역할을 적용했다는 뜻은 아니다.
- `pg_restore --list`는 목차만 읽고 먼저 종료할 수 있다. 이전 구현은 이때 전체 암호화
  파일 검사도 중단했다. 목차 도구가 끝나도 남은 데이터를 끝까지 읽어 해시·바이트 수를
  검증하도록 수정했다. 복호화/목차 도구의 정상 종료와 전체 일치를 모두 요구한다.
- DB/역할 내보내기에서 조회 권한이 부족하면 원문 없이 고정 오류 코드로 표시한다.
  권한 변경, 대상 테이블 제외, 불완전 백업의 성공 처리는 하지 않는다.
- `scripts/test-backup-readonly.mjs`는 새 `scratch/backup-readonly-test-*` 폴더에 가상 DB를
  만들고 loopback에서만 실행한다. 내려받아 둔 PostgreSQL ZIP의 실행 지원 자료를 추가로
  풀었으며 시스템 설치·서비스 등록은 하지 않았다. 테스트 후 해당 서버를 종료한다.
- 가상 시험 항목: 기본 읽기 전용 옵션이 없는 연결, 실제 읽기 전용 트랜잭션 검사와 쓰기 거부,
  표준 덤프의 READ ONLY/COPY 순서, 역할 조회만 실행, 한국어 및 25,000개 가상 로그,
  128 KiB 이상 암호화 파일, 전체 바이트 검사, 파일 끝부분 변조 거부, 원본 보존.
  `test-encrypted-db-backup.mjs`의 기존 암복호화·덮어쓰기 방지·오류 비노출 검사도 유지한다.

이 검증은 **운영 백업 성공 또는 실제 복구 성공이 아니다**. 실제 암호 입력과 새 백업 결과 확인이
필요하다. 운영 인증 전환·계정 변경·배포 차단 및 별도의 복구 검증 요구는 그대로 유지한다.

근거: [Supavisor startup 옵션 처리](https://github.com/supabase/supavisor/pull/858),
[PostgreSQL 읽기 전용 트랜잭션](https://www.postgresql.org/docs/17/sql-set-transaction.html),
[PostgreSQL 17 pg_dump 구현](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/bin/pg_dump/pg_dump.c),
[pg_dumpall 설명](https://www.postgresql.org/docs/17/app-pg-dumpall.html).

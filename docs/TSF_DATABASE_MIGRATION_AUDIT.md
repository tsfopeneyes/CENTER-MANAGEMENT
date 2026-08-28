# TSF 데이터베이스 마이그레이션 점검 기록

점검일: 2026-08-19

## 원칙

- 기존 마이그레이션은 삭제하거나 다시 적용하지 않는다.
- Supabase의 마이그레이션 기록과 로컬 파일 목록이 일치하지 않으므로 `supabase db push`를 사용하지 않는다.
- TSF 검색 색인은 별도 테이블만 추가하며, 기존 공지·대여·설문 데이터는 변경하지 않는다.

## 실제 온라인 DB 대조 결과

다음 기능은 온라인 DB에 이미 존재하고 현재 웹앱 코드에서도 사용한다.

| 로컬 파일 | 실제 상태 | 비고 |
| --- | --- | --- |
| `20260306153741_add_is_leader_only_to_notices.sql` | 적용됨 | `notices.is_leader_only` 존재 |
| `20260630_setup_rentals_and_contents.sql` | 적용됨 | `contents`, `rentals`, `rental_bookings` 존재 |
| `20260703_reorganize_program_columns.sql` | 일부 반영됨 | 프로그램 기간·요일 컬럼 존재. 옛 챌린지 날짜 컬럼은 없음. `challenge_missions`는 현재 존재·사용 중 |
| `20260709_add_host_columns_to_notices.sql` 등 | 적용됨 | 공지 진행자 관련 컬럼 존재 |
| `20260818000000_add_checkout_feedback_to_visit_notes.sql` | 적용됨 | `visit_notes.checkout_feedback` 존재 |
| `20260818001000_repair_missing_survey_and_notice_columns.sql` | 적용됨 | 설문 구분·본문 관련 컬럼 존재 |

## 적용 금지 항목

`20260703_reorganize_program_columns.sql`은 `challenge_missions`를 삭제할 수 있다. 이 컬럼은 현재 학생 챌린지 화면과 관리자 프로그램 편집 화면에서 사용하므로 재실행하면 안 된다.

## 별도 추가 예정인 TSF 검색 색인

`20260819000000_create_tsf_notion_index.sql`은 Notion 원본을 바꾸지 않는 검색 전용 테이블이다. 기존 마이그레이션이 아닌 이 파일만 별도로 적용한다.

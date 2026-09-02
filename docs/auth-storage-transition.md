# 인증 전환 중 Storage 쓰기 보호

현재 운영 정책은 `notice-images`의 공개 INSERT와 `avatars`의 공개
INSERT/UPDATE/DELETE를 허용한다. 기존 공개 이미지 URL은 화면과 DB 여러 곳에 저장돼 있으므로
버킷을 비공개로 바꾸거나 기존 객체 경로를 이동하지 않는다.

준비된 `/account-auth/uploads` 경로는 현재 Supabase 세션, 서버의 계정 연결과 assurance,
관리자 전용 종류의 canonical role을 확인한다. 브라우저는 버킷이나 저장 경로를 정하지 못하고
JPEG/PNG/WebP/GIF, 8 MiB 이하만 보낸다. 서버가 충돌 없는 경로를 만들고 Storage service role은
이 단일 모듈 안에서 INSERT에만 사용한다. 기존 파일을 덮어쓰거나 삭제하지 않는다.

기존 기능 대응은 다음과 같다.

| 현재 기능 | 새 업로드 종류 | 버킷/서버 경로 | 권한 |
|---|---|---|---|
| 프로필 사진 | `profile` | `avatars/profiles/<본인>/...` | 본인 세션 |
| 센터 채팅 사진 | `chat` | `avatars/chat/<본인>/...` | 본인 세션 |
| 방명록 사진 | `guestbook` | `notice-images/guest/<본인>/...` | 본인 세션 |
| 미션 인증 사진 | `mission` | `notice-images/mission/<본인>/...` | 본인 세션 |
| 공지·상점·배지 | `notice/store/badge` | `notice-images/admin/...` | canonical 관리자 |
| 대관 사진 | `rental` | `avatars/admin/rentals/...` | canonical 관리자 |

`auth-storage-cutover.sql`은 모든 호출자 전환과 실제 기기 시험 뒤에만 공개 쓰기 정책을 제거한다.
공개 SELECT 정책과 기존 객체·URL은 건드리지 않는다. 전환 전에는 SQL을 적용하지 않으며,
전환 실패 시 클라이언트 배포를 먼저 되돌릴 수 있도록 공개 쓰기 제거와 화면 배포를 같은 점검
창에서 수행한다.

긴급 원복은 `auth-storage-cutover-rollback.sql`로 2026-08-31에 확인한 쓰기 grant와 정책만
복원한다. 이 스크립트도 객체 행이나 파일을 변경하지 않는다. 실제 적용 직전에는 운영 grant를
다시 읽어 이 기준과 일치하는지 확인하고, 다르면 실행을 중단한다.

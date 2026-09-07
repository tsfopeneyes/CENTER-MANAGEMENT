# TSF Slack AI 비서

TSF는 Slack 질문을 OpenAI Responses API로 이해한 뒤, 필요한 자료를 조회하고 안전하게 초안을 작성합니다.

- TSF 웹앱(Supabase): 방문, 회원 익명 집계, 프로그램, 대여, 하이픈 포인트·스토어, 설문·피드백
- Notion: 연결에 공유된 회의록, 업무, 일정, 프로젝트, 매뉴얼
- Slack: `@TSF 질문` 또는 `/tsf 질문`

## 방문 통계 기준

- `total_visits`: `CHECKIN`과 독립된 `GUEST_ENTRY`를 센 총 방문 횟수
- `unique_visitors`: 기간 내 고유 이용자 수
- `visitor_days`: 같은 이용자가 같은 날 여러 번 방문해도 1회로 센 이용일 합계
- 키오스크가 함께 저장한 `CHECKIN`/`GUEST_ENTRY` 중복은 제거합니다.
- 장기간 기록은 1,000건 단위로 나누어 최대 25,000건까지 읽습니다.
- 관리자와 직원 기록은 방문 통계에서 제외합니다.

예시 질문:

```text
@TSF 올해 상반기 하이픈 총 방문 횟수와 순 방문자 수 알려줘
@TSF 올해 6월과 7월 하이픈 방문 현황을 월별로 비교해줘
@TSF 지난달 대여 승인 건수 알려줘
@TSF 다음 주 회의와 해야 할 일을 노션에서 정리해줘
@TSF 신규 프로그램 안내문 초안 써줘
@TSF 다음 주 휴관 안내를 웹앱 공지로 등록해줘
@TSF 오늘 운영회의 회의록을 Notion에 저장해줘
```

## Supabase 비밀값

아래 값은 Supabase Dashboard의 Edge Functions secrets에 저장합니다. 실제 값은 저장소에 넣지 않습니다.

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
NOTION_API_KEY
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
SLACK_ALLOWED_TEAM_ID
TSF_WEBAPP_DATA_ENABLED=true
TSF_ACTION_SIGNING_SECRET=별도_긴_랜덤_문자열
TSF_WRITE_ALLOWED_USER_IDS=내_Slack_멤버_ID
TSF_WRITE_ALLOWED_CHANNEL_IDS=저장을_허용할_Slack_채널_ID
TSF_REPORT_ALLOWED_CHANNEL_IDS=보고서_수합을_허용할_채널_ID
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 호스팅 환경에서 자동으로 제공됩니다.

## Slack 설정

저장소 루트의 `slack-app-manifest.yaml`을 적용합니다. Event Subscriptions와 `/tsf` Request URL은 모두 다음 주소입니다.

```text
https://erecqalsxoxrufggvmcc.supabase.co/functions/v1/slack-tsf
```

필요한 Bot Token Scopes:

```text
app_mentions:read
chat:write
channels:read
channels:history
groups:read
groups:history
im:history
mpim:history
commands
```

또한 Slack App 설정에서 Interactivity를 켜고 Request URL에 같은 Edge Function 주소를 넣어야 확인 버튼이 동작합니다. App Home의 **Messages Tab**도 켜고 Event Subscriptions에 `message.im`을 추가하면 퐁퐁에게 DM으로도 질문할 수 있습니다. 저장 뒤 앱을 다시 설치해 변경 권한을 적용하세요.

TSF는 같은 스레드의 최근 대화를 읽어 후속 답변을 이어서 처리하고, 회의·일정·결정·진행 상황처럼 채널 대화에 근거해야 하는 질문에는 봇이 참여 중인 허용 채널을 기간과 주제로 검색합니다. 출처가 지정되지 않으면 Notion도 함께 확인합니다. 이를 위해 위의 Read/History 권한이 필요합니다.

`OPENAI_REASONING_EFFORT`는 `low`, `medium`, `high`, `xhigh` 중에서 정할 수 있습니다. 기본값은 `medium`입니다. 일상 질문은 병렬로 여러 자료원을 확인하므로, 새 질문 유형마다 별도의 문장 감지 규칙을 추가할 필요가 없습니다.

`@TSF 지난주 전 채널 운영 보고서 만들어줘` 또는 `/tsf 지난주 전체 채널 내용을 수합해서 운영 보고서 만들어줘`라고 요청하면, 봇이 초대된 공개·비공개 채널의 해당 기간 메시지와 웹앱 집계를 함께 정리합니다. DM과 그룹 DM은 보고서 수합 대상에서 제외합니다. `TSF_REPORT_ALLOWED_CHANNEL_IDS`를 비워 두면 봇이 들어가 있는 모든 채널을 대상으로 하고, 값을 넣으면 해당 채널만 대상으로 제한합니다.

## 작성·저장 기능

- 일반 웹앱 공지: “공지로 등록해줘”라고 요청하면 TSF가 초안을 표시합니다. 초안을 만든 사람이 15분 안에 확인 버튼을 눌러야 `notices`에 저장됩니다.
- Notion 회의록·기획안·참고 자료: `노트 DB`에 새 항목으로 저장합니다. 프로젝트·할 일을 지정하면 관련 DB 항목을 찾아 관계도 함께 연결합니다.
- Notion 할 일: `할 일 DB`에 새 항목으로 저장하고, 지정한 `프로젝트 DB` 항목에 연결합니다. 데이터베이스 이름이 다르면 아래 선택값으로 맞춥니다.

```text
NOTION_NOTES_DATA_SOURCE_NAME=노트 DB
NOTION_TASKS_DATA_SOURCE_NAME=할 일 DB
NOTION_PROJECTS_DATA_SOURCE_NAME=프로젝트 DB
NOTION_DIVISIONS_DATA_SOURCE_NAME=부문
NOTION_USE_DEFAULT_TEMPLATES=true
```

각 데이터베이스에 기본 템플릿을 지정해 두면 TSF가 아이콘·기본 레이아웃을 적용한 뒤 작성한 본문을 추가합니다. 이 기능은 Notion connection의 `Insert content`와 `Update content` 권한이 필요합니다. 기본 템플릿이 없는 DB는 기존처럼 일반 페이지로 생성합니다.
- 프로그램, 회원, 방문 기록, 개인 정보의 생성·수정·삭제는 Slack에서 하지 않습니다. 기존 관리자 화면을 사용합니다.
- `TSF_WRITE_ALLOWED_USER_IDS`가 비어 있으면 저장은 기본적으로 차단됩니다. 특정 사용자만 허용하려면 Slack 멤버 ID를 쉼표로 구분해 넣고, 워크스페이스의 모든 사용자에게 허용하려면 `*`를 넣으세요.
- `TSF_WRITE_ALLOWED_CHANNEL_IDS`에는 실제 저장을 허용할 채널 ID를 쉼표로 구분해 넣고, 모든 채널을 허용하려면 `*`를 넣습니다. 이 값이 비어 있으면 모든 저장이 차단됩니다. 어떤 경우에도 초안을 요청한 사용자만 해당 초안을 확인할 수 있습니다.

## 로컬 확인과 배포

```bash
npx supabase functions serve slack-tsf --env-file supabase/functions/slack-tsf/.env.local
npx supabase functions deploy slack-tsf --project-ref erecqalsxoxrufggvmcc --no-verify-jwt
```

Slack 서명 검증 때문에 로컬 호출은 Slack 요청 또는 올바르게 서명한 테스트 요청을 사용해야 합니다. 배포 전에는 TypeScript 검사와 웹앱 `npm run build`를 함께 통과시킵니다.

## 안전 범위

- 조회와 문안 초안을 지원합니다. 실제 웹앱·Notion 쓰기는 짧은 유효시간의 확인 버튼을 누른 경우에만 수행합니다.
- 이름, 연락처, 개별 식별자 등 개인별 상세 자료는 답변하지 않습니다.
- 모델이 임의 SQL이나 임의 테이블을 요청할 수 없고, 서버에 등록된 집계 도구만 호출할 수 있습니다.

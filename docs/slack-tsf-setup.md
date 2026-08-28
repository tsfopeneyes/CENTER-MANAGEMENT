# TSF Slack AI 설치 및 배포

이 프로젝트의 기존 Supabase Edge Functions 구조에 `slack-tsf` 함수를 추가합니다. 함수는 Slack 요청에 먼저 응답한 뒤 백그라운드에서 Notion 문서와 TSF 웹앱의 익명 집계 현황을 조회하고 OpenAI Responses API로 답변을 작성합니다.

웹앱 조회는 기존 화면이나 데이터 구조를 변경하지 않습니다. 같은 Supabase 프로젝트 안에서 허용된 열만 읽고 서버에서 먼저 합계·건수로 집계한 뒤, 개인 식별값을 제외한 결과만 OpenAI API에 전달합니다.

## 준비물

- OpenAI API 키
- Notion 내부 연결(Integration) 키
- Slack 워크스페이스에서 앱을 설치할 권한
- 이 웹앱과 연결된 Supabase 프로젝트 참조값(Project ref)

## 1. Notion 연결

1. Notion에서 내부 연결을 만들고 **Read content** 권한을 켭니다.
2. TSF가 읽어야 할 프로젝트, 할 일, 회의록 등의 원본 데이터베이스를 엽니다.
3. 데이터베이스의 `•••` 메뉴에서 **Connections**에 방금 만든 연결을 추가합니다.
4. 연결 비밀값을 `NOTION_API_KEY`로 준비합니다.

공유되지 않은 페이지와 데이터 소스는 API 검색 결과에 나타나지 않습니다.

질문과 검색된 Notion 문서 일부는 답변 생성을 위해 OpenAI API로 전송됩니다. 주민등록번호, 계좌정보, 건강정보처럼 AI 처리에 불필요한 민감정보가 있는 데이터베이스는 연결에 공유하지 마세요.

## 2. 서버 비밀값 등록

`supabase/functions/slack-tsf/.env.example`을 `.env.local`로 복사하고 실제 값을 입력합니다. `.env.local`은 Git에서 제외됩니다.

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
NOTION_API_KEY=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_ALLOWED_TEAM_ID=T0123456789
TSF_WEBAPP_DATA_ENABLED=true
```

`SLACK_ALLOWED_TEAM_ID`는 선택값이지만 한 워크스페이스에서만 쓸 때 설정을 권장합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set --env-file supabase/functions/slack-tsf/.env.local
```

이 값들은 `VITE_` 접두사를 붙이지 않습니다. 브라우저로 전달되는 환경 변수에 서버 비밀값을 넣으면 안 됩니다.

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 배포된 Supabase Edge Function에 자동으로 제공되므로 별도로 복사하지 않습니다. 웹앱 집계 조회를 즉시 중지해야 하면 `TSF_WEBAPP_DATA_ENABLED=false`로 바꾸고 비밀값을 다시 등록합니다.

## 3. 웹앱 데이터 조회 범위

TSF가 읽는 웹앱 데이터는 다음 집계로 제한됩니다.

- 이용 기록: 기간별 입실·퇴실·공간 이동 건수, 고유 이용자 수, 장소별 건수
- 이용자 현황: 전체·역할별·학교별 인원수
- 프로그램: 최근 프로그램 제목·상태와 신청 상태별 건수
- 대여: 공간별·상태별 예약 건수
- 하이픈/스토어: 거래 건수·순증감과 주문 상태별 건수
- 설문/피드백: 유형별 제출 건수

이름, 전화번호, 이메일, 생년월일, 개인 메모, 메시지, 설문 자유서술 내용은 조회하거나 OpenAI API로 보내지 않습니다. 소스 코드에는 쓰기·수정·삭제 요청이 없으며 데이터베이스 조회만 수행합니다.

## 4. Edge Function 배포

```bash
npx supabase functions deploy slack-tsf --no-verify-jwt
```

배포 후 주소는 다음과 같습니다.

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/slack-tsf
```

브라우저에서 이 주소를 열어 아래 응답이 나오면 함수가 배포된 것입니다.

```json
{"ok":true,"service":"slack-tsf"}
```

## 5. Slack 앱 생성

1. `slack-app-manifest.yaml`의 `YOUR_PROJECT_REF` 두 곳을 실제 Supabase Project ref로 바꿉니다.
2. Slack API의 **Create New App → From an app manifest**에서 YAML을 붙여 넣습니다.
3. **Basic Information → App Credentials**의 Signing Secret을 `SLACK_SIGNING_SECRET`에 넣습니다.
4. **OAuth & Permissions → Install to Workspace**를 실행합니다.
5. 발급된 Bot User OAuth Token(`xoxb-...`)을 `SLACK_BOT_TOKEN`에 넣습니다.
6. 바뀐 비밀값을 다시 등록합니다.

```bash
npx supabase secrets set --env-file supabase/functions/slack-tsf/.env.local
```

Slack은 이벤트 URL을 저장할 때 `url_verification`을 보냅니다. 함수가 배포되고 Signing Secret이 정확해야 검증이 통과합니다.

## 6. 사용 확인

봇을 테스트할 채널에 초대한 후 다음 두 방법을 확인합니다.

```text
@TSF 오픈아이즈 프로젝트 진행 상황 알려줘
```

멘션 답변은 해당 메시지의 스레드에 공개됩니다.

```text
/tsf 지난주 회의록 요약해줘
```

슬래시 명령 답변은 명령을 실행한 사용자에게만 보이는 비공개(ephemeral) 메시지로 반환됩니다.

웹앱 집계 질문 예시는 다음과 같습니다.

```text
@TSF 오늘 센터 이용 현황 알려줘
/tsf 이번 달 프로그램 신청 현황 정리해줘
/tsf 지난달 대여와 하이픈 스토어 현황 알려줘
```

멘션 답변은 채널에 공개될 수 있으므로 TSF는 두 방식 모두 개인별 상세정보를 반환하지 않고 집계값만 답합니다.

## 문제 해결

- `401 Invalid Slack signature`: Signing Secret이 다르거나 서버 시간이 크게 어긋났습니다.
- Notion 검색 결과 없음: 원본 페이지/데이터베이스가 Notion 연결에 공유됐는지 확인합니다.
- `missing_scope`: 앱을 다시 설치해 `app_mentions:read`, `chat:write`, `commands` 권한을 반영합니다.
- 답변이 오지 않음: Supabase Dashboard의 Edge Function 로그에서 `slack-tsf` 오류를 확인합니다.

## 로컬 확인

```bash
npx supabase functions serve slack-tsf --env-file supabase/functions/slack-tsf/.env.local --no-verify-jwt
```

Slack 서명은 원문 본문과 타임스탬프를 사용하므로 일반 브라우저 POST만으로는 실제 Slack 요청을 흉내 낼 수 없습니다. 배포 전에는 GET 상태 확인과 타입 검사를 하고, 실제 Slack 앱 설치 후 멘션과 슬래시 명령을 각각 한 번씩 확인합니다.

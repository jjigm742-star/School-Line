# School Line 통계 1.7 — GitHub + Render 영구저장 배포

이 빌드는 기존 1.6 통계 파일을 가져오지 않습니다. PostgreSQL의 `school_line_matches` 테이블을 새 통계 1.7의 유일한 원본으로 사용합니다.

## 핵심 원칙

- GitHub: 코드/정적 파일만 보관
- Render Web Service: 게임 서버 실행만 담당
- PostgreSQL: 경쟁전 원본 경기와 고정 계정의 유일한 영구 저장소
- `data/` 폴더의 런타임 JSON 저장은 사용하지 않음
- DB가 없거나 연결에 실패하면 서버는 시작 자체를 거부함
- DB 연결이 끊긴 상태에서는 경쟁전 시작을 차단함
- 끝난 경쟁전은 DB INSERT가 성공하기 전까지 `recorded=true`가 되지 않으며 자동 재시도함
- 같은 `match_id`를 재전송해도 PRIMARY KEY + `ON CONFLICT DO NOTHING`으로 중복 저장되지 않음

## Render 환경변수

필수:

`DATABASE_URL=postgresql://...`

`DATABASE_URL` 대신 `SCHOOL_LINE_DATABASE_URL`도 사용할 수 있습니다.

DB 제공자가 SSL을 URL의 `sslmode=require`로 지정하면 그대로 사용합니다. 별도 강제가 필요할 때만 `SCHOOL_LINE_DATABASE_SSL=require` 또는 `disable`을 설정합니다.

## Render Build / Start

저장소 루트에 `package.json`이 있으므로 Node 서비스에서 의존성 `pg`를 설치해야 합니다.

- Build Command: `npm install`
- Start Command: `npm start`

기존 Start Command가 `node server.js`라면 그대로 사용해도 됩니다. 단, 빌드 단계에서 `npm install`이 실행되어야 합니다.

## 최초 실행

서버가 시작되면 자동으로 다음 테이블을 생성합니다.

- `school_line_matches`: 경기별 완전 원본 JSONB, `match_id` PK
- `school_line_player_accounts`: 고정 계정/PIN
- `school_line_meta`: DB 스키마 메타데이터

계정 테이블이 비어 있을 때만 `data/player_accounts_seed.json`을 최초 seed로 넣습니다. 이후 관리자 화면에서 수정한 이름/PIN은 PostgreSQL에 저장되며 GitHub 재배포와 무관합니다.

## 통계 버전

이번 빌드는 이전 1.6 통계를 버리고 새 통계를 `1.7`에서 시작합니다.

- 현재 Alpha 1.6.2 gameplay build → 통계 1.7 (이번 1회 reset mapping)
- 향후 gameplay 1.7.x → 통계 1.7
- 향후 gameplay 1.8.x → 통계 1.8
- 향후 gameplay 2.0.x → 통계 2.0

하드코딩된 `[1.4, 1.5, 1.6]` 버전 목록은 제거했습니다. 관리자 통계 버전 선택기는 DB에 실제 존재하는 버전 + 현재 버전을 자동 표시합니다.

## 신캐릭터

모든 경기 원본에 다음을 저장합니다.

- `availableCharacters`: 그 경기에서 실제 선택 가능했던 캐릭터 ID 목록
- `rosterSnapshot`: ID별 이름/역할 snapshot
- `rosterVersion`

따라서 같은 통계 버전 도중 신캐가 추가되어도 신캐의 `availableMatches`는 출시 이후 경기부터만 증가합니다. 과거 경기까지 분모에 넣지 않습니다.

## 관리자 통계 / JSON 백업

첫 입장 화면에 `📊 관리자 통계` 버튼이 있습니다. 방/WebSocket에 들어가지 않아도 열 수 있습니다.

통계창의 최상단 헤더는 스크롤 영역과 분리되어 있으며 `💾 전체 기록 JSON 백업` 버튼이 항상 보입니다. 이 버튼은 PostgreSQL을 다시 읽은 뒤 전체 원본을 JSON으로 내려줍니다.

관리자 화면에는 PostgreSQL 연결 상태, 마지막 성공 저장 시각, 저장 대기 건수도 표시됩니다.

## 배포 전 검증 체크

1. PostgreSQL 연결 상태가 🟢인지 확인
2. 테스트 경쟁전 1판 종료
3. 관리자 통계가 1판인지 확인
4. JSON 백업 다운로드 후 `matches`에 1판이 있는지 확인
5. GitHub에 UI 한 글자만 수정하여 Render 재배포
6. 재배포 뒤 관리자 통계가 여전히 1판인지 확인
7. 테스트 경쟁전 한 판 더 종료 → 2판인지 확인

6번이 통과하기 전에는 실전 학생 데이터를 다시 쌓지 않는 것을 권장합니다.

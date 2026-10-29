# School Line 1.10 — GitHub 간소화본

최신 1.10(28종 로스터)의 **실행에 필요한 파일만** 남긴 배포 소스입니다.

- 원본: `SchoolLine_v1.10_latest_source_reissued_20261028.zip` (123개 파일)
- 전투 규칙·캐릭터 수치·경쟁전 기록 규칙·화면 UI·이미지 파일: **원본 그대로**
- 개발 기록과 22개 회귀 테스트는 별도의 개발 자료 보관 ZIP으로 이동했습니다.
- `package.json`의 테스트 스크립트는 테스트 파일이 없으므로 제외했습니다. `npm run check`와 `npm start`는 유지합니다.
- 이미지 파일 56개는 `public/game.js`에서 각각의 경로를 참조하므로 합치지 않았습니다.

## GitHub 업로드

ZIP을 **압축 해제**한 뒤, 이 폴더 안의 파일과 `public` 폴더를 **저장소 최상위**에 업로드하세요. **ZIP 파일을 그대로 GitHub에 업로드하면 웹사이트가 실행되지 않습니다.** 파일과 하위 폴더 구조를 유지해야 합니다.

## 실행

Node.js 20 이상 필요.

```bash
npm install
npm run check
npm start
```

운영 시 PostgreSQL 연결용 `DATABASE_URL` 또는 `SCHOOL_LINE_DATABASE_URL` 환경변수가 필요합니다. `.env.example`을 참고하세요. 로컬 `.env`와 실제 DB 비밀번호는 GitHub에 업로드하지 마세요.

## 구성

- `server.js` — 게임 서버 및 전투·경쟁전 로직
- `durable_store.js` — PostgreSQL 영속 데이터 저장
- `package.json` — Node.js 설정 및 실행
- `DATABASE_SCHEMA.sql` — 데이터베이스 참조 스키마
- `public/index.html`, `public/game.js`, `public/style.css` — UI와 게임 화면
- `public/latest-patch.json` — 최신 패치노트
- `public/assets/characters/` — 28종 × (일러스트 + 미니미)

## 주의

**배포 파일 정리만 수행했습니다.** 캐릭터의 밸런스, 스킬, 신규 기능은 추가하거나 변경하지 않았습니다. 실제 운영 서버 배포는 하지 않았습니다.

다음 버전 개발이나 회귀 검증이 필요하면 별도 **개발 자료 보관 ZIP**에 있는 `tests/` 및 패치 기록을 복원해 사용하세요.

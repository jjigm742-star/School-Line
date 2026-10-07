통계 1.7 영구저장 리셋 빌드

이번 빌드는 사용자의 요청에 따라 기존 1.6 통계 14판을 가져오지 않고 0판부터 새 통계 1.7을 시작합니다. 게임플레이 밸런스 수치 자체는 제공받은 Alpha 1.6.2 최신 빌드 그대로 유지했습니다.

가장 큰 변경점은 저장 계층입니다. 경기 원본과 고정 계정은 Render 로컬 파일이 아니라 PostgreSQL에 저장됩니다. GitHub push, Render redeploy/restart, Free 인스턴스 교체가 일어나도 이미 DB commit된 경기 기록은 영향을 받지 않습니다. 로컬 JSON fallback은 의도적으로 제거했으며 DATABASE_URL이 없으면 서버가 시작되지 않습니다.

경기 종료 기록은 stable match_id로 PostgreSQL에 INSERT되고, 성공하기 전에는 recorded 완료로 처리하지 않습니다. 실패 시 자동 재시도하며 완료되지 않은 경쟁전 결과가 있는 방은 DB 저장 성공 전 자동 삭제되지 않습니다. match_id는 PK라 재시도 중복도 차단됩니다.

관리자 통계는 첫 입장 화면에서 바로 열 수 있고 방/WebSocket 연결이 필요하지 않습니다. 통계창 최상단 고정 헤더에 전체 JSON 백업 버튼이 항상 보입니다. 버전 목록은 DB 데이터에서 자동 생성되며 현재 1.7, 향후 1.8 등 major.minor 단위로 자동 분리됩니다. 신캐 추가 시 경기별 availableCharacters/rosterSnapshot으로 출시 이후 경기만 신캐의 가능 경기 분모에 들어갑니다.

배포 전 README_DEPLOY_STATS_1.7.md의 DB 환경변수와 재배포 유지 검증 절차를 반드시 확인하십시오.

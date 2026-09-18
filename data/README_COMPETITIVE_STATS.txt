School Line Alpha 1.3 경쟁게임 통계 저장 폴더

- 서버는 완료된 경쟁게임이 처음 발생하면 이 폴더에 competitive_stats.json을 자동 생성합니다.
- 일반게임 결과는 이 파일에 기록하지 않습니다.
- 이후 누적 패치를 기존 폴더 위에 덮어쓸 때 competitive_stats.json은 보존하세요.
- 배포 폴더를 매번 새로 만드는 경우에는 기존 competitive_stats.json을 새 버전의 data 폴더로 복사하면 누적 통계가 이어집니다.
- 다른 고정 저장 위치를 쓰려면 SCHOOL_LINE_DATA_DIR 환경변수를 설정할 수 있습니다.
- 로비의 "🔒 관리자 통계" 버튼은 관리자 암호 인증을 통과한 연결에서만 집계표를 표시합니다. 관리자 암호는 서버에 평문 저장하지 않고 해시 비교합니다.
- 공개 /competitive-stats.json 경로는 403으로 차단됩니다. 인증된 관리자 통계 화면의 "전체 기록 JSON 저장" 버튼으로만 현재 누적 원본 기록을 내보낼 수 있습니다.


[통계 스키마 v2]
- 신캐/로스터 변경을 안전하게 누적하기 위해 캐릭터별 availableMatches를 저장합니다.
- 밴률/픽률은 해당 캐릭터가 실제 사용 가능했던 경기 수를 분모로 계산합니다.
- 각 경기에는 gameVersion / buildId / rosterVersion / availableCharacters가 함께 저장됩니다.
- 신캐 추가 패치를 적용할 때 기존 competitive_stats.json은 그대로 두세요. 새 캐릭터는 자동으로 0경기에서 시작하고 출시 이후 경기부터 누적됩니다.
- 패치별 원본 분석을 위해 실제 밸런스/로스터 변경 시 서버 코드의 buildId/rosterVersion도 함께 갱신합니다.

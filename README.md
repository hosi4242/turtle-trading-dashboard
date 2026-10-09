# Turtle Trading Dashboard — v2.3.1 Mock UI

첨부된 `Turtle_Trading_Dashboard_Final_Technical_Spec_v2_3_1_Kiwoom_FINAL.md`의 Phase 1~2 범위를 바탕으로 만든 프론트엔드 시현판입니다.

## 현재 구현 범위
- 대시보드 / 관심종목 / 상세분석 / 데이터 상태 / 설정 화면
- 명세서의 삼성전자·SK하이닉스·현대차 Mock 가격 및 기준값
- 상태 배지와 20일·55일 진입 시스템 선택
- 수동 포지션 입력, 2N Stop 및 다음 Pyramid 가격 계산
- 포지션 사이징 참고 계산과 자본 기준 실효 최대 Unit
- 관심종목 샘플 추가·삭제 및 검색
- 실제 시세가 아니라는 고정 배너와 주문 미실행 안전 문구
- DEMO 빌드 시 별도 `dist-demo/` 출력

## 실행 방법 (Windows)
1. Node.js LTS를 설치합니다.
2. 압축을 푼 폴더에서 명령 프롬프트 또는 PowerShell을 엽니다.
3. 다음 명령을 순서대로 실행합니다.

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 엽니다.

## 빌드
```bash
npm run build
npm run build:demo
```

- `npm run build`: 일반 Mock 프론트 `dist/`
- `npm run build:demo`: Cloudflare Pages용 DEMO 정적 빌드 `dist-demo/`

Cloudflare Pages DEMO 프로젝트 설정:
- Build command: `npm run build:demo`
- Build output directory: `dist-demo`

## 중요 제한 사항
이 패키지는 프론트엔드 Mock 시현판입니다. 키움 REST/실시간 API, FastAPI 백엔드, SQLite, SSE, 실시간 토큰 발급, 실제 종목 검색, 자동 백업·복구·보안 검사 및 Test A~Y 전체는 아직 구현되어 있지 않습니다. 데이터 상태 화면에 해당 항목을 미구현으로 표시합니다.

실제 운영판을 만들기 전에는 명세서 §13의 공식 API Gate를 검증하고, 별도의 로컬 백엔드 구현과 보안·회귀 테스트를 진행해야 합니다. 이 화면은 투자 조언이나 주문 기능을 제공하지 않습니다.

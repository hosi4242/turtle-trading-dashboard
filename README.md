# Turtle Trading Dashboard — v2.3.1

이 저장소는 대시보드 프론트엔드와 Cloudflare Worker 기반 키움 REST API 연결 코드를 포함합니다. 프론트엔드에는 Mock 기준값이 남아 있을 수 있으므로, 실제 시세는 Worker의 시세 API 응답이 성공한 경우에만 실제 데이터로 취급해야 합니다. 주문 실행 기능은 제공하지 않습니다.

## 로컬 실행
```bash
npm install
npm run dev
```

## 빌드
```bash
npm run build
```

빌드 출력 폴더는 `dist/` 하나로 통일했습니다. `wrangler.jsonc`의 Assets 디렉터리도 `./dist`를 사용하므로 빌드 출력과 배포 설정이 일치합니다.

## Cloudflare Workers Builds 설정
- Production branch: 배포 검증을 마친 뒤 `main` 또는 승인된 브랜치 선택
- Build command: `npm run build`
- Deploy command: Wrangler 설정 파일을 사용해 자동 감지되도록 설정
- Build output directory: `dist` (대시보드 UI에 별도 입력란이 있는 경우)
- Worker entry point: `src/worker.ts` (`wrangler.jsonc`에서 지정)

## 런타임 Secrets
Cloudflare Worker의 Production 런타임 Secret 이름:
- `KIWOOM_APP_KEY`
- `KIWOOM_APP_SECRET`

실제 Secret 값은 저장소, 코드, 로그 또는 문서에 기록하지 마세요. Secret 설정을 변경한 뒤에는 최신 배포 버전에서 런타임 설정 진단 API를 확인해야 합니다.

## 진단 주소
- 설정 진단: `/api/kiwoom/config-status`
- 시세 조회: `/api/kiwoom/quote?code=005930`

정상적인 설정 진단 응답은 두 설정 필드가 모두 `true`인 경우입니다. 실제 시세 조회는 키움 API 인증 및 종목 조회가 성공해야 정상 응답합니다. 진단 응답에 Secret 값 자체를 포함하지 마세요.

## 안전 및 제한
이 대시보드는 정보 확인용입니다. 자동 매매나 주문 실행 기능은 포함하지 않습니다. 실계좌 또는 실시간 데이터 사용 전에는 키움 REST API 공식 문서와 계정 권한을 확인하고, 오류 응답을 검증해야 합니다.

# Bugside — 작업 계획

> Next.js · Supabase · Vercel 에러를 하나의 터미널 패널에서 실시간으로 보여주는 CLI 도구

---

## 제품 개요

**핵심 UX**: `npx bugside dev` 실행 → Claude Code 옆 스플릿 패널에 에러 스트림 표시
**타겟**: Next.js + Supabase + Vercel 스택으로 Claude Code를 사용하는 개발자
**가치**: 에러 발생 → 브라우저/대시보드 열기 → 복사 → Claude에 붙여넣기 사이클 제거

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 언어 | TypeScript | 타입 안전성, npm 생태계 |
| 빌드 | tsup | 빠름, zero-config |
| TUI | Ink (React for CLIs) | React 패턴 재사용, 생태계 풍부 |
| CLI 파싱 | commander | 표준 |
| 프록시 | http-proxy | Supabase 인터셉트용 |

---

## 아키텍처

```
npx bugside dev
       |
       +-- Process Spawner
       |     +-- next dev (child process -> stdout/stderr 파이프)
       |     +-- vercel dev (선택적)
       |
       +-- Supabase Proxy
       |     +-- .env.local에서 SUPABASE_URL 읽기
       |     +-- localhost:54320 프록시 시작
       |     +-- next dev 환경변수에 프록시 URL 주입
       |
       +-- Error Parsers
       |     +-- NextjsParser  (런타임 / 빌드 / 하이드레이션)
       |     +-- SupabaseParser (4xx, RLS, relation not found)
       |     +-- VercelParser   (빌드 실패, timeout, env)
       |
       +-- Ink TUI
             +-- 에러 스트림 (실시간)
             +-- Source별 색상 구분 (Next.js=red, Supabase=yellow, Vercel=blue)
```

---

## Phase 1: npm 패키지

### 1-A: 뼈대 (1-2일)

- [ ] `bugside` 레포 초기화 (TypeScript + tsup)
- [ ] `bin/bugside.ts` 진입점, `bugside dev` 커맨드 (commander)
- [ ] Auto-detect: `package.json` 읽어서 next / supabase / vercel 의존성 확인
- [ ] `.env.local` 파서 (SUPABASE_URL, SUPABASE_ANON_KEY 추출)

### 1-B: Next.js 모니터링 (2-3일)

- [ ] `next dev` child process spawn & stdout/stderr 파이프
- [ ] Next.js 에러 포맷 파싱:
  - 런타임 에러 (`Error:`, stack trace)
  - 빌드 에러 (TypeScript, 파일 경로)
  - App Router 경고 (`params is a Promise`, hydration mismatch)
- [ ] 에러에서 파일 경로 + 라인번호 추출

### 1-C: Supabase 인터셉트 (2-3일)

> 핵심 난이도 - 투명 프록시 방식

- [ ] `http-proxy` 기반 로컬 프록시 서버 (`localhost:54320`)
- [ ] next dev 실행 시 `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54320` 환경변수 주입
- [ ] 프록시에서 응답 파싱: 4xx -> 에러 이벤트 emit
- [ ] Supabase 에러 분류:
  - `401` -> RLS 정책 없음
  - `406` -> Accept 헤더 문제
  - `42P01` -> relation not found
  - `permission denied` -> 권한 없음

### 1-D: Vercel 모니터링 (1-2일)

- [ ] `vercel dev` child process spawn (실행 중이면 연결)
- [ ] Vercel CLI 출력 파싱 (빌드 에러, 함수 에러)
- [ ] (선택) Vercel API로 배포 로그 스트리밍 (VERCEL_TOKEN 필요)

### 1-E: Ink TUI (2일)

- [ ] 에러 스트림 레이아웃
- [ ] 에러 카드 컴포넌트 (source 배지, 메시지, 파일 위치)
- [ ] 실시간 카운터 (`3 errors · 0 resolved`)
- [ ] 키보드 단축키: `q` 종료, `c` 에러 초기화

### 1-F: 배포

- [ ] npm 패키지 publish (`bugside`)
- [ ] `npx bugside` 동작 확인
- [ ] README: 설치, 사용법, 스택 감지 방법

---

## Phase 2: Claude Code Plugin 레이어

> Phase 1 완성 후 진행

- [ ] 에러 버퍼를 `~/.bugside/errors.json`에 저장 (rolling 최근 N개)
- [ ] Claude Code `UserPromptSubmit` hook 작성
  - 프롬프트 제출마다 현재 에러를 컨텍스트에 자동 주입
  - 에러가 없으면 아무것도 추가하지 않음
- [ ] `bugside install-hook` 커맨드로 자동 설정
- [ ] Claude Code hooks.json 등록 자동화

---

## MVP 목표 (첫 번째 데모 가능한 상태)

```
npx bugside dev
-> next dev 실행
-> Next.js 에러 파싱해서 오른쪽 패널에 포맷된 출력
-> Supabase / Vercel은 "coming soon" 표시
```

---

## 미결 사항

- Supabase 프록시 방식의 HTTPS 처리 (mkcert 필요 여부)
- Vercel API 로그 스트리밍 vs 로컬 `vercel dev` 파싱 중 우선순위
- 에러 dedup 로직 (같은 에러 반복 출력 방지)
- `next dev`를 bugside가 띄울지 vs 이미 실행 중인 프로세스에 붙을지

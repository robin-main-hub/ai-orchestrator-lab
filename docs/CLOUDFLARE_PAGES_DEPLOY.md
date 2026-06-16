# Cloudflare Pages 배포 — ai-orchestrator-lab desktop

desktop은 정적 Vite SPA다. Vercel 설정(`vercel.json`)을 제거하고 **Cloudflare Pages**로
이관했다. 백엔드(apps/server / dgx)는 배포 대상이 아니며, 배포된 desktop은 클라이언트
전용 — 실 백엔드가 없으면 Assistant Inbox 카드 대부분은 정직한 EMPTY로 뜬다(정상).

## 무엇이 바뀌었나

- `apps/desktop/vercel.json` 삭제.
- `apps/desktop/public/_redirects` 추가 — SPA fallback (`/* /index.html 200`). Vite가
  build 시 `public/`를 `dist/`로 복사하므로 `dist/_redirects`로 들어간다.
- `apps/desktop/wrangler.toml` 추가 — Pages 프로젝트 메타(`pages_build_output_dir = "dist"`).
- `apps/desktop/package.json`에 `deploy:pages` 스크립트 추가.

## 배포 (owner가 로컬에서 — Cloudflare 인증 필요)

Cloudflare 계정 로그인 상태에서:

```bash
# repo 루트에서
pnpm install --frozen-lockfile
cd apps/desktop
pnpm run deploy:pages
```

`deploy:pages` = `build` → `npx wrangler pages deploy dist --project-name=ai-orchestrator-lab`.

처음이면 `wrangler login`(브라우저 OAuth) 또는 `CLOUDFLARE_API_TOKEN` 환경변수가 필요하다.
프로젝트가 없으면 wrangler가 생성 여부를 묻는다(또는 대시보드에서 Pages 프로젝트
`ai-orchestrator-lab`를 미리 만들어도 된다).

> 인증(로그인/토큰 입력)과 도메인 DNS 설정은 **owner가 직접** 한다. 코드/빌드/명령은
> 이 repo가 모두 준비해 둔다.

## 대시보드(Git 연동) 방식 — 선택

Cloudflare Pages를 GitHub repo에 연결할 경우 빌드 설정:

- **Production branch**: `main`
- **Build command**: `pnpm install --frozen-lockfile && pnpm --filter @ai-orchestrator/desktop build`
- **Build output directory**: `apps/desktop/dist`
- **Root directory**: repo 루트(모노레포)
- (Vite/pnpm 자동 감지. Node 20+.)

SPA 라우팅은 `_redirects`가 처리하므로 추가 설정 불필요.

## endruin.com 연결 (owner, Cloudflare에서 관리 중)

1. Pages 프로젝트 → **Custom domains** → `endruin.com` (및 원하면 `www`) 추가.
2. endruin.com이 이미 Cloudflare DNS에 있으므로 CNAME/route는 대시보드에서 자동 제안 →
   적용만 클릭.
3. SSL은 Cloudflare가 자동 발급.

## 주의

- `public/sw.js`(service worker)가 있다 — 배포 도메인에서 캐시가 강하게 잡힐 수 있다.
  배포 후 화면이 안 바뀌면 hard refresh / SW unregister 확인.
- desktop은 백엔드 없이도 뜨지만, provider/server 호출이 필요한 기능은 동작하지 않는다.
  Assistant Inbox 같은 read-only 화면 확인용으로 적합.

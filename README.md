# UniMate

UniMate is a university community application. This repository is currently building its engineering foundation; application frameworks and product functionality have not been scaffolded yet.

## Prerequisites

- Node.js `24.14.0` (see [.node-version](./.node-version))
- pnpm `10.33.0` (pinned in [package.json](./package.json))

## Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm format:check
pnpm verify:changed
pnpm verify
pnpm git-diff
```

Build, typecheck, test, and development tasks will gain work as the application workspaces are implemented.

`pnpm git-diff` writes a review report to `docs/generated/git-diff.md`, including repository status, staged and unstaged tracked diffs, and full additions for untracked non-ignored text files. Binary and unreadable untracked files are listed without rendering their contents. The report may include credentials, tokens, personal data, or other sensitive information; review it before sharing externally. The generated report is ignored by Git and the command does not stage files.

## Environment files

Commit `.env.example` when a real configuration contract exists. Local `.env` and `.env.*` files are ignored; never add real credentials to Git. Keep future Expo-public variables separate from server-only secrets.

## Engineering references

- [Agent guide](./AGENTS.md)
- [Architecture](./docs/engineering/ARCHITECTURE.md)
- [Engineering principles](./docs/engineering/ENGINEERING_PRINCIPLES.md)
- [Foundation implementation plan](./docs/engineering/FOUNDATION_IMPLEMENTATION_PLAN.md)

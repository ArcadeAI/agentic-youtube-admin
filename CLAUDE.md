# Project Rules

## Package Manager
- This is a **bun** project. Always use `bun` and `bunx` — never `npm`, `npx`, `yarn`, or `pnpm`.

## Linting
- **Fix lint errors properly.** Do not suppress them with `biome-ignore` or similar ignore comments. Instead: fix the actual code, configure the rule in `biome.json`, or exclude generated/vendored files from linting.
- Generated code (e.g. `prisma/generated/`) should be excluded from linting in `biome.json`, not suppressed inline.

## Git & Commits
- Do **not** add `Co-Authored-By` or any AI attribution to commit messages.

## General
- Be proactive. Run commands yourself to diagnose issues — don't ask the user to paste output.

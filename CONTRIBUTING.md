# Contributing to BitSage Validator

## Branch Model

We use a **Git Flow–lite** branching strategy:

```
main          ← production-ready, protected
develop       ← integration branch, CI-gated
feature/*     ← feature work → PR to develop
infra/*       ← CI/CD, tooling → PR to main or develop
fix/*         ← bug fixes → PR to develop
release/*     ← release prep → PR to main
hotfix/*      ← urgent prod fixes → PR to main + back-merge to develop
```

### Rules

- **`main`** — requires PR with passing CI checks. No direct pushes.
- **`develop`** — requires passing CI. Features merge here first.
- **Feature branches** — branch from `develop`, PR back to `develop`.
- **Releases** — cut `release/x.y.z` from `develop`, merge to `main` after QA.

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons, etc. |
| `test` | Adding or correcting tests |
| `chore` | Maintenance tasks, dependency updates |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |

### Scopes

Common scopes: `dashboard`, `earnings`, `jobs`, `network`, `proofs`, `obelysk`, `settings`, `contracts`, `cli`, `infra`, `ui`

### Examples

```
feat(dashboard): add real-time GPU utilization chart
fix(obelysk): correct ElGamal key derivation for multi-account
ci(infra): add typecheck step to PR workflow
refactor(ui): migrate Button component to new design tokens
```

## Pull Requests

1. Create a feature branch from `develop`
2. Make your changes with conventional commits
3. Ensure CI passes: `turbo lint && turbo typecheck && turbo build`
4. Open a PR to `develop` using the PR template
5. Request review from the appropriate CODEOWNERS
6. Squash-merge after approval

## Local Development

```bash
# Install dependencies
npm install

# Run the validator app
npm run dev:validator

# Lint, typecheck, and build all packages
turbo lint
turbo typecheck
turbo build
```

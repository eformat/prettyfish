# Contributing

Thanks for contributing to Pretty Fish.

## Ground rules

- Keep changes scoped and intentional.
- Preserve the existing product direction and visual language unless the change is explicitly about redesign.
- Include tests when behavior changes.
- Do not commit build output, local reports, or temporary artifacts.

## Development setup

Prerequisites:

- Node.js 20 or newer
- npm 10 or newer

Install dependencies:

```bash
npm install
```

Create a local env file if you want analytics during development:

```env
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Analytics are disabled when `VITE_POSTHOG_KEY` is unset.

## Common commands

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run e2e
npm run build
```

## Pull requests

- Open an issue first for large features or architectural changes.
- Keep PRs focused; unrelated cleanup should be separate.
- Describe user-facing impact and testing performed.
- Update docs if behavior, setup, or project structure changes.

## Project conventions

- TypeScript first, with explicit types where they improve readability.
- Prefer small pure helpers for state normalization, serialization, and rendering transforms.
- Prefer semantic comments over implementation-commentary. Remove comments that only restate React or TypeScript mechanics.
- Use `data-testid` intentionally for end-to-end coverage.

## Contribution licensing

By submitting a contribution, you agree that your work will be licensed under the Apache License 2.0 used by this repository.

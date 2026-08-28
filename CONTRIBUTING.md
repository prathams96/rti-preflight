# Contributing to RTI Tathya

Work is issue-driven and pull-request-only. Keep each change within the issue it addresses, preserve the repository's product and architecture decisions, and explain any new assumptions in the pull request.

Before opening a pull request, run:

```sh
npm install
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Never commit `.env` files, credentials, real applicant information, or data from a live filing. The prototype boundary excludes live government submissions, identity verification, payments, and statutory guarantees.

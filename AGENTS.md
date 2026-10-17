# ProofStack working agreement

## Task checkpoints and GitHub publication

The repository owner requests a durable checkpoint after every meaningful task and a commit/push of each task's changes to the connected GitHub repository. This is standing authorization for normal commits and pushes in this repository, not deployment, force-push, history rewriting, credential disclosure, or changes to unrelated projects.

- At task start, read `docs/checkpoints/README.md`, the latest linked checkpoint, and relevant instructions. Recheck Git branch, status and remote; do not rely on an earlier session's snapshot.
- At task completion or interruption, write a checkpoint under `docs/checkpoints/` recording scope, changed files, commands and actual outcomes, remaining risks/blockers, and an exact next step. Add its link to the index. Keep historical evidence separate from fresh execution.
- For a completed change, run relevant tests/lint/typecheck and review the diff. Stage the task's source, tests and checkpoint explicitly; inspect already-staged changes to avoid accidentally including another task. Commit with a descriptive message and push to the verified repository/working branch, then read back the remote ref and ensure it matches the local commit.
- Preserve all legitimate project changes across commits, including additions and deletions. Do not silently discard work. An intentional WIP checkpoint may record known failures, but must not be labeled verified, release-ready or deployed.
- Never commit secrets, actual `.env` files, credentials, private keys, user data, database dumps, raw audit evidence, local caches, dependencies or build output. `.env.example` may be committed only as a sanitized template. Check staged paths and run a redacted secret scan before publication.
- On review/test/scan failure, resolve the issue in scope or checkpoint the blocker honestly. On auth/network/push failure, preserve the local checkpoint/commit and report publication as pending; do not claim success, force-push, reset or bypass protections.
- Check hosted CI for the exact pushed SHA and report it separately from local validation. Pending/failed/unavailable CI is not a pass. A checkpoint commit does not authorize deployment or close documented production-readiness risks.
- Do not create an endless series of commits solely to record each commit hash. The Git commit identifies the checkpoint it contains; give the verified SHA/link in the completion response and use it as the next checkpoint's parent reference.

Current intended remote: private `https://github.com/Gdheubs/proofstack.git`. Verify it before each push; do not change visibility. Use the existing authenticated GitHub CLI/credential helper; never place tokens in commands, remote URLs, source files or chat.

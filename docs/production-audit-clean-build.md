# Clean Linux production build audit

## Result and scope

**Passed:** a cold, frozen-lockfile Linux installation, production API build, both production worker builds, and the Next.js production frontend build. No application source or configuration was changed by this audit. This is local Docker evidence, not hosted CI, deployment, production readiness, or a successful live-provider/runtime acceptance test.

The successful run was `clean-linux-20261015T144843Z`, on **October 15, 2026, 14:48:43–14:51:23 UTC**. All command arguments, exit codes, wall-clock durations, and separate logs are retained in `.local/production-audit/clean-linux-20261015T144843Z.json` and matching `clean-linux-20261015T144843Z-*.log` files.

## Source identity and secret boundary

- Snapshot captured at **14:48:43–14:48:44 UTC**, with **728 files / 3,972,565 bytes**. The working tree was intentionally dirty; Git HEAD `69f563e8c9b3da4d14ba3684474d4a2af4225bd2` is context, not the identity of the tested candidate.
- Source fingerprint: `468d7a1caedea4ac996b8a3440fa70e2495f931713fb6868e54ef59dd266daa1`.
- Fingerprint definition: SHA-256 of the UTF-8 concatenation of sorted relative-path records, each formatted as `<file SHA-256><two spaces><relative path><LF>`. The complete per-file inventory is `clean-linux-20261015T144843Z-source-manifest.json` under the evidence directory.
- Inventory came exclusively from `git ls-files --cached --others --exclude-standard -z`, followed by regular-file checks and explicit exclusions. The tracked deletion `artifacts/proofstack/components/community/community-nav.tsx` was not resurrected.
- Exclusions cover `.git`, `.local`, `node_modules`, build outputs/caches, environment files except `.env.example`, private-key/certificate/keystore extensions, credential-file names, and symlinks. No external configuration, credential files, host dependency directories, Docker socket, or live data volumes were mounted.
- Gitleaks **8.30.1** scanned the copied snapshot before container use: **exit 0, zero findings**. The redacted JSON report and log are retained. Scanner binary SHA-256: `17157e2ee8b76fc8b1d8bee607a250e34b8a8023c8bc81822d4b5ee4d78fcb7c`.
- The only container bind mount was the snapshot at `/snapshot`, verified **read-only**. It was copied into the container's own `/work`; all 728 copied files matched byte-for-byte before installation. `/work/node_modules` and `/pnpm-store` did not exist before installation. No ports were published.

The full-tree snapshot is immutable evidence, not a claim that the concurrently edited checkout stayed identical. At the **14:52:39 UTC** comparison, only `.env.example`, `.gitleaks.toml`, and `README.md` differed from captured files; no eligible files had been added. Application source, build configuration, and the lockfile still matched the tested snapshot. By 14:54:54 UTC, `tests/ci-secrets.test.ts` had also changed concurrently; that test was not part of the production artifact builds. This report itself was written afterward. Recheck the manifest against the final candidate before using this evidence for a later revision.

## Exact environment

| Item                           | Measured value                                                            |
| ------------------------------ | ------------------------------------------------------------------------- |
| Pulled image tag               | `node:24-bookworm-slim`                                                   |
| Image ID and repository digest | `sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5` |
| Platform                       | Linux amd64, Debian Bookworm, glibc 2.36                                  |
| Node / npm / pnpm              | `v24.22.0` / `11.19.1` / `11.25.0`                                        |
| Next.js                        | `16.3.8`, Turbopack                                                       |
| Docker Engine                  | `29.8.2`                                                                  |
| Docker VM capacity             | 16 CPUs, 8,128,196,608 bytes RAM                                          |
| Container resource bounds      | 2 CPUs, CPU set `0-1`, 4 GiB RAM, 4 GiB combined RAM+swap limit, 512 PIDs |

The image was explicitly pulled and then instantiated by its inspected image ID. Build prerequisites (`ca-certificates`, Python 3, Make, G++, and Git) and pnpm were installed **inside this disposable container only**. Apt packages were not pinned independently; their actual installed versions remain in the prerequisite log. This proves a dependency-lockfile build, not a bit-for-bit reproducible operating-system toolchain.

Install/build environment was explicit and nonsecret:

```text
CI=true
npm_config_store_dir=/pnpm-store
npm_config_production=false
NODE_ENV=production                 # build commands only
API_INTERNAL_ORIGIN=http://127.0.0.1:8080
NEXT_TELEMETRY_DISABLED=1
```

Development dependencies were deliberately installed because build tools and many frontend packages are declared there. Installation used `--frozen-lockfile --prod=false --store-dir /pnpm-store`, with normal lifecycle scripts and the candidate's existing build-script approval policy; **no `--ignore-scripts`**. The esbuild postinstall actually completed. No database URL, authentication-provider credentials, cloud-storage credentials, or real external service configuration was supplied. No API/worker servers were started.

## Measured gates

Durations are host-observed elapsed seconds, including Docker exec overhead, not CPU time.

| Gate                                              | Command inside the container                                                                 | Exit | Seconds |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---: | ------: |
| Fresh install                                     | `pnpm install --frozen-lockfile --prod=false --store-dir /pnpm-store --reporter append-only` |    0 |  50.516 |
| Library TypeScript build                          | `pnpm run typecheck:libs`                                                                    |    0 |   7.859 |
| API and both workers                              | `pnpm --filter @workspace/api-server run build`                                              |    0 |   1.508 |
| Production frontend, including Next.js TypeScript | `pnpm --filter @workspace/proofstack run build`                                              |    0 |  29.062 |
| API bundle syntax                                 | `node --check artifacts/api-server/dist/index.mjs`                                           |    0 |   0.208 |
| Intelligence worker syntax                        | `node --check artifacts/api-server/dist/intelligence-worker.mjs`                             |    0 |   0.181 |
| Asset-cleanup worker syntax                       | `node --check artifacts/api-server/dist/asset-cleanup-worker.mjs`                            |    0 |   0.155 |

Next.js reported successful compilation, TypeScript completion, and generation of **25/25** static pages; a production `.next/BUILD_ID` was present. It emitted the expected no-build-cache warning. Esbuild emitted bundle-size warnings for the API/intelligence worker; these were not build failures.

The post-build source comparison reported one generated-file difference **inside `/work` only**: `artifacts/proofstack/next-env.d.ts`, generated by Next.js. Accordingly, that strict byte-comparison diagnostic exits 1; it is not concealed as a passed no-change check. The lockfile remained unchanged, with SHA-256 `bccbcaa3aafad360d5dc39df803485bf267053a4d09d948cb50d81281d4cb3a5`. No generated file was copied back to the working checkout. This audit does not substitute for the full repository lint/test/typecheck gates.

## Retained artifacts and verification

All paths below are relative to `.local/production-audit/`:

| Evidence                                                   | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `clean-linux-20261015T144843Z-source.tar.gz`               | `1faa309bd29394e3b3fe5b0d2067418aaf2265372a5727bdc7f85f805cc8717d` |
| `clean-linux-20261015T144843Z-production-artifacts.tar.gz` | `c1f97b896c3f252b51b9212d8dc7dc428d7945503df760ec266a449f179b25b0` |
| `clean-linux-20261015T144843Z-runner.py`                   | `57256641b8bf7c83e3790b3ad660f7ee847da5761813224e16511b4aaff4843f` |

The artifacts archive contains API bundles/source maps/supporting logging workers and the frontend `.next` output, excluding the build cache. It is **9,034,701 compressed bytes**; the complete inventory contains **837 regular files / 43,069,963 uncompressed bytes**. Every retained source-archive member and every retained artifact-archive member was independently checked against its recorded size and SHA-256. Neither archive contains symlink entries. Verification is recorded in `clean-linux-20261015T144843Z-verification.json`; per-artifact hashes are in `clean-linux-20261015T144843Z-artifact-inventory.log`.

| Built entrypoint                |     Bytes | SHA-256                                                            |
| ------------------------------- | --------: | ------------------------------------------------------------------ |
| `dist/index.mjs`                | 4,202,825 | `ef9e536ff6639d2321756802b0f0acb30efbe583943c64e9df3746175eb67c84` |
| `dist/intelligence-worker.mjs`  | 1,646,024 | `f2a35e986a39623adb7b7a3b45849a455e3f914e84c986b473bf253b0f8c7120` |
| `dist/asset-cleanup-worker.mjs` | 1,009,661 | `3fabd2751af4273f36ee8ff5751b5f4fced1ecc7ba42cfce0d4f553e033fec99` |

The archives are build evidence, **not a self-contained deployment image**: external runtime dependencies still require installation and real deployment configuration. Retained copies live in the ignored evidence directory rather than depending on scratch-directory retention.

## Reproduction

The retained Python runner performs source allowlisting, hashing, scanning, image pull/inspection, bounded-container creation, cold installation, builds, artifact retention, and exact-container cleanup. It uses the explicit Windows repository/scratch paths for this machine; review those constants before reusing elsewhere. It never mounts the live checkout.

To reproduce the build portion on Linux against the exact retained source, verify the archive SHA-256 above, extract it into a new empty directory, set `SNAPSHOT` to that directory's absolute path, then run:

```sh
docker run --rm --cpus 2 --cpuset-cpus 0-1 \
  --memory 4g --memory-swap 4g --pids-limit 512 \
  --env CI=true --env npm_config_store_dir=/pnpm-store \
  --env npm_config_production=false \
  --mount "type=bind,source=$SNAPSHOT,target=/snapshot,readonly" \
  --workdir /work \
  node@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 \
  sh -eu -c '
    cp -a /snapshot/. /work/
    test ! -e node_modules && test ! -e /pnpm-store
    apt-get update
    apt-get install -y --no-install-recommends ca-certificates python3 make g++ git
    npm install --global pnpm@11.25.0
    node --version && pnpm --version
    pnpm install --frozen-lockfile --prod=false --store-dir /pnpm-store --reporter append-only
    export NODE_ENV=production API_INTERNAL_ORIGIN=http://127.0.0.1:8080 NEXT_TELEMETRY_DISABLED=1
    pnpm run typecheck:libs
    pnpm --filter @workspace/api-server run build
    pnpm --filter @workspace/proofstack run build
    node --check artifacts/api-server/dist/index.mjs
    node --check artifacts/api-server/dist/intelligence-worker.mjs
    node --check artifacts/api-server/dist/asset-cleanup-worker.mjs
  '
```

Use the retained runner when command-by-command timing/logging and artifact export are required. The shell recipe only rebuilds and removes its container afterward; it does not export its output.

## Earlier attempts and limitations

- `clean-linux-20261015T144323Z` stopped before creating a container because the directory secret scanner flagged an exact historical prose sentence. The redacted report was retained; that sentence contained no credential.
- `clean-linux-20261015T144427Z` completed a genuinely cold frozen installation, but build invocations stopped in pnpm's dependency-state check with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. The installer had used a custom store and `--prod=false`, while subsequent invocations lacked matching persistent package-manager environment. No application compiler failure was reached. The successful run used a **new** container and **new empty** dependency store, retaining consistent `CI`, store, and development-dependency settings. No package-manager checks were bypassed and no source/config workaround was applied.
- The successful snapshot's secret scan has **zero raw findings**, unlike those earlier attempts. The repository's scanner configuration changed concurrently between snapshots; see each retained source manifest rather than treating the attempts as identical sources.
- No production service was contacted or deployed by an audit command. No live database/authentication/storage acceptance, worker job processing, HTTP startup smoke, or hosted CI result is claimed. Network access was available for public image/OS/package retrieval; this was not an egress-policy test.
- All task-owned audit containers were removed and their absence checked. Existing development services, unrelated containers, host dependencies, Git history, and production resources were left untouched.

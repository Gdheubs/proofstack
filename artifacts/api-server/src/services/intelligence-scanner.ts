import type { IntelligenceFinding } from "@workspace/api-zod";
import { git } from "./repository-git";
import { headSchema } from "./repository-input";
import { emptyOutput } from "./intelligence-matching";
const rules = [
  {
    id: "private-key",
    severity: "high",
    test: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    title: "Possible committed private key",
    guidance:
      "Verify privately. If real, revoke or rotate the key, remove it from tracked files, and assess exposure in Git history. Removing the current file does not erase history.",
  },
  {
    id: "credential-token",
    severity: "high",
    test: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|psr_[A-Za-z0-9_-]{43})\b/,
    title: "Possible embedded credential",
    guidance:
      "Verify in a private review. Revoke exposed credentials, replace them with environment-managed secrets, and review access logs and repository history.",
  },
  {
    id: "literal-secret",
    severity: "medium",
    test: /\b(?:password|api[_-]?key|client[_-]?secret|access[_-]?token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i,
    title: "Possible hard-coded secret",
    guidance:
      "Check whether this is a real secret or a test placeholder. Store real secrets outside source control and rotate any exposed value.",
  },
  {
    id: "tls-disabled",
    severity: "high",
    test: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/,
    title: "TLS verification may be disabled",
    guidance:
      "Keep certificate verification enabled in production. Review the surrounding code and trust configuration; this pattern may be test-only.",
  },
  {
    id: "dynamic-eval",
    severity: "medium",
    test: /\beval\s*\(|\bnew\s+Function\s*\(/,
    title: "Dynamic code evaluation requires review",
    guidance:
      "Trace the input source. Avoid evaluating untrusted input; use a parser or a fixed allowlist where possible. This match alone does not establish exploitability.",
  },
];
export function scanText(path: string, content: string): IntelligenceFinding[] {
  const out: IntelligenceFinding[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const r of rules)
      if (r.test.test(line))
        out.push({
          rule: r.id,
          severity: r.severity,
          path,
          line: index + 1,
          title: r.title,
          guidance: r.guidance,
        });
    if (out.length >= 100) return out.slice(0, 100);
  }
  return out;
}
export async function scanCommit(path: string, commit: string) {
  headSchema.parse(commit);
  const out = emptyOutput(
    "bounded-static-rules-v1",
    "Heuristic review hints, not a security certification. Secrets and source excerpts are not included. This scan does not execute code, scan dependencies, query CVE feeds, analyze history, or prove the absence of vulnerabilities.",
  );
  const raw = await git(
    path,
    ["ls-tree", "-r", "-l", "-z", commit],
    "",
    {},
    256 * 1024,
  );
  const files = raw.toString("utf8").split("\0").filter(Boolean);
  const deadline = Date.now() + 45000;
  let bytes = 0;
  for (const [index, entry] of files.entries()) {
    if (index >= 200 || out.findings.length >= 100 || Date.now() > deadline) {
      out.skippedFiles += files.length - index;
      out.truncated = true;
      break;
    }
    const tab = entry.indexOf("\t"),
      file = entry.slice(tab + 1),
      parts = entry.slice(0, tab).trim().split(/\s+/);
    const [mode, type, oid, sizeText] = parts,
      size = Number(sizeText);
    if (
      !["100644", "100755"].includes(mode) ||
      type !== "blob" ||
      !Number.isFinite(size) ||
      size > 32768 ||
      bytes + size > 2 * 1024 * 1024 ||
      file.length > 500 ||
      [...file].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    ) {
      out.skippedFiles++;
      continue;
    }
    headSchema.parse(oid);
    const content = await git(path, ["cat-file", "blob", oid], "", {}, 32768);
    bytes += content.length;
    if (content.includes(0)) {
      out.skippedFiles++;
      continue;
    }
    out.scannedFiles++;
    out.findings.push(
      ...scanText(file, content.toString("utf8")).slice(
        0,
        100 - out.findings.length,
      ),
    );
  }
  out.truncated =
    out.truncated || out.skippedFiles > 0 || out.findings.length >= 100;
  out.summary = `${out.findings.length} review hints across ${out.scannedFiles} text files; ${out.skippedFiles} files skipped. Only commit ${commit} was inspected.`;
  return out;
}

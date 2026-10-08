const credentialPatterns = [
  {
    category: "Supabase secret key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  },
  {
    category: "JWT",
    pattern:
      /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  },
  {
    category: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    category: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  },
  {
    category: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    category: "credential-bearing connection URL",
    pattern: /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^/\s:@]+:[^@\s/]{8,}@/i,
  },
  {
    category: "credential-bearing HTTP URL",
    pattern: /\bhttps?:\/\/[^/\s:@]+:[^@\s/]{12,}@/i,
  },
];

const serverSecretAssignmentPattern =
  /\b(?:SUPABASE_SECRET_KEY|SUPABASE_TEST_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|PRIVATE_KEY))\s*=\s*(?:"([^"]{12,})"|'([^']{12,})'|([^\s#]{12,}))/;
const mobileServerConfigPattern =
  /\b(?:SUPABASE_(?:TEST_)?SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|[A-Z0-9_]*DATABASE_URL|[A-Z0-9_]*DIRECT_URL)\b/;

export function findCredentialFindings(
  filePath,
  content,
  localSupabaseSecretKey,
) {
  const findings = [];

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    let hasCredentialPattern = false;

    for (const { category, pattern } of credentialPatterns) {
      if (pattern.test(line)) {
        findings.push({ line: index + 1, category });
        hasCredentialPattern = true;
      }
    }

    const assignment = serverSecretAssignmentPattern.exec(line);
    const assignmentValue = assignment?.slice(1).find(Boolean);
    if (
      !hasCredentialPattern &&
      assignmentValue !== undefined &&
      !/^(?:your[-_ ]|replace[-_ ]|placeholder\b|example\b|changeme\b|test-only\b|local-only\b|<.*>|\$\{|\.\.\.)/i.test(
        assignmentValue,
      )
    ) {
      findings.push({ line: index + 1, category: "server secret assignment" });
    }

    if (
      typeof localSupabaseSecretKey === "string" &&
      localSupabaseSecretKey.length > 0 &&
      line.includes(localSupabaseSecretKey)
    ) {
      findings.push({
        line: index + 1,
        category: "current local Supabase key",
      });
    }

    if (
      filePath.startsWith("apps/mobile/") &&
      mobileServerConfigPattern.test(line)
    ) {
      findings.push({
        line: index + 1,
        category: "server-only configuration under apps/mobile",
      });
    }
  }

  return findings.filter(
    (finding, index) =>
      findings.findIndex(
        (candidate) =>
          candidate.line === finding.line &&
          candidate.category === finding.category,
      ) === index,
  );
}

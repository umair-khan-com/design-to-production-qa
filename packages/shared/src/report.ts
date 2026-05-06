import type { ComparisonIssue, ComparisonReport, ComparisonReportSummary } from "./types.ts";

function countBySeverity(issues: ComparisonIssue[], severity: ComparisonIssue["severity"]): number {
  return issues.filter((issue) => issue.severity === severity).length;
}

function summarizeIssues(issues: ComparisonIssue[], tolerancePx: number): ComparisonReportSummary {
  const minorIssues = countBySeverity(issues, "minor");
  const majorIssues = countBySeverity(issues, "major");
  const criticalIssues = countBySeverity(issues, "critical");

  return {
    status: criticalIssues > 0 || majorIssues > 0 ? "fail" : minorIssues > 0 ? "warn" : "pass",
    totalIssues: issues.length,
    minorIssues,
    majorIssues,
    criticalIssues,
    tolerancePx,
  };
}

function groupIssues(issues: ComparisonIssue[]): ComparisonReport["issueGroups"] {
  const groups = new Map<string, { code: string; count: number; severity: ComparisonIssue["severity"] }>();

  for (const issue of issues) {
    const key = `${issue.code}:${issue.severity}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    groups.set(key, {
      code: issue.code,
      count: 1,
      severity: issue.severity,
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.severity !== right.severity) {
      const order = { critical: 0, major: 1, minor: 2 };
      return order[left.severity] - order[right.severity];
    }

    return right.count - left.count;
  });
}

function buildIssuePatterns(issues: ComparisonIssue[]): ComparisonReport["issuePatterns"] {
  const groups = new Map<string, {
    code: string;
    severity: ComparisonIssue["severity"];
    count: number;
    samplePaths: string[];
    sampleMessage: string;
  }>();

  for (const issue of issues) {
    const existing = groups.get(issue.code);

    if (existing) {
      existing.count += 1;
      if (existing.samplePaths.length < 3 && !existing.samplePaths.includes(issue.path)) {
        existing.samplePaths.push(issue.path);
      }
      continue;
    }

    groups.set(issue.code, {
      code: issue.code,
      severity: issue.severity,
      count: 1,
      samplePaths: [issue.path],
      sampleMessage: issue.message,
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return left.code.localeCompare(right.code);
  });
}

export function buildComparisonReport(
  tenantId: string,
  projectId: string,
  figmaFileId: string | null | undefined,
  issues: ComparisonIssue[],
  tolerancePx: number,
  designSnapshot: ComparisonReport["designSnapshot"],
  pageSnapshot: ComparisonReport["pageSnapshot"]
): ComparisonReport {
  return {
    tenantId,
    projectId,
    figmaFileId: figmaFileId ?? null,
    summary: summarizeIssues(issues, tolerancePx),
    issueGroups: groupIssues(issues),
    issuePatterns: buildIssuePatterns(issues),
    issues,
    designSnapshot,
    pageSnapshot,
  };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function serializeComparisonIssuesToCsv(issues: ComparisonIssue[]): string {
  const header = ["code", "severity", "path", "message"];
  const rows = issues.map((issue) => [
    escapeCsvCell(issue.code),
    escapeCsvCell(issue.severity),
    escapeCsvCell(issue.path),
    escapeCsvCell(issue.message),
  ]);

  return [header.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
}

function sanitizePdfText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function buildPdfLines(report: ComparisonReport): string[] {
  const lines = [
    `Comparison report`,
    `Tenant: ${report.tenantId}`,
    `Project: ${report.projectId}`,
    `Figma file: ${report.figmaFileId ?? "n/a"}`,
    `Status: ${report.summary.status}`,
    `Tolerance: ${report.summary.tolerancePx}px`,
    `Issues: ${report.summary.totalIssues} total | minor ${report.summary.minorIssues} | major ${report.summary.majorIssues} | critical ${report.summary.criticalIssues}`,
    ``,
    `Issue groups`,
  ];

  for (const group of report.issueGroups) {
    lines.push(`- ${group.code} (${group.severity}): ${group.count}`);
  }

  lines.push(``, `Issues`);

  for (const issue of report.issues) {
    lines.push(`- [${issue.severity}] ${issue.code} @ ${issue.path}: ${issue.message}`);
  }

  lines.push(``, `Pattern drill-down`);

  for (const pattern of report.issuePatterns) {
    lines.push(
      `- ${pattern.code} (${pattern.severity}) x${pattern.count} @ ${pattern.samplePaths.join(", ")}`
    );
    lines.push(`  ${pattern.sampleMessage}`);
  }

  return lines.map(sanitizePdfText);
}

function encodePdfString(value: string): string {
  return `(${sanitizePdfText(value)})`;
}

export function serializeComparisonReportToPdfBytes(report: ComparisonReport): Uint8Array {
  const lines = buildPdfLines(report);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const lineHeight = 14;
  const linesPerPage = Math.max(1, Math.floor((pageHeight - margin * 2) / lineHeight));
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  if (pages.length === 0) {
    pages.push(["Comparison report"]);
  }

  const contentStreams = pages.map((pageLines) => {
    const content: string[] = [];
    content.push("BT");
    content.push("/F1 12 Tf");
    content.push(`${margin} ${pageHeight - margin} Td`);
    content.push(`14 TL`);
    for (let index = 0; index < pageLines.length; index += 1) {
      const line = pageLines[index];
      if (index === 0) {
        content.push(`${encodePdfString(line)} Tj`);
      } else {
        content.push(`T* ${encodePdfString(line)} Tj`);
      }
    }
    content.push("ET");
    return content.join("\n");
  });

  const encoder = new TextEncoder();
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const contentStartId = 4;
  const pageStartId = contentStartId + pages.length;
  const bodyById = new Map<number, string>();

  bodyById.set(catalogId, `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);
  bodyById.set(
    pagesId,
    `${pagesId} 0 obj\n<< /Type /Pages /Kids [${pages
      .map((_, index) => `${pageStartId + index} 0 R`)
      .join(" ")}] /Count ${pages.length} >>\nendobj\n`
  );
  bodyById.set(fontId, `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  for (let index = 0; index < pages.length; index += 1) {
    const contentId = contentStartId + index;
    const pageId = pageStartId + index;
    const stream = contentStreams[index];
    bodyById.set(
      contentId,
      `${contentId} 0 obj\n<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
    bodyById.set(
      pageId,
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );
  }

  const objectCount = pageStartId + pages.length - 1;
  const header = encoder.encode("%PDF-1.4\n");
  const parts: Uint8Array[] = [header];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let offset = header.length;

  for (let id = 1; id <= objectCount; id += 1) {
    const body = bodyById.get(id);

    if (!body) {
      throw new Error(`Missing PDF object ${id}`);
    }

    offsets[id] = offset;
    const bytes = encoder.encode(body);
    parts.push(bytes);
    offset += bytes.length;
  }

  const xrefStart = offset;
  const xrefLines = [
    "xref",
    `0 ${objectCount + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((entry) => `${String(entry).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objectCount + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
  ].join("\n");

  parts.push(encoder.encode(`${xrefLines}\n`));
  const totalLength = parts.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let position = 0;

  for (const chunk of parts) {
    output.set(chunk, position);
    position += chunk.length;
  }

  return output;
}

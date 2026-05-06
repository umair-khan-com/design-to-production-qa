import type {
  ComparisonIssue,
  ComparisonResult,
  DesignNode,
  DesignSnapshotPayload,
  PageElementSnapshot,
  PageSnapshotPayload,
} from "./types.ts";

function issue(
  code: string,
  severity: ComparisonIssue["severity"],
  message: string,
  path: string
): ComparisonIssue {
  return { code, severity, message, path };
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
}

function compareStringValue(
  code: string,
  fieldName: string,
  designValue: string | null | undefined,
  pageValue: string | null | undefined,
  path: string,
  issues: ComparisonIssue[]
): void {
  const normalizedDesign = normalizeText(designValue);
  const normalizedPage = normalizeText(pageValue);

  if (normalizedDesign === normalizedPage) {
    return;
  }

  issues.push(
    issue(
      code,
      normalizedDesign || normalizedPage ? "major" : "minor",
      `${fieldName} differs`,
      path
    )
  );
}

function normalizeColor(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*(?:\.\d+)?)\s*)?\)$/
  );

  if (rgbMatch) {
    const red = Math.round(Number.parseFloat(rgbMatch[1]));
    const green = Math.round(Number.parseFloat(rgbMatch[2]));
    const blue = Math.round(Number.parseFloat(rgbMatch[3]));
    const alpha = rgbMatch[4] === undefined || rgbMatch[4] === "" ? 1 : Number.parseFloat(rgbMatch[4]);

    return `rgba(${red}, ${green}, ${blue}, ${Number.isFinite(alpha) ? alpha : 1})`;
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);

  if (hexMatch) {
    const hex = hexMatch[1];
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : hex.length === 4
          ? hex
              .split("")
              .map((part) => `${part}${part}`)
              .join("")
          : hex;

    if (expanded.length === 6 || expanded.length === 8) {
      const red = Number.parseInt(expanded.slice(0, 2), 16);
      const green = Number.parseInt(expanded.slice(2, 4), 16);
      const blue = Number.parseInt(expanded.slice(4, 6), 16);
      const alpha =
        expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;

      return `rgba(${red}, ${green}, ${blue}, ${Number.isFinite(alpha) ? alpha : 1})`;
    }
  }

  return trimmed;
}

function compareBoxes(
  design: DesignNode,
  page: PageElementSnapshot,
  path: string,
  tolerancePx: number,
  issues: ComparisonIssue[]
): void {
  const dx = Math.abs(design.bounds.x - page.box.x);
  const dy = Math.abs(design.bounds.y - page.box.y);
  const dw = Math.abs(design.bounds.width - page.box.width);
  const dh = Math.abs(design.bounds.height - page.box.height);

  if (dx > tolerancePx || dy > tolerancePx) {
    issues.push(
      issue(
        "layout.position",
        dx > tolerancePx * 2 || dy > tolerancePx * 2 ? "major" : "minor",
        `Position differs by x=${dx}, y=${dy}`,
        path
      )
    );
  }

  if (dw > tolerancePx || dh > tolerancePx) {
    issues.push(
      issue(
        "layout.size",
        dw > tolerancePx * 2 || dh > tolerancePx * 2 ? "major" : "minor",
        `Size differs by width=${dw}, height=${dh}`,
        path
      )
    );
  }
}

function extractPageStyle(page: PageElementSnapshot, property: string): string | null {
  return page.styles?.[property]?.trim() ?? null;
}

function isTextTag(tagName: string): boolean {
  return [
    "span",
    "p",
    "a",
    "label",
    "li",
    "small",
    "strong",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ].includes(tagName);
}

function isContainerTag(tagName: string): boolean {
  return ["main", "div", "section", "article", "nav", "aside", "header", "footer"].includes(tagName);
}

type DesignIntent = "button" | "link" | "input" | "text" | "container";

function inferDesignIntent(design: DesignNode): DesignIntent {
  const name = `${design.name} ${design.text ?? ""}`.trim().toLowerCase();

  if (name.includes("button") || name.includes("cta")) {
    return "button";
  }

  if (name.includes("link")) {
    return "link";
  }

  if (name.includes("input") || name.includes("textfield") || name.includes("text field")) {
    return "input";
  }

  if (design.type === "TEXT") {
    return "text";
  }

  return "container";
}

function inferPageIntent(page: PageElementSnapshot): DesignIntent {
  const role = page.role?.toLowerCase() ?? "";
  const tag = page.tagName.toLowerCase();
  const inputType = page.inputType?.toLowerCase() ?? "";

  if (role === "button" || tag === "button") {
    return "button";
  }

  if (role === "link" || tag === "a") {
    return "link";
  }

  if (role === "textbox" || tag === "input" || tag === "textarea" || tag === "select") {
    return "input";
  }

  if (inputType && tag === "input") {
    return "input";
  }

  if (isTextTag(tag)) {
    return "text";
  }

  return "container";
}

function boxDistance(design: DesignNode, page: PageElementSnapshot): number {
  return (
    Math.abs(design.bounds.x - page.box.x) +
    Math.abs(design.bounds.y - page.box.y) +
    Math.abs(design.bounds.width - page.box.width) +
    Math.abs(design.bounds.height - page.box.height)
  );
}

function scoreCandidate(design: DesignNode, page: PageElementSnapshot): number {
  let score = 0;
  const normalizedDesignText = normalizeText(design.text);
  const normalizedPageText = normalizeText(page.text);
  const designIntent = inferDesignIntent(design);
  const pageIntent = inferPageIntent(page);

  if (normalizedDesignText && normalizedPageText && normalizedDesignText === normalizedPageText) {
    score += 8;
  }

  if (design.type === "TEXT" && isTextTag(page.tagName)) {
    score += 6;
  }

  if (design.type !== "TEXT" && isContainerTag(page.tagName)) {
    score += 3;
  }

  if (designIntent === pageIntent) {
    score += 9;
  } else if (designIntent === "button" && pageIntent === "input") {
    score -= 6;
  } else if (designIntent === "input" && pageIntent === "button") {
    score -= 6;
  } else if (designIntent === "link" && pageIntent !== "link") {
    score -= 4;
  }

  if (design.name.trim().toLowerCase() === page.tagName.toLowerCase()) {
    score += 2;
  }

  if (designIntent === "button" && (page.role === "button" || page.tagName.toLowerCase() === "button")) {
    score += 4;
  }

  if (designIntent === "link" && (page.role === "link" || page.tagName.toLowerCase() === "a")) {
    score += 4;
  }

  if (designIntent === "input" && (page.role === "textbox" || page.tagName.toLowerCase() === "input")) {
    score += 4;
  }

  if (designIntent === "input" && page.placeholder) {
    score += 2;
  }

  const distance = boxDistance(design, page);
  score += Math.max(0, 10 - Math.min(distance / 50, 10));

  return score;
}

function matchChildren(
  designChildren: DesignNode[],
  pageChildren: PageElementSnapshot[]
): Array<{ design: DesignNode; page: PageElementSnapshot; index: number }> {
  const remaining = [...pageChildren];
  const matches: Array<{ design: DesignNode; page: PageElementSnapshot; index: number }> = [];

  for (const designChild of designChildren) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const score = scoreCandidate(designChild, candidate);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0) {
      const [page] = remaining.splice(bestIndex, 1);
      matches.push({ design: designChild, page, index: matches.length });
    }
  }

  return matches;
}

function compareStyles(
  design: DesignNode,
  page: PageElementSnapshot,
  path: string,
  issues: ComparisonIssue[]
): void {
  if (design.type === "TEXT") {
    compareStringValue(
      "style.font-family",
      "Font family",
      design.textStyle?.fontName,
      extractPageStyle(page, "font-family"),
      path,
      issues
    );

    if (typeof design.textStyle?.fontSize === "number") {
      const pageFontSize = extractPageStyle(page, "font-size");
      const parsedPageFontSize = pageFontSize ? Number.parseFloat(pageFontSize) : Number.NaN;

      if (Number.isFinite(parsedPageFontSize) && Math.abs(design.textStyle.fontSize - parsedPageFontSize) > 1) {
        issues.push(
          issue(
            "style.font-size",
            Math.abs(design.textStyle.fontSize - parsedPageFontSize) > 3 ? "major" : "minor",
            `Font size differs by ${Math.abs(design.textStyle.fontSize - parsedPageFontSize)}px`,
            path
          )
        );
      }
    }
  }

  if (design.fills && design.fills.length > 0) {
    const firstFill = design.fills.find((fill) => fill.type === "SOLID" && fill.color);

    if (firstFill?.color) {
      const expected = `rgba(${Math.round(firstFill.color.r * 255)}, ${Math.round(
        firstFill.color.g * 255
      )}, ${Math.round(firstFill.color.b * 255)}, ${firstFill.color.a})`;
      const actual = normalizeColor(extractPageStyle(page, design.type === "TEXT" ? "color" : "background-color"));

      compareStringValue(
        design.type === "TEXT" ? "style.color" : "style.background-color",
        design.type === "TEXT" ? "Text color" : "Background color",
        normalizeColor(expected),
        actual,
        path,
        issues
      );
    }
  }

  if (design.layout) {
    if (typeof design.layout.paddingTop === "number") {
      const pagePaddingTop = extractPageStyle(page, "padding-top");
      const parsed = pagePaddingTop ? Number.parseFloat(pagePaddingTop) : Number.NaN;

      if (Number.isFinite(parsed) && Math.abs(design.layout.paddingTop - parsed) > 1) {
        issues.push(
          issue(
            "style.padding-top",
            Math.abs(design.layout.paddingTop - parsed) > 4 ? "major" : "minor",
            `Padding top differs by ${Math.abs(design.layout.paddingTop - parsed)}px`,
            path
          )
        );
      }
    }

    if (typeof design.layout.paddingLeft === "number") {
      const pagePaddingLeft = extractPageStyle(page, "padding-left");
      const parsed = pagePaddingLeft ? Number.parseFloat(pagePaddingLeft) : Number.NaN;

      if (Number.isFinite(parsed) && Math.abs(design.layout.paddingLeft - parsed) > 1) {
        issues.push(
          issue(
            "style.padding-left",
            Math.abs(design.layout.paddingLeft - parsed) > 4 ? "major" : "minor",
            `Padding left differs by ${Math.abs(design.layout.paddingLeft - parsed)}px`,
            path
          )
        );
      }
    }

    if (typeof design.layout.itemSpacing === "number") {
      const pageGap = extractPageStyle(page, "gap");
      const parsed = pageGap ? Number.parseFloat(pageGap) : Number.NaN;

      if (Number.isFinite(parsed) && Math.abs(design.layout.itemSpacing - parsed) > 1) {
        issues.push(
          issue(
            "style.gap",
            Math.abs(design.layout.itemSpacing - parsed) > 4 ? "major" : "minor",
            `Item spacing differs by ${Math.abs(design.layout.itemSpacing - parsed)}px`,
            path
          )
        );
      }
    }
  }
}

function compareText(
  design: DesignNode,
  page: PageElementSnapshot,
  path: string,
  issues: ComparisonIssue[]
): void {
  if ((design.text ?? null) !== (page.text ?? null)) {
    issues.push(
      issue(
        "content.text",
        design.text || page.text ? "major" : "minor",
        "Text content differs",
        path
      )
    );
  }
}

function compareNode(
  design: DesignNode,
  page: PageElementSnapshot,
  path: string,
  tolerancePx: number,
  issues: ComparisonIssue[]
): void {
  if (design.children.length === 0 && page.children.length === 0) {
    compareBoxes(design, page, path, tolerancePx, issues);
    compareText(design, page, path, issues);
    return;
  }

  if (design.children.length !== page.children.length) {
    issues.push(
      issue(
        "structure.child-count",
        Math.abs(design.children.length - page.children.length) > 1 ? "major" : "minor",
        `Child count differs: design=${design.children.length}, page=${page.children.length}`,
        path
      )
    );
  }

  compareBoxes(design, page, path, tolerancePx, issues);
  compareText(design, page, path, issues);
  compareStyles(design, page, path, issues);

  const matches = matchChildren(design.children, page.children);
  for (const match of matches) {
    compareNode(
      match.design,
      match.page,
      `${path}.children[${match.index}]`,
      tolerancePx,
      issues
    );
  }
}

export function compareDesignToPage(
  designSnapshot: DesignSnapshotPayload,
  pageSnapshot: PageSnapshotPayload,
  tolerancePx = 5
): ComparisonResult {
  const issues: ComparisonIssue[] = [];
  const designRoots = designSnapshot.nodes;
  const pageRoots = pageSnapshot.roots;

  if (designRoots.length !== pageRoots.length) {
    issues.push(
      issue(
        "structure.root-count",
        Math.abs(designRoots.length - pageRoots.length) > 1 ? "major" : "minor",
        `Root count differs: design=${designRoots.length}, page=${pageRoots.length}`,
        "roots"
      )
    );
  }

  const length = Math.min(designRoots.length, pageRoots.length);
  for (let index = 0; index < length; index += 1) {
    compareNode(designRoots[index], pageRoots[index], `roots[${index}]`, tolerancePx, issues);
  }

  const hasCritical = issues.some((entry) => entry.severity === "critical");
  const hasMajor = issues.some((entry) => entry.severity === "major");
  const hasMinor = issues.some((entry) => entry.severity === "minor");

  return {
    tenantId: designSnapshot.tenantId,
    projectId: designSnapshot.projectId,
    status: hasCritical || hasMajor ? "fail" : hasMinor ? "warn" : "pass",
    issues,
  };
}

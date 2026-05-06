import type { ComparisonResult, DesignSnapshotPayload } from "@d2p/shared";
import { validateDesignSnapshot as validateDesignSnapshotPayload } from "@d2p/shared";

export function validateDesignSnapshot(payload: DesignSnapshotPayload): boolean {
  return validateDesignSnapshotPayload(payload).valid;
}

export function createEmptyComparisonResult(
  tenantId: string,
  projectId: string
): ComparisonResult {
  return {
    tenantId,
    projectId,
    status: "pass",
    issues: [],
  };
}

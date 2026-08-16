export type BundledLoadFileAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
  bundleLoadNodeId?: string;
};

export type BundledLoadSnapshot<F extends BundledLoadFileAsset = BundledLoadFileAsset> = {
  value: string;
  files: F[];
};

export type WorkflowWithBundledLoads<F extends BundledLoadFileAsset = BundledLoadFileAsset> = {
  files?: F[];
  bundledLoads?: Record<string, { value: string }>;
};

export function workflowInputFiles<F extends BundledLoadFileAsset>(workflow: WorkflowWithBundledLoads<F>) {
  return (workflow.files || []).filter((file) => !file.bundleLoadNodeId);
}

export function bundledLoadResult<F extends BundledLoadFileAsset>(
  workflow: WorkflowWithBundledLoads<F>,
  nodeId: string,
): BundledLoadSnapshot<F> | null {
  const snapshot = workflow.bundledLoads?.[nodeId];
  if (!snapshot) return null;
  const files = (workflow.files || [])
    .filter((file) => file.bundleLoadNodeId === nodeId)
    .map((file) => {
      const copy = { ...file };
      delete copy.bundleLoadNodeId;
      return copy;
    });
  return { value: snapshot.value, files };
}

export function applyBundledLoadSnapshots<
  F extends BundledLoadFileAsset,
  W extends WorkflowWithBundledLoads<F>,
>(workflow: W, snapshots: Record<string, BundledLoadSnapshot<F>>): W {
  const regularFiles = workflowInputFiles(workflow);
  const bundledLoads = Object.fromEntries(
    Object.entries(snapshots).map(([nodeId, snapshot]) => [nodeId, { value: snapshot.value }]),
  );
  const loadFiles = Object.entries(snapshots).flatMap(([nodeId, snapshot]) =>
    snapshot.files.map((file) => ({ ...file, bundleLoadNodeId: nodeId })),
  );
  return { ...workflow, files: [...regularFiles, ...loadFiles], bundledLoads } as W;
}

function materializedPathSegment(value: string, fallback: string) {
  return value.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_.-]+/gu, "-").replace(/^-+|-+$/g, "") || fallback;
}

export function materializedLoadDirectory(
  workflow: { id: string; name: string },
  node: { id: string; name: string },
) {
  const workflowFolder = `${materializedPathSegment(workflow.name, "workflow")}-${materializedPathSegment(workflow.id, "id")}`;
  const nodeFolder = `${materializedPathSegment(node.name, "load")}-${materializedPathSegment(node.id, "node")}`;
  return `user-data/workflow-files/${workflowFolder}/${nodeFolder}`;
}

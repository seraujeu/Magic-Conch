export type SchedulerPort = { id: string; multiple?: boolean };

export type SchedulerEdge = {
  from: string;
  fromPort?: string;
  toPort?: string;
};

export type NodeActivation = {
  nodeType: string;
  inputPorts: SchedulerPort[];
  incoming: SchedulerEdge[];
  emittedPortKeys: ReadonlySet<string>;
};

export const DEFAULT_WORKFLOW_PARALLELISM = 4;
export const MIN_WORKFLOW_PARALLELISM = 1;
export const MAX_WORKFLOW_PARALLELISM = 32;

export type WorkflowTaskLimiter = {
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

export type WorkflowParallelism = number | (() => number);

export function normalizeWorkflowParallelism(value: unknown) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_WORKFLOW_PARALLELISM;
  return Math.max(MIN_WORKFLOW_PARALLELISM, Math.min(MAX_WORKFLOW_PARALLELISM, parsed));
}

function resolveWorkflowParallelism(parallelism: WorkflowParallelism) {
  return normalizeWorkflowParallelism(typeof parallelism === "function" ? parallelism() : parallelism);
}

/**
 * Runs a list with bounded parallelism while preserving result order.
 * Once one item fails, no additional queued items are started.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  parallelism: WorkflowParallelism,
  task: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  const workerCount = Math.min(resolveWorkflowParallelism(parallelism), items.length);
  let nextIndex = 0;
  let stopped = false;
  let hasError = false;
  let firstError: unknown;

  const workers = Array.from({ length: workerCount }, async () => {
    while (!stopped) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await task(items[index], index);
      } catch (error) {
        stopped = true;
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
  });

  await Promise.all(workers);
  if (hasError) throw firstError;
  return results;
}

/**
 * Shares one concurrency budget across nested reusable workflows. Workflow
 * container nodes do not acquire a permit; their executable child nodes do.
 */
export function createWorkflowTaskLimiter(parallelism: WorkflowParallelism): WorkflowTaskLimiter {
  const queue: Array<{
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let active = 0;

  const drain = () => {
    while (active < resolveWorkflowParallelism(parallelism) && queue.length) {
      const entry = queue.shift()!;
      active += 1;
      Promise.resolve()
        .then(entry.task)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return {
    run<T>(task: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        queue.push({
          task,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        drain();
      });
    },
  };
}

const PULL_SOURCE_NODE_TYPES = new Set(["load", "list-directory", "update-memory"]);

function portValueKey(nodeId: string, portId: string) {
  return `${nodeId}:${portId}`;
}

/**
 * Determines whether a topologically ready node is on an active data path.
 *
 * Load nodes are pull-style sources: when one of their outputs is required by
 * the reachable graph, they may run from their saved configuration without a
 * trigger. Connecting any input (including trigger) makes that edge gate the
 * node in the same way as every other workflow node.
 */
export function isWorkflowNodeActive({
  nodeType,
  inputPorts,
  incoming,
  emittedPortKeys,
}: NodeActivation) {
  if (!incoming.length) {
    return inputPorts.length === 0 || PULL_SOURCE_NODE_TYPES.has(nodeType);
  }

  // Join/Aggregate is an optional-input barrier. Once all of its upstream
  // nodes have settled, it must run even when a routed branch emitted no
  // value. The executor will aggregate only the values that did arrive (or
  // produce the operation's empty result when none did).
  if (nodeType === "join") return true;

  const activeIncoming = incoming.filter((edge) =>
    emittedPortKeys.has(portValueKey(edge.from, edge.fromPort || "")),
  );
  if (!activeIncoming.length) return false;

  return inputPorts.every((port) => {
    const portEdges = incoming.filter((edge) => edge.toPort === port.id);
    return !portEdges.length
      || Boolean(port.multiple)
      || portEdges.some((edge) => activeIncoming.includes(edge));
  });
}

export const DEFAULT_FILE_PROCESSING_BUDGET_BYTES = 32 * 1024 * 1024;

export type WorkflowResourceLimiter = {
  run: <T>(cost: number, task: () => Promise<T>) => Promise<T>;
};

/**
 * Bounds the combined attachment bytes held by expensive browser-side tasks.
 * A single task larger than the budget is allowed to run alone.
 */
export function createWorkflowResourceLimiter(
  budget = DEFAULT_FILE_PROCESSING_BUDGET_BYTES,
): WorkflowResourceLimiter {
  const maximum = Math.max(1, Math.trunc(budget));
  const queue: Array<{
    cost: number;
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let activeCost = 0;
  let activeTasks = 0;

  const drain = () => {
    while (queue.length) {
      const entry = queue[0];
      const cost = Math.max(1, Math.trunc(entry.cost));
      if (activeTasks && activeCost + Math.min(cost, maximum) > maximum) return;
      queue.shift();
      activeTasks += 1;
      activeCost += Math.min(cost, maximum);
      Promise.resolve()
        .then(entry.task)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          activeTasks -= 1;
          activeCost -= Math.min(cost, maximum);
          drain();
        });
    }
  };

  return {
    run<T>(cost: number, task: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        queue.push({
          cost: Number.isFinite(cost) ? Math.max(1, cost) : maximum,
          task,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        drain();
      });
    },
  };
}

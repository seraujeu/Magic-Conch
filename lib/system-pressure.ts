import { MAX_WORKFLOW_PARALLELISM, MIN_WORKFLOW_PARALLELISM } from "./workflow-scheduler.ts";

export type SystemPressureLevel = "low" | "moderate" | "high" | "critical";

export type SystemPressureSample = {
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  heapUtilization?: number;
  eventLoopLagMs?: number;
  cpuPressure?: "nominal" | "fair" | "serious" | "critical";
};

export type SystemPressureRecommendation = {
  level: SystemPressureLevel;
  limit: number;
  capacity: number;
};

function systemCapacity(sample: SystemPressureSample) {
  const cores = Math.max(1, Math.trunc(sample.hardwareConcurrency || 4));
  const cpuCapacity = Math.max(1, Math.ceil(cores / 2));
  const memory = sample.deviceMemoryGb;
  const memoryCapacity = memory === undefined
    ? MAX_WORKFLOW_PARALLELISM
    : memory <= 2 ? 1
      : memory <= 4 ? 2
        : memory <= 8 ? 4
          : memory <= 16 ? 8
            : 16;
  return Math.max(MIN_WORKFLOW_PARALLELISM, Math.min(MAX_WORKFLOW_PARALLELISM, cpuCapacity, memoryCapacity));
}

export function recommendWorkflowParallelism(sample: SystemPressureSample): SystemPressureRecommendation {
  const pressureWeights: Record<NonNullable<SystemPressureSample["cpuPressure"]>, number> = {
    nominal: 0,
    fair: 0.35,
    serious: 0.7,
    critical: 1,
  };
  const heapPressure = sample.heapUtilization === undefined
    ? 0
    : sample.heapUtilization >= 0.9 ? 1 : sample.heapUtilization >= 0.75 ? 0.7 : sample.heapUtilization >= 0.6 ? 0.35 : 0;
  const lag = sample.eventLoopLagMs || 0;
  const lagPressure = lag >= 250 ? 1 : lag >= 120 ? 0.7 : lag >= 50 ? 0.35 : 0;
  const score = Math.max(pressureWeights[sample.cpuPressure || "nominal"], heapPressure, lagPressure);
  const level: SystemPressureLevel = score >= 0.9 ? "critical" : score >= 0.6 ? "high" : score >= 0.3 ? "moderate" : "low";
  const capacity = systemCapacity(sample);
  const factor = level === "critical" ? 0 : level === "high" ? 0.34 : level === "moderate" ? 0.67 : 1;
  const limit = level === "critical" ? 1 : Math.max(1, Math.floor(capacity * factor));
  return { level, limit, capacity };
}

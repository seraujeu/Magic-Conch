export type UserMemory = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryOperation = "add" | "update" | "delete" | "clear";

export function normalizeUserMemories(value: unknown): UserMemory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<UserMemory>;
    const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
    if (!content) return [];
    const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(index).toISOString();
    return [{
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : `memory-${index + 1}`,
      content,
      createdAt,
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : createdAt,
    }];
  });
}

export function formatUserMemory(memories: UserMemory[]) {
  return memories.map((memory) => `- ${memory.content}`).join("\n");
}

export function formatUserSettings(preference: string, memories: UserMemory[]) {
  const sections: string[] = [];
  if (preference.trim()) sections.push(`## User preference\n${preference.trim()}`);
  if (memories.length) sections.push(`## User memory\n${formatUserMemory(memories)}`);
  return sections.join("\n\n");
}

export function applyUserMemoryOperation(
  memories: UserMemory[],
  operation: MemoryOperation,
  options: { content?: unknown; memoryId?: unknown; now?: string; createId?: () => string } = {},
) {
  const normalized = normalizeUserMemories(memories);
  const content = String(options.content ?? "").trim();
  const memoryId = String(options.memoryId ?? "").trim();
  const now = options.now || new Date().toISOString();

  if (operation === "clear") return { memories: [], changed: normalized.length > 0, memory: null as UserMemory | null };
  if (operation === "add") {
    if (!content) throw new Error("Provide memory content to add.");
    const memory: UserMemory = {
      id: options.createId?.() || `memory-${Date.now().toString(36)}`,
      content,
      createdAt: now,
      updatedAt: now,
    };
    return { memories: [...normalized, memory], changed: true, memory };
  }
  if (!memoryId) throw new Error(`Provide a memory ID to ${operation} a memory.`);
  const index = normalized.findIndex((memory) => memory.id === memoryId);
  if (index < 0) throw new Error(`Memory “${memoryId}” was not found.`);
  if (operation === "delete") {
    return { memories: normalized.filter((memory) => memory.id !== memoryId), changed: true, memory: normalized[index] };
  }
  if (!content) throw new Error("Provide replacement memory content.");
  const memory = { ...normalized[index], content, updatedAt: now };
  return {
    memories: normalized.map((item) => item.id === memoryId ? memory : item),
    changed: memory.content !== normalized[index].content,
    memory,
  };
}

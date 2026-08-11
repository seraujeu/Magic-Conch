export type MessageBranch<T extends { id: string }> = {
  activeIndex: number;
  versions: T[][];
};

export type BranchableMessage<T extends { id: string }> = T & {
  branch?: MessageBranch<BranchableMessage<T>>;
};

function withoutRootBranch<T extends { id: string }>(messages: BranchableMessage<T>[]) {
  const copy = structuredClone(messages);
  if (!copy.length) return copy;
  delete copy[0].branch;
  return copy;
}

export function replaceWithResentBranch<T extends { id: string }>(
  messages: BranchableMessage<T>[],
  messageId: string,
  replacement: BranchableMessage<T>,
) {
  const branchAt = messages.findIndex((message) => message.id === messageId);
  if (branchAt < 0) return messages;

  const currentMessage = messages[branchAt];
  const existingBranch = currentMessage.branch;
  const versions = existingBranch
    ? structuredClone(existingBranch.versions)
    : [withoutRootBranch(messages.slice(branchAt))];

  if (existingBranch) {
    versions[existingBranch.activeIndex] = withoutRootBranch(messages.slice(branchAt));
  }

  versions.push([withoutRootBranch([replacement])[0]]);
  const activeIndex = versions.length - 1;
  const activeMessage = {
    ...structuredClone(replacement),
    branch: { activeIndex, versions },
  } as BranchableMessage<T>;

  return [...messages.slice(0, branchAt), activeMessage];
}

export function switchResentBranch<T extends { id: string }>(
  messages: BranchableMessage<T>[],
  messageId: string,
  targetIndex: number,
) {
  const branchAt = messages.findIndex((message) => message.id === messageId);
  if (branchAt < 0) return messages;

  const currentMessage = messages[branchAt];
  if (!currentMessage.branch) return messages;

  const versions = structuredClone(currentMessage.branch.versions);
  const activeIndex = currentMessage.branch.activeIndex;
  if (targetIndex < 0 || targetIndex >= versions.length || targetIndex === activeIndex) return messages;

  versions[activeIndex] = withoutRootBranch(messages.slice(branchAt));
  const targetMessages = withoutRootBranch(versions[targetIndex]);
  if (!targetMessages.length) return messages;

  targetMessages[0] = {
    ...targetMessages[0],
    branch: { activeIndex: targetIndex, versions },
  };

  return [...messages.slice(0, branchAt), ...targetMessages];
}

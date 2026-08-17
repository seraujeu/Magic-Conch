export type NodeDirectoryConfig = {
  directoryPath?: string;
  directoryName?: string;
  subfolder?: string;
};

export function configuredNodeDirectory(config: NodeDirectoryConfig, defaultDirectory: string) {
  return config.directoryPath?.trim() || config.directoryName?.trim() || defaultDirectory;
}

export function isAbsoluteDirectoryPath(value = "") {
  const path = value.trim();
  return /^[/\\]/.test(path) || /^[a-zA-Z]:[/\\]/.test(path);
}

export function resolveNodeDirectory(
  config: NodeDirectoryConfig,
  defaultDirectory: string,
  subfolder = config.subfolder || "",
) {
  const path = subfolder.trim();
  if (isAbsoluteDirectoryPath(path)) return { directory: path, subfolder: [] as string[] };
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === ".." || /[<>:"|?*]/.test(segment) || [...segment].some((character) => character.charCodeAt(0) < 32))) {
    throw new Error("The subfolder path contains an unsupported segment.");
  }
  return { directory: configuredNodeDirectory(config, defaultDirectory), subfolder: segments };
}

/** Formats a resolved directory and its validated subfolder as a readable source path. */
export function displayNodeDirectory(directory: string, subfolder: string[] = []) {
  if (!subfolder.length) return directory;
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/g, "")}${separator}${subfolder.join(separator)}`;
}

export function migrateLegacyNodeDirectory<T extends NodeDirectoryConfig>(config: T): T {
  if (!isAbsoluteDirectoryPath(config.subfolder)) return config;
  return {
    ...config,
    directoryPath: config.subfolder!.trim(),
    directoryName: undefined,
    subfolder: "",
  };
}

export function directorySubfolderSegments(path = "", rootFolderName?: string) {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized || normalized === ".") return [];

  let segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    const rootIndex = rootFolderName
      ? segments.findLastIndex((segment) => segment.localeCompare(rootFolderName, undefined, { sensitivity: "accent" }) === 0)
      : -1;
    if (rootIndex < 0) {
      throw new Error("A browser cannot open an absolute path directly. Choose that directory, then leave Subfolder path blank.");
    }
    segments = segments.slice(rootIndex + 1);
  }

  if (segments.some((segment) => segment === ".." || /[<>:"|?*]/.test(segment) || [...segment].some((character) => character.charCodeAt(0) < 32))) {
    throw new Error("The subfolder path contains an unsupported segment.");
  }
  return segments;
}

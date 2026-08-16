export type DirectoryPermissionMode = "read" | "readwrite";

export type PermissionCapableDirectoryHandle = {
  name: string;
  queryPermission?: (descriptor?: { mode?: DirectoryPermissionMode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: DirectoryPermissionMode }) => Promise<PermissionState>;
};

const grantedPermissions = new WeakMap<object, Set<DirectoryPermissionMode>>();
const pendingPermissions = new WeakMap<object, Map<DirectoryPermissionMode, Promise<void>>>();

function permissionSet(handle: PermissionCapableDirectoryHandle) {
  let permissions = grantedPermissions.get(handle);
  if (!permissions) {
    permissions = new Set();
    grantedPermissions.set(handle, permissions);
  }
  return permissions;
}

function isRemembered(handle: PermissionCapableDirectoryHandle, mode: DirectoryPermissionMode) {
  const permissions = grantedPermissions.get(handle);
  return Boolean(permissions?.has(mode) || (mode === "read" && permissions?.has("readwrite")));
}

/**
 * Records permission granted by a directory picker or a successful permission
 * request. Browser grants are scoped to the handle and current page session.
 */
export function rememberDirectoryPermission(
  handle: PermissionCapableDirectoryHandle,
  mode: DirectoryPermissionMode,
) {
  const permissions = permissionSet(handle);
  permissions.add(mode);
  if (mode === "readwrite") permissions.add("read");
}

/**
 * Requests access at most once for a handle in the current page session.
 * Concurrent Load/Save nodes also share the same in-flight request.
 */
export async function ensureDirectoryPermission(
  handle: PermissionCapableDirectoryHandle,
  mode: DirectoryPermissionMode,
) {
  if (isRemembered(handle, mode)) return;

  let pendingForHandle = pendingPermissions.get(handle);
  const pending = pendingForHandle?.get(mode);
  if (pending) return pending;

  const permissionRequest = (async () => {
    let permission = await handle.queryPermission?.({ mode });
    if (permission === "granted" || permission === undefined) {
      rememberDirectoryPermission(handle, mode);
      return;
    }

    permission = await handle.requestPermission?.({ mode });
    if (permission !== "granted") {
      throw new Error(`Allow ${mode === "readwrite" ? "read and write" : "read"} access to “${handle.name}”, or choose the directory again.`);
    }
    rememberDirectoryPermission(handle, mode);
  })();

  if (!pendingForHandle) {
    pendingForHandle = new Map();
    pendingPermissions.set(handle, pendingForHandle);
  }
  pendingForHandle.set(mode, permissionRequest);

  try {
    await permissionRequest;
  } finally {
    pendingForHandle.delete(mode);
  }
}

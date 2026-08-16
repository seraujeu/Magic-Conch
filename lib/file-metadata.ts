export type NamedFileAsset = {
  name: string;
  type?: string;
  data?: string;
};

export function firstFileAsset(...values: unknown[]): NamedFileAsset | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstFileAsset(...value);
      if (nested) return nested;
      continue;
    }
    if (value && typeof value === "object" && typeof (value as NamedFileAsset).name === "string") {
      return value as NamedFileAsset;
    }
  }
  return undefined;
}

export function fileNameFromAsset(asset: NamedFileAsset, includeExtension = true) {
  const name = asset.name.split(/[\\/]/).at(-1) || asset.name;
  if (includeExtension) return name;
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

export async function getMediaDimensions(asset: NamedFileAsset) {
  if (!asset.data) throw new Error(`Media file “${asset.name}” has no readable data.`);
  const source = asset.data;
  const isVideo = Boolean(
    asset.type?.startsWith("video/")
    || source.startsWith("data:video/")
    || /\.(?:mp4|webm|mov|m4v|ogv|avi|mkv)$/i.test(asset.name),
  );
  if (isVideo) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const media = document.createElement("video");
      const fail = () => {
        media.removeAttribute("src");
        media.load();
        reject(new Error(`Could not read the dimensions of “${asset.name}”.`));
      };
      media.preload = "metadata";
      media.onloadedmetadata = () => {
        const dimensions = { width: media.videoWidth, height: media.videoHeight };
        media.removeAttribute("src");
        media.load();
        if (dimensions.width && dimensions.height) resolve(dimensions);
        else reject(new Error(`Could not read the dimensions of “${asset.name}”.`));
      };
      media.onerror = fail;
      media.src = source;
    });
  }
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const media = document.createElement("img");
    const fail = () => {
      media.removeAttribute("src");
      reject(new Error(`Could not read the dimensions of “${asset.name}”.`));
    };
    media.onload = () => {
      const dimensions = { width: media.naturalWidth, height: media.naturalHeight };
      media.removeAttribute("src");
      if (dimensions.width && dimensions.height) resolve(dimensions);
      else reject(new Error(`Could not read the dimensions of “${asset.name}”.`));
    };
    media.onerror = fail;
    media.src = source;
  });
}

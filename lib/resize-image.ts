// Shrinks a photo in the browser to a JPEG data URL so it fits in a
// Server Action request (1MB limit). With `square`, it is center-cropped.
export function resizeImage(
  file: File,
  maxSize: number,
  { square = false, quality = 0.85 } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sw = square ? side : img.width;
      const sh = square ? side : img.height;
      const scale = Math.min(1, maxSize / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      canvas
        .getContext("2d")!
        .drawImage(
          img,
          (img.width - sw) / 2,
          (img.height - sh) / 2,
          sw,
          sh,
          0,
          0,
          canvas.width,
          canvas.height
        );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

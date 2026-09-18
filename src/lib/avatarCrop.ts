/** Igual que el encuadre de la historia: caber dentro + blur detrás. */
export const AVATAR_CROP_MIN_SCALE = 0.35;
export const AVATAR_CROP_MAX_SCALE = 4;

/** JPEG del recuadro: fondo desenfocado y la foto encima, como en historias. */
export function exportFramedAvatar(
  img: HTMLImageElement,
  scale: number,
  pos: { x: number; y: number },
  box: number,
  outputSize = 512
): string {
  const nw = Math.max(1, img.naturalWidth);
  const nh = Math.max(1, img.naturalHeight);
  const view = Math.max(80, box);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cover = Math.max(outputSize / nw, outputSize / nh);
  ctx.filter = 'blur(36px)';
  ctx.drawImage(img, (outputSize - nw * cover) / 2, (outputSize - nh * cover) / 2, nw * cover, nh * cover);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, outputSize, outputSize);

  const fit = Math.min(view / nw, view / nh);
  const ratio = outputSize / view;
  ctx.save();
  ctx.translate(outputSize / 2 + pos.x * ratio, outputSize / 2 + pos.y * ratio);
  ctx.scale(scale, scale);
  const dw = nw * fit * ratio;
  const dh = nh * fit * ratio;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Baja fotos enormes antes de recortar para que el gesto no vaya a tirones. */
export function downscaleForCrop(file: File, maxEdge = 1800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la foto'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('No se pudo leer la foto'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const edge = Math.max(w, h);
        if (edge <= maxEdge) {
          resolve(src);
          return;
        }
        const ratio = maxEdge / edge;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Foto no válida'));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

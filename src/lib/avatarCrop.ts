/** Encuadre tipo cover: la foto llena el recuadro sin deformarse. */
export const AVATAR_CROP_MIN_SCALE = 1;
export const AVATAR_CROP_MAX_SCALE = 4;

export function coverFit(nw: number, nh: number, box: number): number {
  return Math.max(box / Math.max(1, nw), box / Math.max(1, nh));
}

/** JPEG cuadrado recortado en cover: misma vista que el círculo del editor. */
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

  const zoom = Math.max(AVATAR_CROP_MIN_SCALE, Math.min(AVATAR_CROP_MAX_SCALE, scale));
  const cover = coverFit(nw, nh, view) * zoom;
  const ratio = outputSize / view;
  const dw = nw * cover * ratio;
  const dh = nh * cover * ratio;
  ctx.drawImage(
    img,
    outputSize / 2 + pos.x * ratio - dw / 2,
    outputSize / 2 + pos.y * ratio - dh / 2,
    dw,
    dh
  );
  return canvas.toDataURL('image/jpeg', 0.92);
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

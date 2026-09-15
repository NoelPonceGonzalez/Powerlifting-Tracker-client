/** Recuadro circular de recorte (vista previa y geometría). */
export const AVATAR_CROP_BOX = 280;

/** Escala 1 = la foto cubre el círculo entero (como Instagram). */
export function coverFit(
  naturalW: number,
  naturalH: number,
  scale: number,
  pos: { x: number; y: number },
  box = AVATAR_CROP_BOX
) {
  const cover = Math.max(box / Math.max(naturalW, 1), box / Math.max(naturalH, 1));
  const effectiveW = naturalW * cover * scale;
  const effectiveH = naturalH * cover * scale;
  const drawX = box / 2 + pos.x - effectiveW / 2;
  const drawY = box / 2 + pos.y - effectiveH / 2;
  return { effectiveW, effectiveH, drawX, drawY, cover };
}

export function clampCoverPos(
  naturalW: number,
  naturalH: number,
  scale: number,
  pos: { x: number; y: number },
  box = AVATAR_CROP_BOX
): { x: number; y: number } {
  if (naturalW < 1 || naturalH < 1) return pos;
  const { effectiveW, effectiveH } = coverFit(naturalW, naturalH, scale, pos, box);
  const maxX = Math.max(0, effectiveW / 2 - box / 2);
  const maxY = Math.max(0, effectiveH / 2 - box / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pos.x)),
    y: Math.max(-maxY, Math.min(maxY, pos.y)),
  };
}

export const AVATAR_CROP_MIN_SCALE = 1;
export const AVATAR_CROP_MAX_SCALE = 4;

/** JPEG compacto para guardar en perfil / registro. */
export function exportCoverCrop(
  img: HTMLImageElement,
  scale: number,
  pos: { x: number; y: number },
  outputSize = 320
): string {
  const { drawX, drawY, effectiveW, effectiveH } = coverFit(
    img.naturalWidth,
    img.naturalHeight,
    scale,
    pos
  );
  const work = document.createElement('canvas');
  work.width = AVATAR_CROP_BOX;
  work.height = AVATAR_CROP_BOX;
  const wctx = work.getContext('2d');
  if (!wctx) return '';
  wctx.fillStyle = '#0f172a';
  wctx.fillRect(0, 0, AVATAR_CROP_BOX, AVATAR_CROP_BOX);
  wctx.drawImage(
    img,
    0,
    0,
    img.naturalWidth,
    img.naturalHeight,
    drawX,
    drawY,
    effectiveW,
    effectiveH
  );

  const out = document.createElement('canvas');
  out.width = outputSize;
  out.height = outputSize;
  const ctx = out.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(work, 0, 0, AVATAR_CROP_BOX, AVATAR_CROP_BOX, 0, 0, outputSize, outputSize);
  return out.toDataURL('image/jpeg', 0.84);
}

export function touchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
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

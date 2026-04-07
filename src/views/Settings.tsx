import React, { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { User as UserIcon, Camera, Image as ImageIcon, Weight, Moon, Sun, LogOut, Users, Plus, Check, X, ZoomIn, ZoomOut, Crop, Sparkles } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { User } from '@/src/types';
import type { AccountSummary } from '@/src/lib/savedAccounts';
import { cn } from '@/src/lib/utils';

function touchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Tamaño del recuadro circular (debe coincidir con estilo del modal y con el canvas de exportación). */
const CROP_CONTAINER = 280;

/** Vista previa y canvas: misma geometría (altura base = contenedor, escala = zoom). */
function cropLayout(
  naturalW: number,
  naturalH: number,
  scale: number,
  pos: { x: number; y: number }
) {
  const baseScale = CROP_CONTAINER / naturalH;
  const effectiveW = naturalW * baseScale * scale;
  const effectiveH = CROP_CONTAINER * scale;
  const cx = CROP_CONTAINER / 2 + pos.x;
  const cy = CROP_CONTAINER / 2 + pos.y;
  const drawX = cx - effectiveW / 2;
  const drawY = cy - effectiveH / 2;
  return { effectiveW, effectiveH, drawX, drawY };
}

/** Evita huecos o “recortes raros” al bajar el zoom: el círculo debe quedar cubierto por la imagen. */
function clampCropPos(
  naturalW: number,
  naturalH: number,
  scale: number,
  pos: { x: number; y: number }
): { x: number; y: number } {
  if (naturalW < 1 || naturalH < 1) return pos;
  const baseScale = CROP_CONTAINER / naturalH;
  const effectiveW = naturalW * baseScale * scale;
  const effectiveH = CROP_CONTAINER * scale;
  const hw = effectiveW / 2;
  const hh = effectiveH / 2;
  const half = CROP_CONTAINER / 2;
  const maxX = Math.max(0, hw - half);
  const maxY = Math.max(0, hh - half);
  return {
    x: Math.max(-maxX, Math.min(maxX, pos.x)),
    y: Math.max(-maxY, Math.min(maxY, pos.y)),
  };
}

interface SettingsViewProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
  onLogout: () => void;
  /** Cuentas guardadas en el dispositivo (sin token). */
  savedAccountSummaries?: AccountSummary[];
  onSwitchAccount?: (userId: string) => void;
  onAddAccount?: () => void;
  /** Quitar sesión guardada de este dispositivo (no borra la cuenta en el servidor). */
  onRemoveSavedAccount?: (userId: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  onLogout,
  savedAccountSummaries = [],
  onSwitchAccount,
  onAddAccount,
  onRemoveSavedAccount,
}) => {
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const photoMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!photoMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (photoMenuRef.current && !photoMenuRef.current.contains(e.target as Node)) {
        setPhotoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [photoMenuOpen]);

  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  /** Dimensiones naturales de la imagen del modal (para geometría idéntica al canvas). */
  const [cropNatural, setCropNatural] = useState({ w: 0, h: 0 });
  /** Imagen original completa (antes de recortar) para poder re-editar sin perder píxeles. */
  const originalImageRef = useRef<string | null>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropAreaRef = useRef<HTMLDivElement | null>(null);
  const cropPosRef = useRef(cropPos);
  const cropScaleRef = useRef(cropScale);
  cropPosRef.current = cropPos;
  cropScaleRef.current = cropScale;
  const touchPanRef = useRef<{
    touchId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);

  React.useEffect(() => {
    if (!cropImage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cropImage]);

  React.useEffect(() => {
    if (!cropImage) setCropNatural({ w: 0, h: 0 });
  }, [cropImage]);

  /** Al cambiar zoom o cargar la imagen: limitar desplazamiento para que el círculo siga cubierto (evita “recortes” al bajar zoom). */
  useLayoutEffect(() => {
    if (!cropImage || cropNatural.w < 1 || cropNatural.h < 1) return;
    setCropPos((prev) => clampCropPos(cropNatural.w, cropNatural.h, cropScale, prev));
  }, [cropImage, cropScale, cropNatural.w, cropNatural.h]);

  React.useEffect(() => {
    if (!cropImage) return;
    const el = cropAreaRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        pinchRef.current = {
          startDist: touchDistance(a, b),
          startScale: cropScaleRef.current,
        };
        touchPanRef.current = null;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        touchPanRef.current = {
          touchId: t.identifier,
          startX: t.clientX,
          startY: t.clientY,
          origX: cropPosRef.current.x,
          origY: cropPosRef.current.y,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        if (!pinchRef.current) {
          pinchRef.current = {
            startDist: touchDistance(a, b),
            startScale: cropScaleRef.current,
          };
        }
        e.preventDefault();
        const d = touchDistance(a, b);
        const ratio = d / pinchRef.current.startDist;
        const next = Math.min(3, Math.max(0.3, pinchRef.current.startScale * ratio));
        setCropScale(next);
      } else if (e.touches.length === 1 && touchPanRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        if (t.identifier !== touchPanRef.current.touchId) return;
        const dx = t.clientX - touchPanRef.current.startX;
        const dy = t.clientY - touchPanRef.current.startY;
        const img = cropImgRef.current;
        const nw = img?.naturalWidth ?? 0;
        const nh = img?.naturalHeight ?? 0;
        const next = {
          x: touchPanRef.current.origX + dx,
          y: touchPanRef.current.origY + dy,
        };
        if (!nw || !nh) {
          setCropPos(next);
        } else {
          setCropPos(clampCropPos(nw, nh, cropScaleRef.current, next));
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
      if (e.touches.length === 0) {
        touchPanRef.current = null;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        touchPanRef.current = {
          touchId: t.identifier,
          startX: t.clientX,
          startY: t.clientY,
          origX: cropPosRef.current.x,
          origY: cropPosRef.current.y,
        };
      } else if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        pinchRef.current = {
          startDist: touchDistance(a, b),
          startScale: cropScaleRef.current,
        };
        touchPanRef.current = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [cropImage]);

  const handleAvatarFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 3 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      originalImageRef.current = dataUrl;
      setCropImage(dataUrl);
      setCropPos({ x: 0, y: 0 });
      setCropScale(1);
      setCropNatural({ w: 0, h: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = useCallback(() => {
    if (!cropImage) return;
    const img = cropImgRef.current;
    if (!img || img.naturalWidth < 1 || img.naturalHeight < 1) return;

    const { drawX, drawY, effectiveW, effectiveH } = cropLayout(
      img.naturalWidth,
      img.naturalHeight,
      cropScale,
      cropPos
    );

    const work = document.createElement('canvas');
    work.width = CROP_CONTAINER;
    work.height = CROP_CONTAINER;
    const wctx = work.getContext('2d');
    if (!wctx) {
      onUpdateUser({ avatar: cropImage });
      setCropImage(null);
      return;
    }
    wctx.clearRect(0, 0, CROP_CONTAINER, CROP_CONTAINER);
    wctx.save();
    wctx.beginPath();
    wctx.arc(CROP_CONTAINER / 2, CROP_CONTAINER / 2, CROP_CONTAINER / 2, 0, Math.PI * 2);
    wctx.clip();
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
    wctx.restore();

    const OUTPUT_SIZE = 400;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onUpdateUser({ avatar: cropImage });
      setCropImage(null);
      return;
    }
    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    /** Fondo opaco: el recorte circular deja transparencia en las esquinas; sin esto el avatar no coincide con la vista previa (object-cover en recuadro redondeado). */
    ctx.fillStyle = user.theme === 'dark' ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(work, 0, 0, CROP_CONTAINER, CROP_CONTAINER, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const result = canvas.toDataURL('image/png');
    onUpdateUser({ avatar: result });
    setCropImage(null);
  }, [cropImage, cropPos, cropScale, onUpdateUser, user.theme]);

  const handleCropPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    cropDragRef.current = { startX: e.clientX, startY: e.clientY, origX: cropPos.x, origY: cropPos.y };
    cropAreaRef.current?.setPointerCapture(e.pointerId);
  };
  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!cropDragRef.current) return;
    e.preventDefault();
    const dx = e.clientX - cropDragRef.current.startX;
    const dy = e.clientY - cropDragRef.current.startY;
    const img = cropImgRef.current;
    const nw = img?.naturalWidth ?? 0;
    const nh = img?.naturalHeight ?? 0;
    const next = { x: cropDragRef.current.origX + dx, y: cropDragRef.current.origY + dy };
    if (!nw || !nh) setCropPos(next);
    else setCropPos(clampCropPos(nw, nh, cropScaleRef.current, next));
  };
  const handleCropPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    cropDragRef.current = null;
    if (cropAreaRef.current?.hasPointerCapture?.(e.pointerId)) {
      cropAreaRef.current.releasePointerCapture(e.pointerId);
    }
  };

  /** Misma geometría que `handleCropConfirm` / canvas (sin transform CSS que desincronizaba el zoom). */
  const cropPreviewLayout =
    cropImage && cropNatural.w > 0 && cropNatural.h > 0
      ? cropLayout(cropNatural.w, cropNatural.h, cropScale, cropPos)
      : null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32 text-slate-900 dark:text-slate-100"
    >
      <header className="mb-10">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">Configuración</h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium">Personaliza tu perfil y preferencias</p>
      </header>

      <div className="space-y-8">
        {/* Profile Section: cuenta(s) en este dispositivo + foto (tocar imagen) + datos */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <UserIcon className="text-white" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Perfil</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Cambia de cuenta o edita tu foto y nombre.
              </p>
            </div>
          </div>

          <Card padding="lg" rounded="2xl" className="space-y-6">
            {(onSwitchAccount || onAddAccount) && (
              <div className="space-y-3 pb-6 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Users className="text-violet-600 dark:text-violet-400" size={18} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Cuentas en este dispositivo
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cambia de perfil sin volver a escribir la contraseña.
                </p>
                <div className="space-y-2">
                  {savedAccountSummaries.map((acc) => {
                    const isActive = acc.id === user.id;
                    return (
                      <div
                        key={acc.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                          isActive
                            ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 dark:border-indigo-600'
                            : 'border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        )}
                      >
                        <Avatar
                          src={acc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(acc.name || 'U')}`}
                          name={acc.name}
                          className="w-11 h-11 rounded-xl border-2 border-white dark:border-slate-700 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm">{acc.name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{acc.email}</p>
                        </div>
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                            <Check size={14} /> Activa
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {onSwitchAccount && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-xs font-black uppercase"
                                onClick={(e) => { e.stopPropagation(); onSwitchAccount(acc.id); }}
                                onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onSwitchAccount(acc.id); }}
                              >
                                Usar
                              </Button>
                            )}
                            {onRemoveSavedAccount && (
                              <button
                                type="button"
                                title="Quitar de este dispositivo"
                                onClick={() => onRemoveSavedAccount(acc.id)}
                                className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <X size={18} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {onAddAccount && (
                    <button
                      type="button"
                      onClick={onAddAccount}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-sm hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 transition-colors"
                    >
                      <Plus size={18} />
                      Añadir otra cuenta
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              <div ref={photoMenuRef} className="relative flex-shrink-0 mx-auto sm:mx-0">
                <button
                  type="button"
                  onClick={() => setPhotoMenuOpen((o) => !o)}
                  className={cn(
                    'group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
                    photoMenuOpen && 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900'
                  )}
                  aria-expanded={photoMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Cambiar foto de perfil: galería o cámara"
                >
                  <Avatar
                    src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
                    name={user.name}
                    className="w-24 h-24 rounded-full border-2 border-slate-100 dark:border-slate-700 shadow-xl pointer-events-none"
                  />
                  <span
                    className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/25 group-active:bg-black/35 transition-colors flex items-center justify-center"
                    aria-hidden
                  >
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-0.5 text-white text-[10px] font-black uppercase tracking-tight drop-shadow">
                      <Camera size={22} strokeWidth={2} />
                      Tocar
                    </span>
                  </span>
                </button>
                {photoMenuOpen && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-full mt-2 z-30 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
                      onClick={() => {
                        galleryInputRef.current?.click();
                        setPhotoMenuOpen(false);
                      }}
                    >
                      <ImageIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Galería
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
                      onClick={() => {
                        cameraInputRef.current?.click();
                        setPhotoMenuOpen(false);
                      }}
                    >
                      <Camera size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Hacer foto
                    </button>
                    {user.avatar && !user.avatar.startsWith('https://ui-avatars') && (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/80"
                        onClick={() => {
                          setCropImage(originalImageRef.current || user.avatar!);
                          setCropPos({ x: 0, y: 0 });
                          setCropScale(1);
                          setCropNatural({ w: 0, h: 0 });
                          setPhotoMenuOpen(false);
                        }}
                      >
                        <Crop size={18} className="text-indigo-600 dark:text-indigo-400" />
                        Ajustar foto actual
                      </button>
                    )}
                  </div>
                )}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleAvatarFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    handleAvatarFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="flex-1 space-y-4 min-w-0">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Foto de perfil</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Toca la imagen para elegir galería o cámara.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de Usuario</label>
                  <Input 
                    value={user.name} 
                    onChange={(e) => onUpdateUser({ name: e.target.value })}
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                  <Input 
                    value={user.email} 
                    disabled
                    className="bg-slate-50 text-slate-400 font-medium cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Physical Stats */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-600 p-2 rounded-xl">
              <Weight className="text-white" size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Datos Físicos</h2>
          </div>

          <Card padding="lg" rounded="2xl">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peso Corporal</label>
                <div className="flex items-baseline gap-2">
                  <input 
                    type="number"
                    value={user.bodyWeight}
                    onChange={(e) => onUpdateUser({ bodyWeight: parseFloat(e.target.value) || 0 })}
                    className="text-3xl font-black text-slate-900 dark:text-slate-100 bg-transparent w-24 focus:outline-none"
                  />
                  <span className="text-slate-400 font-bold uppercase text-sm">kg</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 max-w-[200px] text-right">
                Tu peso se utiliza para calcular tu fuerza relativa en los desafíos.
              </p>
            </div>
          </Card>
        </section>

        {/* Appearance */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-500 p-2 rounded-xl">
              <Sun className="text-white" size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Apariencia</h2>
          </div>

          <Card padding="md" rounded="2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  user.theme === 'dark' ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-600"
                )}>
                  {user.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">Modo {user.theme === 'dark' ? 'Oscuro' : 'Claro'}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Cambia el aspecto visual de la app</p>
                </div>
              </div>
              <button 
                onClick={() => onUpdateUser({ theme: user.theme === 'light' ? 'dark' : 'light' })}
                className={cn(
                  "w-14 h-8 rounded-full p-1 transition-colors relative",
                  user.theme === 'dark' ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <motion.div 
                  animate={{ x: user.theme === 'dark' ? 24 : 0 }}
                  className="w-6 h-6 bg-white dark:bg-slate-200 rounded-full shadow-sm dark:shadow-slate-950/80"
                />
              </button>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 shadow-sm transition-colors border-slate-200/90 bg-white dark:border-slate-600/80 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                    user.mbMode
                      ? 'bg-pink-500 text-white shadow-md shadow-pink-200/60 dark:bg-pink-600 dark:shadow-pink-950/40'
                      : 'bg-pink-50 text-pink-400 dark:bg-pink-950/45 dark:text-pink-300/90'
                  )}
                >
                  <Sparkles size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100">Modo MB</p>
                  <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                    Acentos rosa en botones y gráficos (independiente de claro/oscuro).
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user.mbMode}
                onClick={() => onUpdateUser({ mbMode: !user.mbMode })}
                className={cn(
                  'relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors',
                  user.mbMode ? 'bg-pink-500 dark:bg-pink-600' : 'bg-slate-200 dark:bg-slate-600'
                )}
              >
                <motion.div
                  animate={{ x: user.mbMode ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="h-6 w-6 rounded-full bg-white shadow-md ring-1 ring-black/5 dark:bg-slate-100 dark:shadow-slate-950/60 dark:ring-white/15"
                />
              </button>
            </div>
          </Card>
        </section>

        {/* Danger Zone */}
        <section className="pt-8 border-t border-slate-100 dark:border-slate-700">
          <Button 
            variant="outline" 
            className="w-full py-6 rounded-2xl border-2 border-rose-100 text-rose-500 hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center gap-2"
            onClick={onLogout}
          >
            <LogOut size={20} />
            <span className="font-black uppercase tracking-widest text-xs">Cerrar Sesión</span>
          </Button>
        </section>
      </div>

      {cropImage && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 overscroll-contain">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setCropImage(null)}
            aria-hidden
          />
          <div className="relative z-10 max-h-[min(100dvh,100vh)] overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-5 shadow-2xl dark:border dark:border-slate-700 touch-manipulation">
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-4 text-center">Ajustar foto</h3>
            <div
              ref={cropAreaRef}
              className="relative mx-auto overflow-hidden rounded-full border-4 border-indigo-500 touch-none bg-slate-900/20 dark:bg-slate-950/40"
              style={{ width: CROP_CONTAINER, height: CROP_CONTAINER, touchAction: 'none' }}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
              onLostPointerCapture={() => {
                cropDragRef.current = null;
              }}
            >
              <img
                ref={cropImgRef}
                src={cropImage}
                alt="Crop preview"
                draggable={false}
                className="absolute select-none"
                onLoad={(e) => {
                  const t = e.currentTarget;
                  setCropNatural({ w: t.naturalWidth, h: t.naturalHeight });
                }}
                style={
                  cropPreviewLayout
                    ? {
                        left: cropPreviewLayout.drawX,
                        top: cropPreviewLayout.drawY,
                        width: cropPreviewLayout.effectiveW,
                        height: cropPreviewLayout.effectiveH,
                      }
                    : { left: 0, top: 0, width: 0, height: 0, visibility: 'hidden' as const }
                }
              />
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button onClick={() => setCropScale(s => Math.max(0.3, s - 0.1))} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <ZoomOut size={18} className="text-slate-600 dark:text-slate-300" />
              </button>
              <input
                type="range"
                min="0.3"
                max="3"
                step="0.05"
                value={cropScale}
                onChange={(e) => setCropScale(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-600"
              />
              <button onClick={() => setCropScale(s => Math.min(3, s + 0.1))} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <ZoomIn size={18} className="text-slate-600 dark:text-slate-300" />
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCropImage(null)}>
                Cancelar
              </Button>
              <Button variant="primary" className="flex-1 rounded-xl" onClick={handleCropConfirm}>
                Guardar
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
};

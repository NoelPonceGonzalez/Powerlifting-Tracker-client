import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Camera, Film, Image as ImageIcon, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { MAX_UPLOAD_BYTES, publishMedia, type FeedPost } from '@/src/lib/feedApi';

interface PublishModalProps {
  onClose: () => void;
  onPublished: (post: FeedPost) => void;
}

function prettySize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  onClose,
  onPublished,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = useCallback((selected: File | null) => {
    if (!selected) return;
    if (selected.size > MAX_UPLOAD_BYTES) {
      setError('El archivo pasa de 80 MB. Recorta el vídeo o bájale la calidad.');
      return;
    }
    setError(null);
    setFile(selected);
  }, []);

  const publish = useCallback(async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);
    try {
      const post = await publishMedia(file, { kind: 'post', caption: caption.trim() });
      onPublished(post);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se ha podido subir');
    } finally {
      setSaving(false);
    }
  }, [file, caption, saving, onPublished, onClose]);

  if (typeof document === 'undefined') return null;
  const isVideo = !!file?.type.startsWith('video/');

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      style={{ zIndex: 100070 }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={e => e.stopPropagation()}
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <Sparkles size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-slate-100">
              Nueva publicación
            </h3>
            <p className="text-[11px] text-slate-400">Se queda en tu perfil y en Inicio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={e => pick(e.target.files?.[0] ?? null)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={e => pick(e.target.files?.[0] ?? null)}
        />

        {previewUrl && file ? (
          <div className="mb-4 overflow-hidden rounded-2xl bg-slate-950">
            <div className="relative">
              {isVideo ? (
                <video src={previewUrl} controls playsInline className="max-h-[45vh] w-full object-contain" />
              ) : (
                <img src={previewUrl} alt="Vista previa" className="max-h-[45vh] w-full object-contain" />
              )}
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                <RefreshCw size={12} />
                Cambiar
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-white/70">
              {isVideo ? <Film size={13} /> : <ImageIcon size={13} />}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 tabular-nums">{prettySize(file.size)}</span>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'mb-4 rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
              dragging
                ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30'
                : 'border-slate-200 dark:border-slate-700'
            )}
          >
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              <ImageIcon size={24} />
            </span>
            <p className="text-sm font-black text-slate-800 dark:text-slate-100">
              {dragging ? 'Suelta aquí' : 'Arrastra una foto o un vídeo'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Hasta 80 MB · JPG, PNG, MP4, MOV</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => galleryRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-indigo-700"
              >
                <ImageIcon size={15} />
                Galería
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
              >
                <Camera size={15} />
                Cámara
              </motion.button>
            </div>
          </div>
        )}

        <div className="relative">
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={3}
            maxLength={2200}
            placeholder="Cuenta cómo ha ido la serie… (opcional)"
            className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white p-3 pb-6 text-sm text-slate-900 transition-colors focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {caption.length > 0 && (
            <span className="absolute bottom-2 right-3 text-[10px] tabular-nums text-slate-400">
              {caption.length}/2200
            </span>
          )}
        </div>

        {error && <p className="mt-2 text-xs font-bold text-rose-500">{error}</p>}

        <motion.button
          type="button"
          onClick={publish}
          whileTap={file && !saving ? { scale: 0.98 } : undefined}
          disabled={!file || saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-indigo-200 transition-opacity disabled:opacity-40 disabled:shadow-none dark:shadow-indigo-950/50"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Subiendo…' : 'Publicar'}
        </motion.button>
      </motion.div>
    </motion.div>,
    document.body
  );
};

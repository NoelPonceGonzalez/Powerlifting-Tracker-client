import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Film, Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { MAX_UPLOAD_BYTES, publishMedia, type FeedPost } from '@/src/lib/feedApi';
import { GlassModal } from '@/src/components/ui/GlassModal';

interface PublishModalProps {
  open?: boolean;
  onClose: () => void;
  onPublished: (post: FeedPost) => void;
}

function prettySize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  open = true,
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

  useEffect(() => {
    if (open) return;
    setFile(null);
    setCaption('');
    setError(null);
    setSaving(false);
  }, [open]);

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
      const post = await publishMedia(file, { kind: 'story', caption: caption.trim() });
      onPublished(post);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se ha podido subir');
    } finally {
      setSaving(false);
    }
  }, [file, caption, saving, onPublished, onClose]);

  const isVideo = !!file?.type.startsWith('video/');

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      persist={saving}
      title="Historia de hoy"
      subtitle="Se borra sola a las 24 h"
      wide
      zIndexClass="z-[130000]"
      footer={
        <button
          type="button"
          onClick={() => void publish()}
          disabled={!file || saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Subiendo…' : 'Subir · 24 h'}
        </button>
      }
    >
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
        <div
          className="mb-3 overflow-hidden rounded-2xl bg-slate-950"
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
        >
          <div className="relative">
            {isVideo ? (
              <video src={previewUrl} controls playsInline className="max-h-[38vh] w-full object-contain" />
            ) : (
              <img src={previewUrl} alt="Vista previa" className="max-h-[38vh] w-full object-contain" />
            )}
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur"
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
            'mb-3 rounded-2xl border border-dashed p-4 text-center transition-colors',
            dragging
              ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-white/60 bg-white/40 dark:border-white/10 dark:bg-slate-800/40'
          )}
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
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {dragging ? 'Suelta aquí' : 'Foto o vídeo'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Hasta 80 MB · se borra en 24 h</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-2.5 text-sm font-semibold text-white"
            >
              <ImageIcon size={15} />
              Galería
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/55 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200"
            >
              <Camera size={15} />
              Cámara
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          rows={3}
          maxLength={2200}
          placeholder="Cómo ha ido la serie… (opcional)"
          className="w-full resize-none rounded-2xl border border-white/50 bg-white/55 p-3 pb-6 text-sm text-slate-900 outline-none focus:border-indigo-300 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-100"
        />
        {caption.length > 0 && (
          <span className="absolute bottom-2 right-3 text-[10px] tabular-nums text-slate-400">
            {caption.length}/2200
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-rose-500">{error}</p>}
    </GlassModal>
  );
};

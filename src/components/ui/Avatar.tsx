import React from 'react';
import { cn } from '@/src/lib/utils';

const AVATAR_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%236366f1' width='100' height='100'/%3E%3Ctext x='50' y='58' fill='white' font-size='36' text-anchor='middle' font-family='sans-serif' font-weight='bold'%3E?%3C/text%3E%3C/svg%3E";

interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  name?: string;
  fallback?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, fallback, className, alt, onError, ...props }) => {
  const defaultAvatar = fallback || AVATAR_FALLBACK;
  /** Carga fallida: no guardar el src en estado aparte — si no, el avatar puede quedar desincronizado un ciclo respecto a `src`. */
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => {
    setBroken(false);
  }, [src, fallback]);
  const resolved = !broken && (src && src.trim()) ? src : defaultAvatar;

  return (
    <div
      className={cn(
        'relative overflow-hidden flex-shrink-0',
        /** Tamaño y radio vienen en `className`; la foto rellena el recuadro sin deformarse */
        className
      )}
    >
      <img
        {...props}
        src={resolved}
        alt={alt ?? name ?? 'Avatar'}
        className="absolute inset-0 h-full w-full min-h-0 min-w-0 object-cover object-center"
        referrerPolicy="no-referrer"
        onError={(e) => {
          setBroken(true);
          onError?.(e);
        }}
        draggable={false}
      />
    </div>
  );
};

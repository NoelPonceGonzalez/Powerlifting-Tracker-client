import React from 'react';
import { cn } from '@/src/lib/utils';

const AVATAR_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%236366f1' width='100' height='100'/%3E%3Ctext x='50' y='58' fill='white' font-size='36' text-anchor='middle' font-family='sans-serif' font-weight='bold'%3E?%3C/text%3E%3C/svg%3E";

interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  name?: string;
  fallback?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, fallback, className, alt, ...props }) => {
  const defaultAvatar = fallback || AVATAR_FALLBACK;
  const initialSrc = (src && src.trim()) ? src : defaultAvatar;
  const [imgSrc, setImgSrc] = React.useState(initialSrc);

  React.useEffect(() => {
    setImgSrc((src && src.trim()) ? src : defaultAvatar);
  }, [src, fallback]);

  const handleError = () => {
    setImgSrc(defaultAvatar);
  };

  return (
    <div className={cn('overflow-hidden flex-shrink-0', className)}>
      <img
        {...props}
        src={imgSrc}
        alt={alt ?? name ?? 'Avatar'}
        className="w-full h-full object-cover object-center block"
        referrerPolicy="no-referrer"
        onError={handleError}
      />
    </div>
  );
};

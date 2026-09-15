import React from 'react';
import { cn } from '@/src/lib/utils';
import { avatarInitial, resolveAvatarUrl } from '@/src/lib/avatar';

interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  name?: string;
  fallback?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, fallback, className, alt, onError, ...props }) => {
  const resolved = resolveAvatarUrl(src) || resolveAvatarUrl(fallback);
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => {
    setBroken(false);
  }, [resolved]);
  const showImg = !!resolved && !broken;

  return (
    <div
      className={cn(
        'relative overflow-hidden flex-shrink-0 [container-type:size]',
        !showImg && 'flex items-center justify-center bg-indigo-100 font-black text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
        className
      )}
    >
      {showImg ? (
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
      ) : (
        <span className="select-none leading-none" style={{ fontSize: '42cqmin' }}>
          {avatarInitial(name)}
        </span>
      )}
    </div>
  );
};

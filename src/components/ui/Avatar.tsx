import React from 'react';
import { cn } from '@/src/lib/utils';
import { avatarInitial, avatarSrcCandidates, resolveAvatarUrl } from '@/src/lib/avatar';

interface AvatarProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'size'> {
  src?: string | null;
  avatar?: string | null;
  name?: string;
  fallback?: string;
  userId?: string | null;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  avatar,
  name,
  fallback,
  userId,
  className,
  alt,
  onError,
  size,
  style,
  ...props
}) => {
  const candidates = React.useMemo(() => {
    const list = avatarSrcCandidates(src ?? avatar, userId);
    const extra = resolveAvatarUrl(fallback);
    return extra && !list.includes(extra) ? [...list, extra] : list;
  }, [src, avatar, userId, fallback]);
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    setIndex(0);
  }, [candidates.join('|')]);
  const resolved = candidates[index] || null;
  const showImg = !!resolved;

  return (
    <div
      className={cn(
        'relative overflow-hidden flex-shrink-0 [container-type:size]',
        !showImg && 'flex items-center justify-center bg-indigo-100 font-black text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
        className
      )}
      style={size ? { width: size, height: size, ...style } : style}
    >
      {showImg ? (
        <img
          {...props}
          src={resolved}
          alt={alt ?? name ?? 'Avatar'}
          className="absolute inset-0 block h-full w-full min-h-0 min-w-0 object-cover object-center"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
          referrerPolicy="no-referrer"
          onError={e => {
            if (index + 1 < candidates.length) {
              setIndex(i => i + 1);
              return;
            }
            setIndex(candidates.length);
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

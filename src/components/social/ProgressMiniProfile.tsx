import React, { useEffect, useState } from 'react';
import { Camera, Settings } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { StoryCamera } from '@/src/components/social/StoryCamera';
import { fetchProfile, saveBio } from '@/src/lib/feedApi';
import { hasRealAvatar } from '@/src/lib/avatar';
import type { User } from '@/src/types';

export function ProfileStat({
  value,
  label,
  onClick,
  loading,
}: {
  value: number;
  label: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  const body = loading ? (
    <>
      <span className="mx-auto block h-4 w-7 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <p className="mt-1 truncate text-[11px] text-slate-500">{label}</p>
    </>
  ) : (
    <>
      <p className="text-[16px] font-semibold leading-none text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{label}</p>
    </>
  );
  if (!onClick) {
    return <div className="min-w-0 text-center">{body}</div>;
  }
  return (
    <button type="button" onClick={onClick} className="min-w-0 text-center">
      {body}
    </button>
  );
}

interface InstagramCoverProps {
  name: string;
  username?: string | null;
  userId?: string | null;
  avatar?: string | null;
  marcas: number;
  followers: number;
  following: number;
  bio: string;
  onAvatarClick?: () => void;
  avatarHint?: boolean;
  onFriendsClick?: () => void;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
}

export function InstagramCover({
  name,
  username,
  userId,
  avatar,
  marcas,
  followers,
  following,
  bio,
  onAvatarClick,
  avatarHint,
  onFriendsClick,
  onFollowersClick,
  onFollowingClick,
}: InstagramCoverProps) {
  const photo = (
    <span className="relative block">
      <Avatar src={avatar} userId={userId} name={name} className="h-16 w-16 rounded-full max-[360px]:h-14 max-[360px]:w-14 sm:h-[84px] sm:w-[84px]" />
      {avatarHint && (
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-slate-50 dark:ring-slate-950">
          <Camera size={12} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );

  return (
    <div>
      <div className="flex items-center gap-3 max-[360px]:gap-2 sm:gap-5">
        {onAvatarClick ? (
          <button type="button" onClick={onAvatarClick} className="shrink-0 rounded-full" aria-label="Cambiar foto">
            {photo}
          </button>
        ) : (
          <span className="shrink-0">{photo}</span>
        )}
        <div className="flex min-w-0 flex-1 justify-around">
          <ProfileStat value={marcas} label="marcas" />
          <ProfileStat value={followers} label="seguidores" onClick={onFollowersClick ?? onFriendsClick} />
          <ProfileStat value={following} label="seguidos" onClick={onFollowingClick ?? onFriendsClick} />
        </div>
      </div>
      <div className="mt-3">
        <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">{name}</p>
        {username && <p className="truncate text-[12px] text-slate-400">@{username}</p>}
        {bio.trim() ? (
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-slate-600 dark:text-slate-300">{bio}</p>
        ) : null}
      </div>
    </div>
  );
}

interface ProgressMiniProfileProps {
  user: User;
  friendCount?: number;
  marcaCount?: number;
  onOpenSettings?: () => void;
  onUpdateUser?: (updates: Partial<User>) => void;
  onOpenFriends?: () => void;
  onOpenFollowers?: () => void;
  onOpenFollowing?: () => void;
  refreshTick?: number;
  aside?: React.ReactNode;
}

export function ProgressMiniProfile({
  user,
  friendCount = 0,
  marcaCount = 0,
  onOpenSettings,
  onUpdateUser,
  onOpenFriends,
  onOpenFollowers,
  onOpenFollowing,
  refreshTick = 0,
  aside,
}: ProgressMiniProfileProps) {
  const [camOpen, setCamOpen] = useState(false);
  const [face, setFace] = useState(user.avatar || '');
  const [marcas, setMarcas] = useState(marcaCount);

  useEffect(() => {
    setMarcas(marcaCount);
  }, [marcaCount]);

  useEffect(() => {
    setFace(user.avatar || '');
  }, [user.avatar]);
  const [following, setFollowing] = useState(friendCount);
  const [followers, setFollowers] = useState(friendCount);
  const [statsReady, setStatsReady] = useState(false);
  const [bio, setBio] = useState('');
  const [savedBio, setSavedBio] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setStatsReady(false);
    fetchProfile(user.id)
      .then(p => {
        if (!live) return;
        setMarcas(p.trainingMaxes?.length ?? marcaCount);
        setFollowing(p.followingCount);
        setFollowers(p.followerCount);
        setBio(p.bio || '');
        setSavedBio(p.bio || '');
        if (hasRealAvatar(p.avatar)) {
          setFace(p.avatar || '');
          if (p.avatar && p.avatar !== user.avatar) onUpdateUser?.({ avatar: p.avatar });
        }
        setStatsReady(true);
      })
      .catch(() => {
        setStatsReady(true);
      });
    return () => {
      live = false;
    };
  }, [user.id, refreshTick]);

  const commitBio = async () => {
    const next = bio.trim().slice(0, 160);
    setEditing(false);
    if (next === savedBio) {
      setBio(next);
      return;
    }
    setSaving(true);
    try {
      await saveBio(next);
      setBio(next);
      setSavedBio(next);
    } catch {
      /* se puede reintentar */
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {user.name || 'Atleta'}
          </p>
          {aside}
        </div>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="app-icon-hit rounded-full text-slate-500 hover:bg-white dark:hover:bg-slate-900"
            aria-label="Ajustes"
          >
            <Settings size={20} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 max-[360px]:gap-2 sm:gap-5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setCamOpen(true)}
            className="relative rounded-full"
            aria-label="Cambiar foto de perfil"
          >
            <Avatar
              src={face || user.avatar}
              userId={user.id}
              name={user.name}
              className="h-16 w-16 rounded-full ring-2 ring-slate-200/80 dark:ring-slate-700 max-[360px]:h-14 max-[360px]:w-14 sm:h-[84px] sm:w-[84px]"
            />
            <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-slate-50 dark:ring-slate-950">
              <Camera size={12} strokeWidth={2.4} />
            </span>
          </button>
        </div>
        <div className="flex min-w-0 flex-1 justify-around">
          <ProfileStat value={marcas} label="marcas" loading={!statsReady} />
          <ProfileStat value={followers} label="seguidores" loading={!statsReady} onClick={onOpenFollowers ?? onOpenFriends} />
          <ProfileStat value={following} label="seguidos" loading={!statsReady} onClick={onOpenFollowing ?? onOpenFriends} />
        </div>
      </div>

      <div className="mt-2.5 max-w-[18rem]">
        {editing ? (
          <div>
            <textarea
              value={bio}
              autoFocus
              rows={2}
              maxLength={160}
              onChange={e => setBio(e.target.value.slice(0, 160))}
              onBlur={() => void commitBio()}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
                if (e.key === 'Escape') {
                  setBio(savedBio);
                  setEditing(false);
                }
              }}
              placeholder="Añade un resumen"
              className="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
            />
            <p className="mt-1 text-[10px] tabular-nums text-slate-400">{bio.length}/160</p>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-left">
            {bio.trim() ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">{bio}</p>
            ) : (
              <span className="text-[13px] text-slate-400">Añade un resumen</span>
            )}
            {saving && <span className="ml-2 text-[11px] text-slate-400">Guardando…</span>}
          </button>
        )}
      </div>

      <StoryCamera
        open={camOpen}
        mode="avatar"
        onClose={() => setCamOpen(false)}
        onPickImage={async file => {
          setCamOpen(false);
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('No se pudo leer la foto'));
            reader.readAsDataURL(file);
          }).catch(() => '');
          if (url) onUpdateUser?.({ avatar: url });
        }}
      />
    </section>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Settings } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { AvatarCropModal } from '@/src/components/AvatarCropModal';
import { fetchProfile, saveBio } from '@/src/lib/feedApi';
import { downscaleForCrop } from '@/src/lib/avatarCrop';
import type { User } from '@/src/types';

export function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-[16px] font-semibold leading-none text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

interface InstagramCoverProps {
  name: string;
  username?: string | null;
  avatar?: string | null;
  posts: number;
  followers: number;
  following: number;
  bio: string;
  onAvatarClick?: () => void;
  avatarHint?: boolean;
}

export function InstagramCover({
  name,
  username,
  avatar,
  posts,
  followers,
  following,
  bio,
  onAvatarClick,
  avatarHint,
}: InstagramCoverProps) {
  const photo = (
    <span className="relative block">
      <Avatar src={avatar} name={name} className="h-[76px] w-[76px] rounded-full sm:h-[84px] sm:w-[84px]" />
      {avatarHint && (
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-slate-50 dark:ring-slate-950">
          <Camera size={12} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );

  return (
    <div>
      <div className="flex items-center gap-5">
        {onAvatarClick ? (
          <button type="button" onClick={onAvatarClick} className="shrink-0 rounded-full" aria-label="Cambiar foto">
            {photo}
          </button>
        ) : (
          <span className="shrink-0">{photo}</span>
        )}
        <div className="flex min-w-0 flex-1 justify-around">
          <ProfileStat value={posts} label="publicaciones" />
          <ProfileStat value={followers} label="seguidores" />
          <ProfileStat value={following} label="seguidos" />
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
  onOpenSettings?: () => void;
  onUpdateUser?: (updates: Partial<User>) => void;
  aside?: React.ReactNode;
}

export function ProgressMiniProfile({
  user,
  friendCount = 0,
  onOpenSettings,
  onUpdateUser,
  aside,
}: ProgressMiniProfileProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [posts, setPosts] = useState(0);
  const [following, setFollowing] = useState(friendCount);
  const [followers, setFollowers] = useState(friendCount);
  const [bio, setBio] = useState('');
  const [savedBio, setSavedBio] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchProfile(user.id)
      .then(p => {
        if (!live) return;
        setPosts(p.postCount);
        setFollowing(p.followingCount);
        setFollowers(p.followerCount);
        setBio(p.bio || '');
        setSavedBio(p.bio || '');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user.id]);

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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white dark:hover:bg-slate-900"
            aria-label="Ajustes"
          >
            <Settings size={20} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative shrink-0 rounded-full"
          aria-label="Cambiar foto de perfil"
        >
          <Avatar
            src={user.avatar}
            name={user.name}
            className="h-[76px] w-[76px] rounded-full ring-2 ring-slate-200/80 dark:ring-slate-700 sm:h-[84px] sm:w-[84px]"
          />
          <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-slate-50 dark:ring-slate-950">
            <Camera size={12} strokeWidth={2.4} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !file.type.startsWith('image/')) return;
            try {
              setCropImage(await downscaleForCrop(file));
            } catch {
              /* foto inválida */
            }
          }}
        />
        <div className="flex min-w-0 flex-1 justify-around">
          <ProfileStat value={posts} label="publicaciones" />
          <ProfileStat value={followers} label="seguidores" />
          <ProfileStat value={following} label="seguidos" />
        </div>
      </div>

      <div className="mt-3">
        {editing ? (
          <textarea
            value={bio}
            autoFocus
            rows={2}
            maxLength={160}
            onChange={e => setBio(e.target.value.slice(0, 160))}
            onBlur={() => void commitBio()}
            placeholder="Un mini texto sobre ti…"
            className="mt-1.5 w-full resize-none rounded-xl bg-white px-3 py-2 text-[13px] text-slate-800 outline-none ring-1 ring-indigo-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-indigo-900"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 w-full text-left">
            {bio.trim() ? (
              <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-600 dark:text-slate-300">{bio}</p>
            ) : (
              <p className="text-[13px] text-slate-400">Añade un texto, como en Instagram…</p>
            )}
            {saving && <p className="mt-0.5 text-[11px] text-slate-400">Guardando…</p>}
          </button>
        )}
      </div>

      <AvatarCropModal
        image={cropImage}
        onCancel={() => setCropImage(null)}
        onConfirm={dataUrl => {
          onUpdateUser?.({ avatar: dataUrl });
          setCropImage(null);
        }}
      />
    </section>
  );
}

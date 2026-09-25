import React, { useCallback, useEffect, useState } from 'react';
import { animate as animateValue, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import {
  ArrowLeft,
  Ban,
  Check,
  Dumbbell,
  FileUp,
  Flag,
  GraduationCap,
  Handshake,
  MapPin,
  MessageCircle,
  UserMinus,
  MoreHorizontal,
  Pencil,
  Trophy,
  UserPlus,
} from 'lucide-react';
import { CoverSkeleton, LoadingBlock } from '@/src/components/ui/Spinner';
import { cn } from '@/src/lib/utils';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/src/lib/api';
import { Avatar } from '@/src/components/social/MediaPost';
import {
  fetchProfile,
  removeCoach,
  requestCoach,
  saveBio,
  type PublicProfile,
} from '@/src/lib/feedApi';
import { TmHistoryModal } from '@/src/components/social/TmHistoryModal';
import { InstagramCover } from '@/src/components/social/ProgressMiniProfile';
import { CloseFriendButton } from '@/src/components/social/CloseFriendButton';
import { CloseFriendsModal } from '@/src/components/social/CloseFriendsModal';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { blockUser, reportUser, unblockUser } from '@/src/lib/privacyApi';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { weekOfYearFromDate } from '@/src/lib/mesocycleWeek';
import { createEmptyTemplate, expandRoutineFromApi } from '@/src/lib/planMaterialize';
import { mergeCoachImportIntoRoutine } from '@/src/lib/coachPlan/applyCoachPlan';
import { buildPlanPatchPayload } from '@/src/lib/planSyncPayload';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import type { ImportCoachPlanResult } from '@/src/components/ImportCoachPlanModal';
import { CoachAthletePlan } from '@/src/components/social/CoachAthletePlan';

const ImportCoachPlanModal = React.lazy(() =>
  import('@/src/components/ImportCoachPlanModal').then(m => ({ default: m.ImportCoachPlanModal }))
);

interface ProfileScreenProps {
  userId: string;
  onBack?: () => void;
  onOpenRoutine?: () => void;
  onSendFriendRequest?: () => Promise<void> | void;
  onAcceptFriend?: () => Promise<void> | void;
  onRejectFriend?: () => Promise<void> | void;
  onOpenProfile?: (userId: string) => void;
  onOpenChat?: (userId: string) => void;
  onOpenFriends?: (filter?: 'all' | 'following' | 'followers') => void;
  /** Foto actual de la sesión: así Perfil y Progreso enseñan la misma. */
  liveAvatar?: string | null;
}

const PEEK_HEAD_H = 40;
const PEEK_ROW_H = 58;

function tmAccent(name: string): { color: string; text: string } {
  const lower = name.toLowerCase();
  if (lower.includes('banca') || lower.includes('bench')) return { color: '#3b82f6', text: 'text-blue-600' };
  if (lower.includes('sentadilla') || lower.includes('squat')) return { color: '#10b981', text: 'text-emerald-600' };
  if (lower.includes('muerto') || lower.includes('dead')) return { color: '#f43f5e', text: 'text-rose-600' };
  return { color: '#6366f1', text: 'text-indigo-600' };
}

function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(raw, v => String(Math.round(v * 10) / 10));
  useEffect(() => {
    if (reduceMotion) {
      raw.set(value);
      return;
    }
    raw.set(0);
    const controls = animateValue(raw, value, {
      duration: Math.min(1.4, Math.max(0.35, 0.28 + Math.abs(value) / 260)),
      ease: [0.16, 0.84, 0.12, 1],
      delay,
    });
    return () => controls.stop();
  }, [value, raw, reduceMotion, delay]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

function ProfilePeek({
  title,
  kind,
  rows,
  empty,
}: {
  title: string;
  kind: 'trophy' | 'pin';
  rows: { key: string; title: string; subtitle: string; dot?: boolean }[];
  empty: string;
}) {
  return (
    <div
      className="overflow-y-auto overflow-x-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] [scrollbar-width:none] dark:bg-slate-900 dark:ring-white/[0.06] [&::-webkit-scrollbar]:hidden"
      style={{ maxHeight: PEEK_HEAD_H + 2 * PEEK_ROW_H }}
    >
      <div
        className="flex items-center gap-2 border-b border-slate-100 px-2.5 dark:border-slate-800 sm:px-3"
        style={{ height: PEEK_HEAD_H }}
      >
        {kind === 'trophy' ? (
          <Trophy size={14} className="shrink-0 text-amber-500" />
        ) : (
          <MapPin size={14} className="shrink-0 text-emerald-500" />
        )}
        <span className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">{title}</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center justify-center px-3 text-center" style={{ height: PEEK_ROW_H }}>
          <p className="text-[11px] font-medium text-slate-400">{empty}</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {rows.slice(0, 4).map(row => (
            <motion.div
              key={row.key}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: PEEK_ROW_H }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="flex items-center gap-2 border-b border-slate-100 px-2.5 last:border-0 dark:border-slate-800 sm:px-3"
            >
              {kind === 'trophy' ? (
                <Trophy size={15} className="shrink-0 text-amber-500" />
              ) : (
                <MapPin size={15} className="shrink-0 text-emerald-500" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                  {row.dot && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Estás dentro" />}
                  <span className="truncate">{row.title}</span>
                </span>
                <span className="block truncate text-[10px] text-slate-400">{row.subtitle}</span>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  onClick,
}: {
  value: number | string;
  label: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-lg font-black leading-none text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{label}</p>
    </>
  );
  if (!onClick) return <div className="text-center">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="text-center">
      {body}
    </button>
  );
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userId,
  onBack,
  onSendFriendRequest,
  onAcceptFriend,
  onRejectFriend,
  onOpenProfile,
  onOpenChat,
  onOpenFriends,
  liveAvatar,
}) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingCoach, setSavingCoach] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [showAthleteImport, setShowAthleteImport] = useState(false);
  const [showAthleteEditor, setShowAthleteEditor] = useState(false);
  const [openTm, setOpenTm] = useState<{ id?: string; name: string; value: number; mode: string } | null>(null);
  const [blocked, setBlocked] = useState<'you' | 'them' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setBlocked(null);
      try {
        const data = await fetchProfile(userId);
        if (cancelled) return;
        setProfile(data);
        setBioDraft(data.bio);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = String((e as { message?: string })?.message || '');
        if (/te ha bloqueado/i.test(msg)) setBlocked('them');
        else if (/has bloqueado/i.test(msg)) setBlocked('you');
        setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const commitBio = useCallback(async () => {
    setEditingBio(false);
    const bio = bioDraft.trim();
    setProfile(prev => (prev ? { ...prev, bio } : prev));
    await saveBio(bio).catch(() => {});
  }, [bioDraft]);

  /** Pedirle a este perfil que te entrene, o invitale a que tú le entrenes. El otro acepta en Actividad. */
  const askCoachLink = useCallback(async (role: 'ask' | 'invite') => {
    setSavingCoach(true);
    try {
      await requestCoach(userId, role);
      setProfile(prev =>
        prev
          ? {
              ...prev,
              coachRequestStatus: role === 'ask' ? 'pending' : prev.coachRequestStatus,
              athleteInviteStatus: role === 'invite' ? 'pending' : prev.athleteInviteStatus,
            }
          : prev
      );
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido enviar la solicitud');
    } finally {
      setSavingCoach(false);
    }
  }, [userId]);

  const applyImportToAthlete = useCallback(async (opts: ImportCoachPlanResult) => {
    const athleteName = profile?.name || 'Alumno';
    let raw: any;
    try {
      raw = await apiGet<any>(`/api/routines/athlete/${userId}`);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!msg.includes('no tiene rutina')) throw e;
      const bt = createEmptyTemplate(4);
      raw = await apiPost<any>('/api/routines', {
        name: `Plan de ${athleteName}`,
        forAthleteId: userId,
        sameTemplateAllWeeks: false,
        cycleLength: 4,
        isActive: true,
        baseTemplate: bt,
        versions: [{ effectiveFromWeek: 1, weeks: bt }],
      });
    }
    const expanded = expandRoutineFromApi({
      _id: raw._id,
      id: raw.id,
      name: raw.name,
      sameTemplateAllWeeks: raw.sameTemplateAllWeeks,
      cycleLength: raw.cycleLength,
      cycleAnchorISO: raw.cycleAnchorISO,
      weekStartsOn: raw.weekStartsOn,
      skippedWeeks: raw.skippedWeeks,
      shiftedAtCalendarWeeks: raw.shiftedAtCalendarWeeks,
      weeks: raw.weeks,
      versions: raw.versions,
      baseTemplate: raw.baseTemplate,
      weekTypeOverrides: raw.weekTypeOverrides,
      logs: raw.logs,
    });
    const year = new Date().getFullYear();
    const cycleLength = Math.max(
      1,
      Math.min(52, opts.cycleLength || opts.plan.weeks.length || expanded.cycleLength || 4)
    );
    const merged = mergeCoachImportIntoRoutine(expanded, {
      plan: opts.plan,
      startWeekNumber: opts.startWeekNumber,
      repeatAfterPlan: opts.repeatAfterPlan,
      cycleLength,
      clearUntouchedDays: opts.clearUntouchedDays,
      continuesPreviousPlan: opts.continuesPreviousPlan,
      currentWeekOfYear: weekOfYearFromDate(new Date(), year),
      week1ISO: opts.week1ISO,
      weekStartsOn: opts.weekStartsOn,
    });
    await apiPatch(`/api/routines/${expanded.id}/plan`, buildPlanPatchPayload(merged));
    if (opts.importMaxes && opts.plan.maxes.length) {
      const existing = await apiGet<any[]>(`/api/training-maxes?routineId=${expanded.id}`).catch(() => []);
      const have = new Set(
        (Array.isArray(existing) ? existing : []).map((t: any) => normalizeExerciseNameKey(t.name))
      );
      for (const max of opts.plan.maxes) {
        if (have.has(normalizeExerciseNameKey(max.name))) continue;
        try {
          await apiPost('/api/training-maxes', {
            routineId: expanded.id,
            name: max.name,
            value: max.value,
            mode: 'weight',
            sharedToSocial: true,
          });
          have.add(normalizeExerciseNameKey(max.name));
        } catch {
          /* el plan ya está */
        }
      }
    }
  }, [profile?.name, userId]);

  const dropCoach = useCallback(async () => {
    setSavingCoach(true);
    try {
      await removeCoach();
      setProfile(prev => (prev ? { ...prev, coach: null } : prev));
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido quitar el entrenador');
    } finally {
      setSavingCoach(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600 dark:text-slate-400"
          >
            <ArrowLeft size={16} />
            Volver
          </button>
        ) : null}
        <CoverSkeleton />
        <LoadingBlock className="py-10" label="Cargando perfil" />
      </div>
    );
  }
  if (!profile) {
    if (blocked === 'them') {
      return <p className="py-12 text-center text-sm text-slate-400">Te ha bloqueado.</p>;
    }
    if (blocked === 'you') {
      return (
        <div className="space-y-4 py-10 text-center">
          <p className="text-sm text-slate-500">Has bloqueado a esta persona.</p>
          <button
            type="button"
            disabled={privacyBusy}
            onClick={async () => {
              setPrivacyBusy(true);
              try {
                await unblockUser(userId);
                setBlocked(null);
                const data = await fetchProfile(userId);
                setProfile(data);
                setBioDraft(data.bio);
              } finally {
                setPrivacyBusy(false);
              }
            }}
            className="min-h-11 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
          >
            Desbloquear
          </button>
        </div>
      );
    }
    return <p className="py-12 text-center text-sm text-slate-400">No se ha podido cargar el perfil.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600 dark:text-slate-400"
          >
            <ArrowLeft size={16} />
            Volver
          </button>
        ) : (
          <span />
        )}
        {!profile.isSelf && (
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500"
                aria-label="Más opciones"
              >
                <MoreHorizontal size={20} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-rose-600"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmBlock(true);
                      }}
                    >
                      <Ban size={15} />
                      Bloquear
                    </button>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
                      onClick={async () => {
                        setMenuOpen(false);
                        await reportUser(userId).catch(() => {});
                        window.alert('Gracias. Hemos recibido el aviso.');
                      }}
                    >
                      <Flag size={15} />
                      Reportar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className={profile.isSelf ? 'rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900' : ''}
      >
        {profile.isSelf ? (
        <div className="flex items-center gap-5">
          <span className="rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 p-[3px]">
            <span className="block rounded-full border-[3px] border-white dark:border-slate-900">
              <Avatar
                name={profile.name}
                avatar={liveAvatar != null && liveAvatar !== '' ? liveAvatar : profile.avatar}
                userId={profile.id}
                size={82}
              />
            </span>
          </span>
          <div className="flex flex-1 justify-around">
            <Stat value={profile.trainingMaxes?.length ?? 0} label="Marcas" />
            <Stat value={profile.followerCount} label="Seguidores" onClick={() => onOpenFriends?.('followers')} />
            <Stat value={profile.followingCount} label="Siguiendo" onClick={() => onOpenFriends?.('following')} />
          </div>
        </div>
        ) : (
          <InstagramCover
            name={profile.name}
            username={profile.username}
            userId={profile.id}
            avatar={profile.avatar}
            marcas={profile.trainingMaxes?.length ?? 0}
            followers={profile.followerCount}
            following={profile.followingCount}
            bio={profile.bio || ''}
            onFollowersClick={() => onOpenFriends?.('followers')}
            onFollowingClick={() => onOpenFriends?.('following')}
          />
        )}

        <div className={profile.isSelf ? 'mt-4' : 'mt-3'}>
          {profile.isSelf ? (
            <>
          <p className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">{profile.name}</p>
          {profile.username && <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">@{profile.username}</p>}
            <button
              type="button"
              onClick={() => setCloseOpen(true)}
              className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-2xl bg-slate-50 px-3 text-left dark:bg-slate-800/70"
            >
              <Handshake size={16} className="text-emerald-500" />
              <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Mejores amigos</span>
            </button>
            </>
          ) : null}

          {profile.isSelf && editingBio ? (
            <div className="mt-2 flex items-start gap-2">
              <textarea
                value={bioDraft}
                onChange={e => setBioDraft(e.target.value)}
                rows={2}
                maxLength={300}
                autoFocus
                placeholder="Categoría, gimnasio, objetivos…"
                className="flex-1 resize-none rounded-xl border-2 border-slate-200 bg-white p-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button type="button" onClick={commitBio} className="rounded-xl bg-indigo-600 p-2.5 text-white" aria-label="Guardar biografía">
                <Check size={16} />
              </button>
            </div>
          ) : profile.isSelf ? (
            <button
              type="button"
              onClick={() => setEditingBio(true)}
              className="mt-1.5 flex w-full items-start gap-2 text-left"
            >
              <span className={cn('flex-1 text-sm', profile.bio ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400')}>
                {profile.bio || 'Añade una biografía'}
              </span>
              <Pencil size={13} className="mt-1 shrink-0 text-slate-400" />
            </button>
          ) : null}

          {profile.isSelf && (
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.coach && (
              <button
                type="button"
                onClick={() => onOpenProfile?.(profile.coach!.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1.5 text-[11px] font-black text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
              >
                <GraduationCap size={13} />
                Entrena con {profile.coach.name}
              </button>
            )}
            {profile.athleteCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <GraduationCap size={13} />
                {profile.athleteCount} {profile.athleteCount === 1 ? 'alumno' : 'alumnos'}
              </span>
            )}
            {profile.routineName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Dumbbell size={13} />
                {profile.routineName}
              </span>
            )}
          </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {profile.isSelf ? (
            profile.coach ? (
              <button
                type="button"
                onClick={dropCoach}
                disabled={savingCoach}
                className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-500 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400"
              >
                Dejar de entrenar con {profile.coach.name.split(' ')[0]}
              </button>
            ) : (
              <p className="flex-1 rounded-xl bg-white/70 px-3 py-2.5 text-center text-[11px] font-medium text-slate-400 dark:bg-slate-800/60">
                Entra en el perfil de un amigo para pedirle que te entrene o para ofrecerte como coach.
              </p>
            )
          ) : (
            <>
              {(profile.isFriend || profile.friendshipStatus === 'following' || profile.friendshipStatus === 'accepted') && (
                <CloseFriendButton
                  labeled
                  userId={userId}
                  name={profile.name}
                  avatar={profile.avatar}
                  className="!w-auto flex-1 justify-center"
                />
              )}
              {(profile.isFriend || profile.friendshipStatus === 'following' || profile.friendshipStatus === 'accepted') && (
                <button
                  type="button"
                  aria-label="Dejar de ser amigo"
                  onClick={() => setConfirmLeave(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-300"
                >
                  <UserMinus size={16} />
                </button>
              )}
              {onOpenChat && (
                <button
                  type="button"
                  onClick={() => onOpenChat(userId)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-black uppercase tracking-wider text-white"
                >
                  <MessageCircle size={15} />
                  Chat
                </button>
              )}
              {profile.isFriend ? (
                <>
                  {profile.iAmTheirCoach && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAthleteEditor(true)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-black uppercase tracking-wider text-white"
                      >
                        <Pencil size={15} />
                        Editar su plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAthleteImport(true)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-amber-300 py-2.5 text-xs font-black uppercase tracking-wider text-amber-700 dark:border-amber-800 dark:text-amber-300"
                      >
                        <FileUp size={15} />
                        Subir Word
                      </button>
                    </>
                  )}
                </>
              ) : profile.friendshipStatus === 'pending' && profile.friendshipDirection === 'incoming' ? (
                <div className="flex flex-1 gap-2">
                  {onRejectFriend && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onRejectFriend();
                        setProfile(prev =>
                          prev
                            ? { ...prev, friendshipStatus: 'none', friendshipDirection: null, canSendRequest: true, isFriend: false }
                            : prev
                        );
                      }}
                      className="flex-1 rounded-xl border-2 border-rose-200 py-2.5 text-xs font-black uppercase tracking-wider text-rose-500 dark:border-rose-900"
                    >
                      Rechazar
                    </button>
                  )}
                  {onAcceptFriend && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onAcceptFriend();
                        const fresh = await fetchProfile(userId).catch(() => null);
                        if (fresh) setProfile(fresh);
                        else {
                          setProfile(prev =>
                            prev
                              ? { ...prev, isFriend: false, friendshipStatus: 'follower', friendshipDirection: 'incoming', canSendRequest: true }
                              : prev
                          );
                        }
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-black uppercase tracking-wider text-white"
                    >
                      <Check size={15} />
                      Aceptar
                    </button>
                  )}
                </div>
              ) : profile.friendshipStatus === 'pending' || profile.friendshipStatus === 'following' || requestSent ? (
                <span className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-xs font-black uppercase tracking-wider text-slate-400 dark:bg-slate-800">
                  {profile.friendshipStatus === 'following' ? 'Siguiendo' : 'Solicitud enviada'}
                </span>
              ) : (
                onSendFriendRequest && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onSendFriendRequest();
                      setRequestSent(true);
                      setProfile(prev =>
                        prev
                          ? { ...prev, friendshipStatus: 'pending', friendshipDirection: 'outgoing', canSendRequest: false }
                          : prev
                      );
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-black uppercase tracking-wider text-white"
                  >
                    <UserPlus size={15} />
                    {profile.friendshipStatus === 'follower' ? 'Enviar solicitud' : 'Añadir amigo'}
                  </button>
                )
              )}

            </>
          )}
        </div>

        {profile.isSelf && profile.trainingMaxes.length > 0 && (
          <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Marcas · toca una para ver cómo ha subido
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.trainingMaxes.map((tm, i) => (
                <button
                  key={tm.id || i}
                  type="button"
                  onClick={() => setOpenTm(tm)}
                  className="inline-flex items-baseline gap-1.5 rounded-xl bg-white px-3 py-2 shadow-sm transition-transform hover:-translate-y-0.5 dark:bg-slate-800"
                >
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{tm.name}</span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {tm.value}
                    <span className="ml-0.5 text-[10px] font-medium text-slate-400">
                      {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {!profile.isSelf && profile.trainingMaxes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.05 }}
        >
          <div className={cn('grid gap-2', profile.trainingMaxes.length <= 2 ? 'grid-cols-2' : 'grid-cols-3')}>
            {profile.trainingMaxes.map((tm, index) => {
              const accent = tmAccent(tm.name);
              const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
              return (
                <motion.button
                  key={tm.id || index}
                  type="button"
                  onClick={() => setOpenTm(tm)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index, duration: 0.28, ease: EASE_OUT }}
                  whileTap={{ scale: 0.97 }}
                  className="relative min-w-0 overflow-hidden rounded-2xl bg-white px-2.5 pb-2.5 pt-3 text-left shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06]"
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: accent.color }} />
                  <span
                    className="pointer-events-none absolute -right-5 -top-6 h-16 w-16 rounded-full opacity-40 blur-2xl"
                    style={{ background: accent.color }}
                  />
                  <span className={cn('relative block truncate text-[11px] font-semibold', accent.text)}>{tm.name}</span>
                  <span className="relative mt-1 block truncate text-[22px] font-black leading-none text-slate-900 dark:text-white">
                    <CountUp value={Math.round(tm.value * 10) / 10} delay={0.02 * index} />
                    <span className="ml-0.5 text-[10px] font-semibold text-slate-400">{unit}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Toca una marca para ver la gráfica</p>
        </motion.div>
      )}

      {!profile.isSelf && profile.todayPlan && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.1 }}
          className="flex w-full items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-left shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <Dumbbell size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Hoy · {profile.todayPlan.title}
            </span>
            {profile.todayPlan.rest ? (
              <span className="mt-0.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Día de descanso</span>
            ) : (
              <span className="mt-0.5 block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {profile.todayPlan.lifts.join(' · ')}
                {profile.todayPlan.more > 0 ? ` +${profile.todayPlan.more}` : ''}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-indigo-600">{profile.todayPlan.name || 'Rutina'}</span>
        </motion.div>
      )}

      {!profile.isSelf && profile.theyFollowMe && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.14 }}
          className="grid grid-cols-2 gap-2 max-[360px]:gap-1.5"
        >
          {(profile.challenges || []).length > 0 && (
          <ProfilePeek
            title="Torneos"
            kind="trophy"
            empty="Sin torneos"
            rows={(profile.challenges || []).map((c, i) => ({
              key: `ch-${i}`,
              title: c.title,
              subtitle: c.exercise || 'Torneo',
              dot: !!c.viewerIn,
            }))}
          />
          )}
          <ProfilePeek
            title="Avisar que voy"
            kind="pin"
            empty="No ha dicho a qué hora va"
            rows={(profile.gymPlans || []).map((g, i) => ({
              key: `gym-${i}`,
              title: g.gymName,
              subtitle: g.time,
            }))}
          />
        </motion.div>
      )}

      {profile.isSelf && profile.trainingMaxes.length === 0 ? (
        <div className="flex w-full items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <Dumbbell size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-slate-900 dark:text-slate-100">
              Enseña tus marcas
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              En Rutina, comparte los RM que quieras que vean tus amigos.
            </span>
          </span>
        </div>
      ) : null}

      {showAthleteImport && (
        <React.Suspense fallback={null}>
          <ImportCoachPlanModal
            currentWeekNumber={weekOfYearFromDate(new Date(), new Date().getFullYear())}
            routineName={`Plan de ${profile?.name || 'alumno'}`}
            onClose={() => setShowAthleteImport(false)}
            onConfirm={async (result) => {
              await applyImportToAthlete(result);
              setShowAthleteImport(false);
              const fresh = await fetchProfile(userId).catch(() => null);
              if (fresh) setProfile(fresh);
            }}
          />
        </React.Suspense>
      )}

      {openTm && (
        <TmHistoryModal userId={userId} tm={openTm} onClose={() => setOpenTm(null)} />
      )}

      <CloseFriendsModal open={closeOpen} onClose={() => setCloseOpen(false)} />
      <GlassModal
        open={confirmLeave}
        onClose={() => !privacyBusy && setConfirmLeave(false)}
        center
        title="¿Dejar de ser amigo?"
        subtitle={profile.name}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={privacyBusy}
              onClick={() => setConfirmLeave(false)}
              className="min-h-11 flex-1 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={privacyBusy}
              onClick={async () => {
                setPrivacyBusy(true);
                try {
                  await apiDelete(`/api/social/friends/${userId}`);
                  const fresh = await fetchProfile(userId).catch(() => null);
                  if (fresh) setProfile(fresh);
                  else {
                    setProfile(prev =>
                      prev
                        ? { ...prev, isFriend: false, friendshipStatus: 'none', friendshipDirection: null, canSendRequest: true }
                        : prev
                    );
                  }
                  setConfirmLeave(false);
                } finally {
                  setPrivacyBusy(false);
                }
              }}
              className="min-h-11 flex-1 rounded-xl bg-rose-500 text-sm font-semibold text-white"
            >
              Dejar de ser amigo
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Dejáis de ser amigos. Podéis volver a enviaros solicitud cuando queráis.
        </p>
      </GlassModal>
      <GlassModal
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        center
        frost
        title="¿Bloquear?"
        subtitle={`${profile.name.split(' ')[0]} no verá tus historias, chat ni avisos`}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmBlock(false)}
              className="min-h-11 flex-1 rounded-full bg-white/10 text-sm font-semibold text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={privacyBusy}
              onClick={async () => {
                setPrivacyBusy(true);
                try {
                  await blockUser(userId);
                  setConfirmBlock(false);
                  onBack?.();
                } finally {
                  setPrivacyBusy(false);
                }
              }}
              className="min-h-11 flex-1 rounded-full bg-rose-500 text-sm font-semibold text-white"
            >
              Bloquear
            </button>
          </div>
        }
      >
        <p className="text-sm text-white/60">También deja de seguirle y le quita de mejores amigos.</p>
      </GlassModal>

      {showAthleteEditor && (
        <CoachAthletePlan
          athleteId={userId}
          athleteName={profile?.name || 'Alumno'}
          onClose={() => {
            setShowAthleteEditor(false);
            void fetchProfile(userId).then(fresh => setProfile(fresh)).catch(() => {});
          }}
        />
      )}
    </div>
  );
};

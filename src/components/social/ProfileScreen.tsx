import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Dumbbell,
  FileUp,
  GraduationCap,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  UserPlus,
  X,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { apiGet, apiPatch, apiPost, mediaUrl } from '@/src/lib/api';
import { Avatar, MediaPost } from '@/src/components/social/MediaPost';
import { PublishModal } from '@/src/components/social/PublishModal';
import {
  fetchProfile,
  fetchUserPosts,
  removeCoach,
  requestCoach,
  saveBio,
  type FeedPost,
  type PublicProfile,
} from '@/src/lib/feedApi';
import { TmHistoryModal } from '@/src/components/social/TmHistoryModal';
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
  onOpenProfile?: (userId: string) => void;
  /** Llevar a Inicio desde el perfil vacío para publicar la primera foto. */
  onGoToFeed?: () => void;
  onOpenChat?: (userId: string) => void;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-black leading-none text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userId,
  onBack,
  onOpenRoutine,
  onSendFriendRequest,
  onOpenProfile,
  onGoToFeed,
  onOpenChat,
}) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingCoach, setSavingCoach] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [showAthleteImport, setShowAthleteImport] = useState(false);
  const [showAthleteEditor, setShowAthleteEditor] = useState(false);
  const [openTm, setOpenTm] = useState<{ id?: string; name: string; value: number; mode: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPosts([]);
      try {
        const data = await fetchProfile(userId);
        if (cancelled) return;
        setProfile(data);
        setBioDraft(data.bio);
        if (data.isFriend) {
          const mine = await fetchUserPosts(userId).catch(() => ({ posts: [] as FeedPost[] }));
          if (!cancelled) setPosts(mine.posts);
        }
      } catch {
        if (!cancelled) setProfile(null);
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

  /** Pedirle a este perfil que te entrene. Solo se confirma cuando él acepta en Actividad. */
  const askToBeMyCoach = useCallback(async () => {
    setSavingCoach(true);
    try {
      await requestCoach(userId);
      setProfile(prev => (prev ? { ...prev, coachRequestStatus: 'pending' } : prev));
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

  /** Lo subido desde el perfil entra directo en la rejilla, sin recargar nada. */
  const handlePublished = useCallback((post: FeedPost) => {
    if (post.kind === 'story') return;
    setPosts(prev => [post, ...prev]);
    setProfile(prev => (prev ? { ...prev, postCount: prev.postCount + 1 } : prev));
  }, []);

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
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }
  if (!profile) {
    return <p className="py-12 text-center text-sm text-slate-400">No se ha podido cargar el perfil.</p>;
  }

  return (
    <div className="space-y-5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600 dark:text-slate-400"
        >
          <ArrowLeft size={16} />
          Volver
        </button>
      )}

      {/* Portada: avatar grande y contadores, como en cualquier red */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="rounded-3xl border border-slate-100 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900"
      >
        <div className="flex items-center gap-5">
          <span className="rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 p-[3px]">
            <span className="block rounded-full border-[3px] border-white dark:border-slate-900">
              <Avatar name={profile.name} avatar={profile.avatar} size={82} />
            </span>
          </span>
          <div className="flex flex-1 justify-around">
            <Stat value={profile.postCount} label="Posts" />
            <Stat value={profile.followerCount} label="Seguidores" />
            <Stat value={profile.followingCount} label="Siguiendo" />
          </div>
        </div>

        <div className="mt-4">
          <p className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">{profile.name}</p>
          {profile.username && <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">@{profile.username}</p>}

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
          ) : (
            profile.bio && <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{profile.bio}</p>
          )}

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
                Entra en el perfil de un amigo para pedirle que te entrene.
              </p>
            )
          ) : (
            <>
              {profile.isFriend ? (
                <>
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
                  {onOpenRoutine && (
                    <button
                      type="button"
                      onClick={onOpenRoutine}
                      className="flex-1 rounded-xl border-2 border-indigo-200 py-2.5 text-xs font-black uppercase tracking-wider text-indigo-600 dark:border-indigo-800 dark:text-indigo-300"
                    >
                      Ver su rutina
                    </button>
                  )}
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
              ) : profile.friendshipStatus === 'pending' || requestSent ? (
                <span className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-xs font-black uppercase tracking-wider text-slate-400 dark:bg-slate-800">
                  Solicitud enviada
                </span>
              ) : (
                onSendFriendRequest && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onSendFriendRequest();
                      setRequestSent(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-black uppercase tracking-wider text-white"
                  >
                    <UserPlus size={15} />
                    Añadir amigo
                  </button>
                )
              )}

              {profile.isFriend && (
                <button
                  type="button"
                  onClick={askToBeMyCoach}
                  disabled={savingCoach || profile.coachRequestStatus !== 'none'}
                  title="Le llegará una solicitud y tendrá que aceptarla"
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-70',
                    profile.coachRequestStatus === 'accepted'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : profile.coachRequestStatus === 'pending'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300'
                  )}
                >
                  <GraduationCap size={15} />
                  {profile.coachRequestStatus === 'accepted'
                    ? 'Es tu entrenador'
                    : profile.coachRequestStatus === 'pending'
                      ? 'Pendiente'
                      : 'Que me entrene'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Las marcas viven en la propia ficha: son la carta de presentación, no una pestaña */}
        {profile.isFriend && profile.trainingMaxes.length > 0 && (
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

      {/* Subir sin salir del perfil: la acción principal, bien visible pero sin ruido */}
      {profile.isSelf && (
        <motion.button
          type="button"
          onClick={() => setComposing(true)}
          whileTap={{ scale: 0.98 }}
          whileHover={{ y: -1 }}
          className="flex w-full items-center gap-3 rounded-2xl bg-indigo-600 px-4 py-3 text-left text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700 dark:shadow-indigo-950/50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Camera size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black tracking-tight">Subir foto o vídeo</span>
            <span className="block text-[11px] text-white/70">Aparece aquí y en Inicio</span>
          </span>
        </motion.button>
      )}

      {!profile.isFriend ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Hazte amigo de {profile.name.split(' ')[0]} para ver sus publicaciones y sus marcas.
        </p>
      ) : posts.length === 0 ? (
        /* Perfil recién estrenado: en vez de una rejilla vacía, qué hacer ahora */
        <div className="space-y-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            {profile.isSelf ? 'Empieza por aquí' : `${profile.name.split(' ')[0]} aún no ha publicado nada`}
          </p>

          <button
            type="button"
            onClick={profile.isSelf ? () => setComposing(true) : undefined}
            disabled={!profile.isSelf}
            className="flex w-full items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-colors enabled:hover:border-indigo-300 disabled:cursor-default dark:border-slate-700 dark:bg-slate-900"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              <Camera size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-slate-900 dark:text-slate-100">
                {profile.isSelf ? 'Sube tu primera foto o vídeo' : 'Sin publicaciones'}
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {profile.isSelf
                  ? 'Una serie buena, un PR, lo que sea. Lo verán tus amigos en Inicio.'
                  : 'Cuando publique algo lo verás aquí y en Inicio.'}
              </span>
            </span>
            {profile.isSelf && <ArrowRight size={18} className="shrink-0 text-slate-300" />}
          </button>

          {profile.isSelf && onGoToFeed && (
            <button
              type="button"
              onClick={onGoToFeed}
              className="w-full py-1 text-center text-[11px] font-black uppercase tracking-wider text-slate-400 transition-colors hover:text-indigo-600"
            >
              Ver Inicio
            </button>
          )}

          {profile.trainingMaxes.length === 0 && (
            <div className="flex w-full items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                <Dumbbell size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900 dark:text-slate-100">
                  {profile.isSelf ? 'Enseña tus marcas' : 'Sin marcas compartidas'}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {profile.isSelf
                    ? 'En Rutina, comparte los RM que quieras que vean tus amigos. Si subes uno, podrán felicitarte.'
                    : 'Todavía no comparte ningún RM.'}
                </span>
              </span>
            </div>
          )}

        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Publicaciones</p>
          <div className="grid grid-cols-3 gap-1">
            {profile.isSelf && (
              <motion.button
                type="button"
                onClick={() => setComposing(true)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700"
                aria-label="Subir foto o vídeo"
              >
                <Plus size={22} strokeWidth={2.5} />
                <span className="text-[10px] font-black uppercase tracking-wider">Subir</span>
              </motion.button>
            )}
            {posts.map((p, i) => (
              <motion.button
                key={p.id}
                type="button"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i, 8) * 0.04, type: 'spring', stiffness: 260, damping: 24 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setOpenPost(p)}
                className="group relative aspect-square overflow-hidden rounded-md bg-slate-950"
              >
                {p.mediaType === 'video' ? (
                  <>
                    <video src={mediaUrl(p.mediaKey)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    <Play size={16} className="absolute right-1.5 top-1.5 fill-white text-white drop-shadow" />
                  </>
                ) : (
                  <img src={mediaUrl(p.mediaKey)} alt={p.caption || ''} loading="lazy" className="h-full w-full object-cover" />
                )}
                <span className="absolute inset-0 hidden items-center justify-center gap-4 bg-black/45 text-xs font-black text-white group-hover:flex">
                  <span className="flex items-center gap-1">
                    <Heart size={14} fill="currentColor" />
                    {p.likeCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle size={14} fill="currentColor" />
                    {p.commentCount}
                  </span>
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {openPost && (
              <motion.div
                key="post-detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpenPost(null)}
                className="fixed inset-0 flex items-center justify-center bg-slate-900/70 p-0 backdrop-blur-sm sm:p-6"
                style={{ zIndex: 100050 }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 10 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  onClick={e => e.stopPropagation()}
                  className="max-h-[92vh] w-full max-w-lg overflow-y-auto"
                >
                  <div className="flex justify-end p-2">
                    <button
                      type="button"
                      onClick={() => setOpenPost(null)}
                      className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                      aria-label="Cerrar"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <MediaPost
                    post={openPost}
                    autoOpenComments
                    onChanged={updated => {
                      setOpenPost(updated);
                      setPosts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
                    }}
                    onDeleted={id => {
                      setPosts(prev => prev.filter(p => p.id !== id));
                      setProfile(prev => (prev ? { ...prev, postCount: Math.max(0, prev.postCount - 1) } : prev));
                      setOpenPost(null);
                    }}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {composing && (
        <PublishModal
          onClose={() => setComposing(false)}
          onPublished={handlePublished}
        />
      )}

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

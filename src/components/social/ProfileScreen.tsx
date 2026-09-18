import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  Dumbbell,
  FileUp,
  GraduationCap,
  Loader2,
  MessageCircle,
  Pencil,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { apiGet, apiPatch, apiPost } from '@/src/lib/api';
import { Avatar } from '@/src/components/social/MediaPost';
import {
  fetchProfile,
  removeCoach,
  requestCoach,
  saveBio,
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
  onAcceptFriend?: () => Promise<void> | void;
  onRejectFriend?: () => Promise<void> | void;
  onOpenProfile?: (userId: string) => void;
  onOpenChat?: (userId: string) => void;
  onOpenFriends?: (filter?: 'all' | 'following' | 'followers') => void;
  /** Foto actual de la sesión: así Perfil y Progreso enseñan la misma. */
  liveAvatar?: string | null;
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
  onOpenRoutine,
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchProfile(userId);
        if (cancelled) return;
        setProfile(data);
        setBioDraft(data.bio);
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
          className="inline-flex min-h-12 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600 dark:text-slate-400"
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
              <Avatar
                name={profile.name}
                avatar={profile.isSelf && liveAvatar != null && liveAvatar !== '' ? liveAvatar : profile.avatar}
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
                Entra en el perfil de un amigo para pedirle que te entrene o para ofrecerte como coach.
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
                        setProfile(prev =>
                          prev
                            ? { ...prev, isFriend: true, friendshipStatus: 'accepted', friendshipDirection: null, canSendRequest: false }
                            : prev
                        );
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-black uppercase tracking-wider text-white"
                    >
                      <Check size={15} />
                      Amigos
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

              {profile.isFriend && (
                <>
                  <button
                    type="button"
                    onClick={() => void askCoachLink('ask')}
                    disabled={savingCoach || profile.coachRequestStatus === 'pending' || profile.coachRequestStatus === 'accepted'}
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
                  {profile.iAmTheirCoach ? (
                    <span className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Dumbbell size={15} />
                      Le entrenas
                    </span>
                  ) : !profile.coach ? (
                    <button
                      type="button"
                      onClick={() => void askCoachLink('invite')}
                      disabled={savingCoach || profile.athleteInviteStatus === 'pending' || profile.athleteInviteStatus === 'accepted'}
                      title="Le llegará una invitación y tendrá que aceptarte"
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-70',
                        profile.athleteInviteStatus === 'pending'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-2 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300'
                      )}
                    >
                      <Dumbbell size={15} />
                      {profile.athleteInviteStatus === 'pending' ? 'Pendiente' : 'Entrenarle'}
                    </button>
                  ) : null}
                </>
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

      {!profile.isFriend ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Hazte amigo de {profile.name.split(' ')[0]} para ver sus marcas.
        </p>
      ) : profile.trainingMaxes.length === 0 ? (
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
                ? 'En Rutina, comparte los RM que quieras que vean tus amigos.'
                : 'Todavía no comparte ningún RM.'}
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

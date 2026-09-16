import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  UserCheck, 
  UserX, 
  UserMinus,
  Trophy,
  MapPin,
  Clock, 
  Plus,
  ArrowRight,
  Calendar,
  Copy,
  Dumbbell,
  Loader2,
  X,
  Pencil,
  Trash2,
  AlertCircle,
  GraduationCap,
  Users,
  Bell,
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { FriendRequest, Friend, Challenge, GymCheckIn, User, UserSearchResult, ChallengeType, TrainingWeek, BodyWeightScoringMode, RoutineProgressLeaderboardEntry } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { apiGet, apiPut } from '@/src/lib/api';
import { VIEW_TRANSITION } from '@/src/lib/motionPresets';
import { EQUITY_OPTIONS, equitySummary, suggestBodyWeightScoring } from '@/src/lib/challengeEquity';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { useIncrementSignal } from '@/src/lib/useIncrementSignal';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import {
  answerChatRequest,
  answerCoachRequest,
  answerGroupInvite,
  fetchChatRequests,
  fetchCoachRequests,
  fetchGroupInvites,
  fetchProfile,
  coachRequestCopy,
  coachRequestPerson,
  type ChatAsk,
  type ChatGroupInvite,
  type CoachRequest,
} from '@/src/lib/feedApi';
import { TmHistoryModal } from '@/src/components/social/TmHistoryModal';
import { InstagramCover } from '@/src/components/social/ProgressMiniProfile';
import { FeedTab } from '@/src/components/social/FeedTab';
import { ChatTab } from '@/src/components/social/ChatTab';
import { HomeActivitySheet } from '@/src/components/social/HomeActivitySheet';
import { ProfileScreen } from '@/src/components/social/ProfileScreen';
import { Avatar as FeedAvatar } from '@/src/components/social/MediaPost';

export type SocialTab = 'feed' | 'friends' | 'challenges' | 'checkins' | 'chat';

const TAB_LABELS: Record<SocialTab, string> = {
  feed: 'Inicio',
  friends: 'Amigos',
  challenges: 'Torneos',
  checkins: 'Gym',
  chat: 'Chat',
};

interface SocialViewProps {
  user: User;
  friendsList: Friend[];
  requests: FriendRequest[];
  challenges: Challenge[];
  checkIns: GymCheckIn[];
  initialTab?: SocialTab;
  /** Se incrementa desde el dashboard para abrir el modal de check-in en Actividad. */
  openCheckInModalSignal?: number;
  openPublishSignal?: number;
  checkInIntent?: 'now' | 'later' | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendFriendRequest?: (userId: string) => Promise<void>;
  onCreateChallenge: (data: {
    title: string;
    description?: string;
    type: ChallengeType;
    exercise: string;
    endDate: string;
    usePointsSystem?: boolean;
    bodyWeightScoring?: BodyWeightScoringMode;
  }) => void;
  onJoinChallenge: (id: string, value: number) => void;
  onCheckIn: (gymName: string, time: string) => void;
  onCheckInUpdate?: (checkInId: string, gymName: string, time: string) => void;
  onCheckInDelete?: (checkInId: string) => void;
  onRefreshChallenges?: () => void;
  onCopyFriendRoutine?: (payload: {
    name: string;
    /** Nombre del amigo para el sufijo: "Rutina X (Nombre)" */
    friendName: string;
    weeks: TrainingWeek[];
    cycleLength?: number;
    sameTemplateAllWeeks?: boolean;
    weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
    skippedWeeks?: number[];
    friendTrainingMaxes?: { name: string; mode: string; linkedExercise?: string }[];
  }) => void | Promise<void>;
  /** La pestaña Perfil vive fuera de Social: el avatar de la cabecera lleva allí. */
  onGoToProfile?: () => void;
  onGoToDashboard?: () => void;
  socialBackTo?: 'feed' | 'profile' | 'dashboard';
  /** Cada toque de la nav fuerza la pestaña (Inicio siempre vuelve al feed). */
  socialNavTick?: number;
  /** Rutinas del usuario local (para detectar si ya copió la del amigo por nombre). */
  myRoutines?: { id: string; name: string }[];
  /** Ejercicios de la rutina activa: atajo para crear el torneo sobre algo que ya entrenas. */
  myExercises?: string[];
  activeRoutineId?: string;
  /** Activar la rutina ya copiada del amigo y abrir Programa (no volver a copiar). */
  onGoToCopiedRoutine?: (routineId: string) => void;
  onUnfriend?: (friendId: string) => Promise<void>;
  onChatConversationChange?: (open: boolean) => void;
}

const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  max_reps: 'Repeticiones',
  weight: 'Fuerza (puntos justos)',
  seconds: 'Segundos',
};

const CHALLENGE_TYPE_UNIT: Record<ChallengeType, string> = {
  max_reps: 'reps',
  weight: 'kg',
  seconds: 'seg',
};

const CHALLENGE_TYPE_OPTIONS: { value: ChallengeType; label: string }[] = [
  { value: 'max_reps', label: 'Repeticiones' },
  { value: 'weight', label: 'Fuerza (kg)' },
  { value: 'seconds', label: 'Segundos' },
];

function bodyWeightScoringSummary(
  type: ChallengeType,
  usePoints: boolean,
  mode: BodyWeightScoringMode | undefined
): string {
  if (!usePoints) return 'Clasificación por marca bruta';
  return equitySummary(type, mode ?? 'heavier_more');
}

function sameUserId(a?: string | null, b?: string | null) {
  return Boolean(a && b && String(a) === String(b));
}

function sortChallengeRanking<T extends { score: number; value: number }>(
  participants: T[],
  usePointsSystem: boolean | undefined
): T[] {
  const normalized = usePointsSystem !== false;
  return [...participants].sort((a, b) => {
    if (!normalized) return b.value - a.value;
    return b.score - a.score;
  });
}

export const SocialView: React.FC<SocialViewProps> = ({ 
  user,
  friendsList,
  requests, 
  challenges, 
  checkIns,
  initialTab = 'feed',
  onAccept, 
  onReject,
  onSendFriendRequest,
  onCreateChallenge,
  onJoinChallenge,
  onCheckIn,
  onCheckInUpdate,
  onCheckInDelete,
  onRefreshChallenges,
  onCopyFriendRoutine,
  myRoutines,
  myExercises,
  activeRoutineId,
  onGoToCopiedRoutine,
  onUnfriend,
  onGoToProfile,
  onGoToDashboard,
  socialBackTo = 'feed',
  socialNavTick = 0,
  onChatConversationChange,
  openCheckInModalSignal = 0,
  openPublishSignal = 0,
  checkInIntent = null,
}) => {
  const [search, setSearch] = useState('');
  const [challengeSearch, setChallengeSearch] = useState('');
  const [activeTab, setActiveTab] = useState<SocialTab>(initialTab);
  const prevInitialTabPropRef = useRef(initialTab);
  const [challengeSubTab, setChallengeSubTab] = useState<'active' | 'finished' | 'progress'>('active');
  const [routineLeaderboard, setRoutineLeaderboard] = useState<RoutineProgressLeaderboardEntry[] | null>(null);
  const [routineLeaderboardLoading, setRoutineLeaderboardLoading] = useState(false);
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [acceptRejectLoadingId, setAcceptRejectLoadingId] = useState<string | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState(false);
  const [showJoinChallengeModal, setShowJoinChallengeModal] = useState<Challenge | null>(null);
  const [selectedChallengeDetail, setSelectedChallengeDetail] = useState<Challenge | null>(null);
  const [showFriendModal, setShowFriendModal] = useState<Friend | null>(null);
  const [unfriendConfirmFriend, setUnfriendConfirmFriend] = useState<Friend | null>(null);
  const [friendRoutine, setFriendRoutine] = useState<{
    name: string;
    weeks: TrainingWeek[];
    cycleLength?: number;
    sameTemplateAllWeeks?: boolean;
    weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
    skippedWeeks?: number[];
  } | null>(null);
  const [friendRoutineLoading, setFriendRoutineLoading] = useState(false);
  const [openFriendTm, setOpenFriendTm] = useState<{ id?: string; name: string; value: number; mode: string } | null>(null);
  /** Perfil abierto a pantalla completa (amigo, resultado de búsqueda o entrenador). */
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<{
    name: string;
    avatar: string;
    bio?: string;
    username?: string | null;
    postCount?: number;
    followerCount?: number;
    followingCount?: number;
    coach?: { id: string; name: string; avatar: string | null } | null;
    athleteCount?: number;
    trainingMaxes: { id?: string; name: string; value: number; mode: string }[];
    trainingMaxesAll?: { name: string; mode: string; linkedExercise?: string }[];
  } | null>(null);
  const [copyingFriendRoutine, setCopyingFriendRoutine] = useState(false);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [gymName, setGymName] = useState('');
  const [gymTime, setGymTime] = useState('');
  const [editingCheckIn, setEditingCheckIn] = useState<GymCheckIn | null>(null);
  const [localCheckInIntent, setLocalCheckInIntent] = useState<'now' | 'later' | null>(null);

  // Búsqueda de usuarios para añadir (el API excluye amigos ya aceptados)
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  /** Evita que una respuesta lenta de una letra anterior pise la búsqueda actual. */
  const searchRequestIdRef = useRef(0);

  // Form crear torneo
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createType, setCreateType] = useState<ChallengeType>('max_reps');
  const [createExercise, setCreateExercise] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  /** true = IPF GL / puntos por peso y género; false = solo la mejor marca (kg, reps o s). */
  const [createUsePointsSystem, setCreateUsePointsSystem] = useState(true);
  const [createBodyWeightScoring, setCreateBodyWeightScoring] = useState<BodyWeightScoringMode>('heavier_more');
  const [createEquityOpen, setCreateEquityOpen] = useState(false);
  const [createEquityTouched, setCreateEquityTouched] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Form unirse a torneo
  const [joinValue, setJoinValue] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  const pendingRequests = requests.filter(r => r.status === 'pending');

  /** Quién te ha pedido ser su entrenador: se acepta o se rechaza desde Actividad. */
  const [coachRequests, setCoachRequests] = useState<CoachRequest[]>([]);
  const [coachRequestBusyId, setCoachRequestBusyId] = useState<string | null>(null);
  const [groupInvites, setGroupInvites] = useState<ChatGroupInvite[]>([]);
  const [groupInviteBusyId, setGroupInviteBusyId] = useState<string | null>(null);
  const [chatAsks, setChatAsks] = useState<ChatAsk[]>([]);
  const [chatAskBusyId, setChatAskBusyId] = useState<string | null>(null);
  const [chatPeerId, setChatPeerId] = useState<string | null>(null);
  const [showHomeActivity, setShowHomeActivity] = useState(false);
  const [friendsFromChat, setFriendsFromChat] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const activityBadge = pendingRequests.length + coachRequests.length + groupInvites.length + chatAsks.length;
  const homeActivityCount = activityBadge + unreadNotifCount;
  const markHomeNotifsRead = useCallback(() => setUnreadNotifCount(0), []);

  const loadCoachRequests = useCallback(() => {
    fetchCoachRequests()
      .then(r => setCoachRequests(r.requests))
      .catch(() => setCoachRequests([]));
  }, []);

  const loadGroupInvites = useCallback(() => {
    fetchGroupInvites()
      .then(r => setGroupInvites(r.invites))
      .catch(() => setGroupInvites([]));
  }, []);

  const loadChatAsks = useCallback(() => {
    fetchChatRequests()
      .then(r => setChatAsks(r.requests))
      .catch(() => setChatAsks([]));
  }, []);

  useEffect(() => {
    loadCoachRequests();
    loadGroupInvites();
    loadChatAsks();
    const loadUnread = () => {
      apiGet<{ count: number }>('/api/notifications/unread-count')
        .then(r => setUnreadNotifCount(typeof r.count === 'number' ? r.count : 0))
        .catch(() => setUnreadNotifCount(0));
    };
    loadUnread();
    const id = window.setInterval(loadUnread, 20000);
    return () => window.clearInterval(id);
  }, [loadCoachRequests, loadGroupInvites, loadChatAsks, user.id]);

  const answerCoach = useCallback(async (id: string, decision: 'accept' | 'reject') => {
    setCoachRequestBusyId(id);
    try {
      await answerCoachRequest(id, decision);
      setCoachRequests(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo responder a la solicitud.');
    } finally {
      setCoachRequestBusyId(null);
    }
  }, []);

  const answerGroup = useCallback(async (id: string, decision: 'accept' | 'reject') => {
    setGroupInviteBusyId(id);
    try {
      await answerGroupInvite(id, decision);
      setGroupInvites(prev => prev.filter(r => r.id !== id));
      if (decision === 'accept') setActiveTab('chat');
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo responder a la invitación.');
    } finally {
      setGroupInviteBusyId(null);
    }
  }, []);

  const answerChatAsk = useCallback(async (id: string, decision: 'accept' | 'reject') => {
    setChatAskBusyId(id);
    try {
      const res = await answerChatRequest(id, decision);
      setChatAsks(prev => prev.filter(r => r.id !== id));
      if (decision === 'accept' && res.peerId) {
        setChatPeerId(res.peerId);
        setActiveTab('chat');
      }
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo responder al chat.');
    } finally {
      setChatAskBusyId(null);
    }
  }, []);

  const loadRoutineLeaderboard = useCallback(() => {
    setRoutineLeaderboardLoading(true);
    apiGet<{ entries: RoutineProgressLeaderboardEntry[] }>('/api/social/friends/routine-progress')
      .then(r => setRoutineLeaderboard(Array.isArray(r.entries) ? r.entries : []))
      .catch(() => setRoutineLeaderboard([]))
      .finally(() => setRoutineLeaderboardLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'challenges' && challengeSubTab === 'progress') {
      loadRoutineLeaderboard();
    }
  }, [activeTab, challengeSubTab, loadRoutineLeaderboard, friendsList.length]);

  /** Nav de abajo: Inicio/Chat/Torneos siempre gana, aunque hayas abierto Amigos o Gym por dentro. */
  useEffect(() => {
    setActiveTab(initialTab);
    prevInitialTabPropRef.current = initialTab;
  }, [initialTab, socialNavTick]);

  /** Al cambiar de pestaña por la barra, se cierran hojas sueltas. El check-in pedido en el mismo tick se reabre después. */
  const lastNavTick = useRef(socialNavTick);
  useEffect(() => {
    if (lastNavTick.current === socialNavTick) return;
    lastNavTick.current = socialNavTick;
    setShowCreateChallengeModal(false);
    setShowJoinChallengeModal(null);
    setSelectedChallengeDetail(null);
    setShowFriendModal(null);
    setUnfriendConfirmFriend(null);
    setFriendRoutine(null);
    setFriendProfile(null);
    setShowHomeActivity(false);
    setFriendsFromChat(false);
    setViewingProfileId(null);
    setShowCheckInModal(false);
    setEditingCheckIn(null);
  }, [socialNavTick]);

  useEscapeClose(!!unfriendConfirmFriend, () => setUnfriendConfirmFriend(null));
  useEscapeClose(!!showFriendModal && !unfriendConfirmFriend, () => {
    setShowFriendModal(null);
    setFriendRoutine(null);
    setFriendProfile(null);
  });
  useEscapeClose(!!selectedChallengeDetail && !showJoinChallengeModal, () => setSelectedChallengeDetail(null));
  useEscapeClose(!!viewingProfileId && !showFriendModal, () => setViewingProfileId(null));
  useEscapeClose(showHomeActivity, () => setShowHomeActivity(false));

  useEffect(() => {
    if (createEquityTouched) return;
    setCreateBodyWeightScoring(suggestBodyWeightScoring(createType, createExercise));
  }, [createType, createExercise, createEquityTouched]);

  // Marcar notificaciones como leídas al ver la pestaña Actividad
  useEffect(() => {
    if (activeTab === 'checkins') {
      apiPut('/api/notifications/read-all', {}).catch(() => {});
    }
  }, [activeTab]);

  useIncrementSignal('checkin-modal', openCheckInModalSignal, () => {
    setActiveTab('checkins');
    setEditingCheckIn(null);
    setGymName('');
    setLocalCheckInIntent(checkInIntent ?? 'later');
    if (checkInIntent === 'now') {
      const d = new Date();
      setGymTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } else {
      setGymTime('');
    }
    setShowCheckInModal(true);
  });

  // Búsqueda desde la 1.ª letra (sin mínimo de 2); debounce corto para que responda al instante
  useEffect(() => {
    const q = search.trim();
    if (!q.length) {
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q });
        if (requestId !== searchRequestIdRef.current) return;
        setSearchResults(results);
      } catch {
        if (requestId !== searchRequestIdRef.current) return;
        setSearchResults([]);
      } finally {
        if (requestId === searchRequestIdRef.current) setSearchLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [search]);

  const friendIdSet = useMemo(() => new Set(friendsList.map(f => f.id)), [friendsList]);
  const searchResultsVisible = useMemo(
    () => searchResults.filter(r => r.id !== user.id && !friendIdSet.has(r.id)),
    [searchResults, friendIdSet, user.id]
  );

  const now = new Date();
  const activeChallenges = challenges.filter(c => (c.status || (new Date(c.endDate) > now)) && new Date(c.endDate) > now);
  /** Finalizados: solo torneos a los que te uniste o que tú creaste. */
  const finishedChallenges = challenges.filter(c => {
    const ended = (c.status === 'finished') || new Date(c.endDate) <= now;
    if (!ended) return false;
    const isParticipant = c.participants.some(p => sameUserId(p.userId, user.id));
    const isCreator = sameUserId(c.createdBy?.id, user.id);
    return isParticipant || isCreator;
  });
  const displayedChallenges =
    challengeSubTab === 'active' ? activeChallenges : challengeSubTab === 'finished' ? finishedChallenges : [];

  const challengeSearchLower = challengeSearch.toLowerCase();
  const filteredChallenges = challengeSearchLower
    ? displayedChallenges.filter(
        c =>
          c.title.toLowerCase().includes(challengeSearchLower) ||
          (c.exercise || '').toLowerCase().includes(challengeSearchLower) ||
          (c.description || '').toLowerCase().includes(challengeSearchLower)
      )
    : displayedChallenges;

  /** El input superior es búsqueda global (API); no filtrar aquí la lista de amigos o desaparece "Mis Amigos" al escribir. */
  const friendsToDisplay = friendsList;

  const openJoinModal = useCallback((challenge: Challenge) => {
    setShowJoinChallengeModal(challenge);
    setJoinValue('');
  }, []);

  const openFriendModal = useCallback(async (friend: Friend) => {
    setShowFriendModal(friend);
    setFriendRoutine(null);
    setFriendProfile(null);
    setOpenFriendTm(null);
    setFriendRoutineLoading(true);
    try {
      const [routineRaw, profile, cover] = await Promise.all([
        apiGet<{
          name: string;
          weeks: TrainingWeek[];
          baseTemplate?: TrainingWeek[];
          versions?: { effectiveFromWeek: number; weeks: TrainingWeek[] }[];
          logs?: unknown;
          sameTemplateAllWeeks?: boolean;
          weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
          cycleLength?: number;
          skippedWeeks?: number[];
        } | null>(`/api/social/friends/${friend.id}/routine`),
        apiGet<{
          name: string;
          avatar: string;
          bio?: string;
          coach?: { id: string; name: string; avatar: string | null } | null;
          athleteCount?: number;
          trainingMaxes: { id?: string; name: string; value: number; mode: string }[];
          trainingMaxesAll?: { name: string; mode: string; linkedExercise?: string }[];
        }>(`/api/social/friends/${friend.id}/profile?includeAllTms=1`).catch(() => ({
          name: friend.name,
          avatar: friend.avatar || '',
          bio: '',
          trainingMaxes: [] as { id?: string; name: string; value: number; mode: string }[],
        })),
        fetchProfile(friend.id).catch(() => null),
      ]);
      if (routineRaw) {
        const { expandRoutineFromApi } = await import('@/src/lib/planMaterialize');
        const expanded = expandRoutineFromApi({
          id: friend.id,
          name: routineRaw.name,
          weeks: routineRaw.weeks,
          versions: routineRaw.versions,
          baseTemplate: routineRaw.baseTemplate,
          logs: routineRaw.logs,
          sameTemplateAllWeeks: routineRaw.sameTemplateAllWeeks,
          cycleLength: routineRaw.cycleLength,
          skippedWeeks: routineRaw.skippedWeeks,
          weekTypeOverrides: routineRaw.weekTypeOverrides,
        });
        setFriendRoutine({
          name: expanded.name,
          weeks: expanded.weeks,
          cycleLength: expanded.cycleLength,
          sameTemplateAllWeeks: expanded.sameTemplateAllWeeks,
          weekTypeOverrides: expanded.weekTypeOverrides,
          skippedWeeks: expanded.skippedWeeks,
        });
      } else {
        setFriendRoutine(null);
      }
      setFriendProfile({
        ...profile,
        bio: cover?.bio ?? profile.bio ?? '',
        username: cover?.username,
        postCount: cover?.postCount ?? 0,
        followerCount: cover?.followerCount ?? 0,
        followingCount: cover?.followingCount ?? 0,
      });
    } catch {
      setFriendRoutine(null);
      setFriendProfile({ name: friend.name, avatar: friend.avatar || '', trainingMaxes: [] });
    } finally {
      setFriendRoutineLoading(false);
    }
  }, []);

  const closeFriendSheet = useCallback(() => {
    setShowFriendModal(null);
    setFriendRoutine(null);
    setFriendProfile(null);
    setOpenFriendTm(null);
  }, []);

  const handleCopyAndActivate = useCallback(async () => {
    if (!friendRoutine || !onCopyFriendRoutine) return;
    setCopyingFriendRoutine(true);
    try {
      await onCopyFriendRoutine({
        name: friendRoutine.name,
        friendName: (friendProfile?.name || showFriendModal?.name || 'Amigo').trim(),
        weeks: friendRoutine.weeks,
        cycleLength: friendRoutine.cycleLength,
        sameTemplateAllWeeks: friendRoutine.sameTemplateAllWeeks,
        weekTypeOverrides: friendRoutine.weekTypeOverrides,
        skippedWeeks: [],
        friendTrainingMaxes: friendProfile?.trainingMaxesAll?.length
          ? friendProfile.trainingMaxesAll
          : undefined,
      });
      setShowFriendModal(null);
      setFriendRoutine(null);
    } finally {
      setCopyingFriendRoutine(false);
    }
  }, [friendRoutine, onCopyFriendRoutine, friendProfile?.trainingMaxesAll, friendProfile?.name, showFriendModal?.name]);

  /** Misma regla que al copiar: `${nombreRutina} (${nombreAmigo})`. */
  const copiedRoutineFromFriend = useMemo(() => {
    if (!friendRoutine || !myRoutines?.length) return null;
    const friendSuffix = (friendProfile?.name || showFriendModal?.name || 'Amigo').trim() || 'Amigo';
    const expectedName = `${friendRoutine.name} (${friendSuffix})`;
    return myRoutines.find((r) => r.name === expectedName) ?? null;
  }, [friendRoutine, friendProfile?.name, showFriendModal?.name, myRoutines]);

  const handleRequestAction = useCallback(async (id: string, action: (id: string) => void | Promise<void>) => {
    setAcceptRejectLoadingId(id);
    setFriendActionError(null);
    try {
      await action(id);
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo completar la acción. Inténtalo de nuevo.');
    } finally {
      setAcceptRejectLoadingId(null);
    }
  }, []);

  const handleCreateSubmit = async () => {
    if (!createTitle.trim() || !createExercise.trim() || !createEndDate) return;
    setCreateSubmitting(true);
    try {
      await onCreateChallenge({
        title: createTitle.trim(),
        description: createDesc.trim() || undefined,
        type: createType,
        exercise: createExercise.trim(),
        endDate: createEndDate,
        usePointsSystem: createUsePointsSystem,
        bodyWeightScoring: createBodyWeightScoring,
      });
      setShowCreateChallengeModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreateExercise('');
      setCreateEndDate('');
      setCreateUsePointsSystem(true);
      setCreateBodyWeightScoring(suggestBodyWeightScoring(createType, createExercise));
      setCreateEquityOpen(false);
      setCreateEquityTouched(false);
      onRefreshChallenges?.();
      if (challengeSubTab === 'progress') loadRoutineLeaderboard();
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleJoinSubmit = async () => {
    const val = parseFloat(joinValue);
    if (isNaN(val) || !showJoinChallengeModal) return;
    setJoinSubmitting(true);
    try {
      await onJoinChallenge(showJoinChallengeModal.id, val);
      setShowJoinChallengeModal(null);
      setJoinValue('');
      onRefreshChallenges?.();
      if (challengeSubTab === 'progress') loadRoutineLeaderboard();
    } finally {
      setJoinSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={VIEW_TRANSITION}
      className="mx-auto max-w-5xl px-4 pb-28 pt-5 text-slate-900 sm:px-6 sm:pb-32 sm:pt-7 dark:text-slate-100"
    >
      <header className={cn('space-y-4', activeTab === 'chat' ? 'mb-0' : 'mb-5')}>
        {activeTab !== 'chat' && (
        <div className="flex items-center gap-3">
          {activeTab !== 'feed' ? (
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'friends' && friendsFromChat) {
                  setFriendsFromChat(false);
                  setActiveTab('chat');
                  return;
                }
                if (socialBackTo === 'profile') {
                  onGoToProfile?.();
                  return;
                }
                if (socialBackTo === 'feed') {
                  setActiveTab('feed');
                  return;
                }
                onGoToDashboard?.();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500"
              aria-label={
                activeTab === 'friends' && friendsFromChat
                  ? 'Volver al chat'
                  : socialBackTo === 'profile'
                    ? 'Volver al perfil'
                    : socialBackTo === 'feed'
                      ? 'Volver al inicio'
                      : 'Volver al perfil'
              }
            >
              <ArrowRight className="rotate-180" size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onGoToProfile}
              className="shrink-0 rounded-full"
              title="Mi perfil"
              aria-label="Mi perfil"
            >
              <Avatar
                src={user.avatar}
                name={user.name}
                className="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700"
              />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {activeTab === 'feed' ? 'Inicio' : TAB_LABELS[activeTab]}
            </h1>
          </div>
          {activeTab === 'feed' && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-800"
                aria-label="Amigos"
                title="Amigos"
              >
                <Users size={22} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('checkins')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-800"
                aria-label="Gym"
                title="Gym"
              >
                <MapPin size={22} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setShowHomeActivity(true)}
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-800"
                aria-label="Avisos"
                title="Avisos"
              >
                <Bell size={22} strokeWidth={2} />
                {homeActivityCount > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                    {homeActivityCount > 9 ? '9+' : homeActivityCount}
                  </span>
                )}
              </button>
            </div>
          )}
          {activeTab === 'challenges' && (
            <button
              type="button"
              onClick={() => setShowCreateChallengeModal(true)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 text-sm font-semibold text-white"
            >
              <Plus size={15} />
              Crear
            </button>
          )}
        </div>
        )}

        {activeTab === 'friends' && (
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="tracker-friend-search"
            name="tracker-friend-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar atletas, amigos, entrenadores…"
            className="h-11 w-full rounded-2xl border border-slate-200/80 bg-slate-100/70 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {search.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {searchLoading && searchResultsVisible.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-400">Buscando…</p>
              ) : searchResultsVisible.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-400">Nadie con ese nombre. Tus amigos no salen aquí.</p>
              ) : (
                searchResultsVisible.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      void openFriendModal({ id: u.id, name: u.name, avatar: u.avatar });
                      setSearch('');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FeedAvatar name={u.name} avatar={u.avatar ?? null} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{u.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {u.friendshipStatus === 'pending' ? 'Solicitud enviada' : 'Ver perfil'}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </div>
        )}
      </header>

      <div>
        <div className={activeTab === 'feed' ? undefined : 'hidden'} aria-hidden={activeTab !== 'feed'}>
            <FeedTab
              myName={user.name}
              myAvatar={user.avatar ?? null}
              openPublishSignal={openPublishSignal}
              onOpenAuthor={authorId => void openFriendModal({ id: authorId, name: 'Atleta' })}
              onOpenChat={peerId => {
                setChatPeerId(peerId);
                setActiveTab('chat');
              }}
            />
        </div>

        <div className={activeTab === 'chat' ? undefined : 'hidden'} aria-hidden={activeTab !== 'chat'}>
            <ChatTab
              myId={user.id}
              friends={friendsList}
              startWith={chatPeerId}
              pending={pendingRequests}
              onOpened={() => setChatPeerId(null)}
              onOpenMini={person => openFriendModal({ id: person.id, name: person.name, avatar: person.avatar ?? undefined })}
              onAcceptRequest={id => void handleRequestAction(id, onAccept)}
              onRejectRequest={id => void handleRequestAction(id, onReject)}
              onSendRequest={onSendFriendRequest}
              requestBusyId={acceptRejectLoadingId}
              onConversationChange={onChatConversationChange}
            />
        </div>

        <div className={cn('space-y-8', activeTab !== 'friends' && 'hidden')} aria-hidden={activeTab !== 'friends'}>
            {friendActionError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/40"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
                <p className="flex-1 text-sm font-medium text-rose-700 dark:text-rose-300">{friendActionError}</p>
                <button
                  type="button"
                  onClick={() => setFriendActionError(null)}
                  className="text-rose-400 hover:text-rose-600"
                  aria-label="Cerrar aviso"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {(pendingRequests.length > 0 || groupInvites.length > 0 || chatAsks.length > 0) && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight dark:text-slate-100">Solicitudes pendientes</h2>
                  <span className="bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 px-2 py-0.5 rounded-full text-xs font-bold">
                    {pendingRequests.length + groupInvites.length + chatAsks.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingRequests.map(req => (
                    <Card key={req.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar src={req.avatar} name={req.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-slate-100">{req.name}</h3>
                          <p className="text-xs text-slate-500">Quiere ser tu amigo</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={acceptRejectLoadingId === req.id}
                          onClick={() => handleRequestAction(req.id, onReject)}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          {acceptRejectLoadingId === req.id ? <Loader2 size={18} className="animate-spin" /> : <UserX size={18} />}
                        </Button>
                        <Button 
                          variant="primary" 
                          size="sm" 
                          disabled={acceptRejectLoadingId === req.id}
                          onClick={() => handleRequestAction(req.id, onAccept)}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          {acceptRejectLoadingId === req.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {chatAsks.map(ask => (
                    <Card key={ask.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <Avatar src={ask.from.avatar || undefined} name={ask.from.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{ask.from.name}</h3>
                          <p className="text-xs text-slate-500 truncate">{ask.preview || 'Quiere chatear contigo'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={chatAskBusyId === ask.id}
                          onClick={() => void answerChatAsk(ask.id, 'reject')}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <UserX size={18} />}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={chatAskBusyId === ask.id}
                          onClick={() => void answerChatAsk(ask.id, 'accept')}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {groupInvites.map(inv => (
                    <Card key={inv.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <Avatar src={inv.from.avatar || undefined} name={inv.from.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{inv.from.name}</h3>
                          <p className="text-xs text-slate-500">Te invita a «{inv.groupName}»</p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={groupInviteBusyId === inv.id}
                          onClick={() => void answerGroup(inv.id, 'reject')}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <UserX size={18} />}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={groupInviteBusyId === inv.id}
                          onClick={() => void answerGroup(inv.id, 'accept')}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight dark:text-slate-100">Mis amigos</h2>
                <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                  {friendsToDisplay.length}
                </span>
              </div>
              {friendsToDisplay.length === 0 ? (
                <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                  <p className="text-slate-400 font-medium">Aún no tienes amigos. Busca atletas arriba.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {friendsToDisplay.map(f => (
                    <Card 
                      key={f.id} 
                      padding="md" 
                      rounded="xl" 
                      className="flex items-center gap-4 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                      onClick={() => void openFriendModal(f)}
                    >
                      <Avatar src={f.avatar} name={f.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100">{f.name}</h3>
                        
                      </div>
                      <ArrowRight size={18} className="text-slate-400 flex-shrink-0" />
                    </Card>
                  ))}
                </div>
              )}
            </section>
        </div>

        <div className={cn('space-y-6', activeTab !== 'challenges' && 'hidden')} aria-hidden={activeTab !== 'challenges'}>
            <div className="flex rounded-2xl bg-white p-1.5 dark:bg-slate-900">
                {([
                  { id: 'active' as const, label: 'Activos' },
                  { id: 'finished' as const, label: 'Finalizados' },
                  { id: 'progress' as const, label: 'Progreso' },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setChallengeSubTab(tab.id)}
                    className={cn(
                      'flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors sm:py-3',
                      challengeSubTab === tab.id
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>

            {challengeSubTab !== 'progress' && (
            <Input 
              placeholder="Buscar por título o ejercicio"
              value={challengeSearch}
              onChange={(e) => setChallengeSearch(e.target.value)}
              icon={<Search size={16} />}
              className="h-11 rounded-2xl border-slate-200/80 bg-white py-0 shadow-none dark:border-white/10 dark:bg-slate-900"
            />
            )}

            {challengeSubTab === 'progress' && (
              <>
                <Card padding="sm" rounded="md" variant="white">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mejora de rutina</p>
                  <p className="mt-1 text-xs text-slate-500">
                    El % es el cambio de tus marcas entre el primer y el último registro, igual que en Progreso.
                  </p>
                </Card>

                {routineLeaderboardLoading ? (
                  <Card padding="md" rounded="md" variant="white" className="text-center text-slate-500">Cargando ranking…</Card>
                ) : routineLeaderboard && routineLeaderboard.length > 0 ? (
                  <div className="space-y-3">
                    {routineLeaderboard.map((row, idx) => {
                      const pct = row.improvementPct;
                      const rank = idx + 1;
                      return (
                        <Card
                          key={row.userId}
                          padding="sm"
                          rounded="md"
                          variant="white"
                          className={cn(row.isSelf && 'ring-1 ring-indigo-400/70')}
                        >
                          <div className="flex items-center gap-3 sm:gap-4">
                            <span className={cn(
                              'text-lg font-black w-8 flex justify-center shrink-0',
                              rank === 1 ? 'text-amber-600 dark:text-amber-400' :
                              rank === 2 ? 'text-slate-500 dark:text-slate-400' :
                              rank === 3 ? 'text-amber-700 dark:text-amber-600' :
                              'text-slate-400'
                            )}>{rank}</span>
                            <Avatar src={row.avatar} name={row.name} className="w-10 h-10 rounded-full border-2 border-slate-100 dark:border-slate-700 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                {row.name}
                                {row.isSelf && <span className="text-indigo-600 dark:text-indigo-400 text-xs font-black ml-2">(Tú)</span>}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {row.routineName || 'Sin rutina activa'}
                                {row.snapshotCount > 0 && ` · ${row.snapshotCount} ${row.snapshotCount === 1 ? 'registro' : 'registros'}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {pct == null ? (
                                <span className="text-sm font-bold text-slate-400">—</span>
                              ) : (
                                <span className={cn(
                                  'text-lg font-black',
                                  pct > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                                  pct < 0 ? 'text-rose-600 dark:text-rose-400' :
                                  'text-slate-500'
                                )}>
                                  {pct > 0 ? '+' : ''}{pct}%
                                </span>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card padding="md" rounded="md" variant="white" className="border-dashed text-center">
                    <p className="text-sm text-slate-500">
                      {friendsList.length === 0
                        ? 'Añade amigos para comparar el progreso de rutina.'
                        : 'Aún no hay historial. Guarda tus RM en Progreso.'}
                    </p>
                  </Card>
                )}
              </>
            )}

            {challengeSubTab !== 'progress' && (
            <div className="space-y-3.5">
              {filteredChallenges.map(challenge => {
                const isFinished = challengeSubTab === 'finished' || new Date(challenge.endDate) <= now;
                const isParticipant = challenge.participants.some(p => sameUserId(p.userId, user.id));
                const ranking = sortChallengeRanking(challenge.participants, challenge.usePointsSystem);
                const myIdx = ranking.findIndex(p => sameUserId(p.userId, user.id));
                const me = challenge.participants.find(p => sameUserId(p.userId, user.id));
                const days = Math.max(0, Math.ceil((new Date(challenge.endDate).getTime() - Date.now()) / 86400000));
                const typeLabel = challenge.type === 'weight' ? 'Fuerza' : CHALLENGE_TYPE_LABELS[challenge.type as ChallengeType];
                const unit = CHALLENGE_TYPE_UNIT[challenge.type as ChallengeType] || '';

                return (
                  <Card
                    key={challenge.id}
                    padding="md"
                    rounded="md"
                    variant="white"
                    className="cursor-pointer"
                    onClick={() => setSelectedChallengeDetail(challenge)}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                        <Trophy size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                          {challenge.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          {challenge.exercise}
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                          {typeLabel}
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                          {isFinished ? 'Finalizado' : days === 0 ? 'Termina hoy' : `${days} días`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {ranking.length > 0 ? (
                          <>
                            <div className="flex -space-x-2">
                              {ranking.slice(0, 4).map(p => (
                                <Avatar key={p.userId} src={p.avatar} name={p.name} className="h-7 w-7 rounded-full border-2 border-white dark:border-slate-900" />
                              ))}
                            </div>
                            <span className="truncate text-[12px] text-slate-400">
                              {myIdx >= 0 ? `#${myIdx + 1} · ` : ''}
                              {ranking.length} {ranking.length === 1 ? 'persona' : 'personas'}
                            </span>
                          </>
                        ) : (
                          <span className="text-[12px] text-slate-400">Aún nadie se ha unido</span>
                        )}
                        {isParticipant && me && (
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                            {challenge.usePointsSystem ? `${Math.round(me.score)} pts` : `${me.value} ${unit}`}
                          </span>
                        )}
                      </div>
                      {!isFinished ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openJoinModal(challenge); }}
                          className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
                        >
                          {isParticipant ? 'Actualizar' : 'Unirse'}
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-400">Fin</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
            )}

            {challengeSubTab !== 'progress' && filteredChallenges.length === 0 && (
              <Card padding="lg" rounded="md" variant="white" className="border-dashed text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <Trophy size={20} />
                </div>
                <p className="text-sm text-slate-500">
                  {challengeSubTab === 'active'
                    ? 'No hay torneos activos. Crea uno o espera a que un amigo lo haga.'
                    : 'No hay torneos finalizados.'}
                </p>
                {challengeSubTab === 'active' && (
                  <button
                    type="button"
                    onClick={() => setShowCreateChallengeModal(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white"
                  >
                    <Plus size={14} />
                    Crear torneo
                  </button>
                )}
              </Card>
            )}
        </div>

        <div className={cn('space-y-4', activeTab !== 'checkins' && 'hidden')} aria-hidden={activeTab !== 'checkins'}>
            {chatAsks.length > 0 && (
              <section className="space-y-3 pb-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Quieren chatear
                </h2>
                {chatAsks.map(ask => (
                  <Card
                    key={ask.id}
                    padding="md"
                    rounded="2xl"
                    className="flex items-center justify-between gap-3 border-l-4 border-l-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20"
                  >
                    <button
                      type="button"
                      onClick={() => void openFriendModal({ id: ask.from.id, name: ask.from.name, avatar: ask.from.avatar ?? undefined })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FeedAvatar name={ask.from.name} avatar={ask.from.avatar} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {ask.from.name}
                        </span>
                        <span className="block truncate text-[11px] font-medium text-slate-500">
                          {ask.preview || 'Quiere hablar contigo'}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={chatAskBusyId === ask.id}
                        onClick={() => void answerChatAsk(ask.id, 'reject')}
                        className="h-10 w-10 rounded-full border-rose-100 p-0 text-rose-500 hover:bg-rose-50"
                        aria-label="Rechazar"
                      >
                        {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={chatAskBusyId === ask.id}
                        onClick={() => void answerChatAsk(ask.id, 'accept')}
                        className="h-10 w-10 rounded-full bg-emerald-500 p-0 shadow-emerald-100 hover:bg-emerald-600"
                        aria-label="Aceptar"
                      >
                        {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {groupInvites.length > 0 && (
              <section className="space-y-3 pb-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Te invitan a un grupo o equipo
                </h2>
                {groupInvites.map(inv => (
                  <Card
                    key={inv.id}
                    padding="md"
                    rounded="2xl"
                    className="flex items-center justify-between gap-3 border-l-4 border-l-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20"
                  >
                    <button
                      type="button"
                      onClick={() => void openFriendModal({ id: inv.from.id, name: inv.from.name, avatar: inv.from.avatar ?? undefined })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FeedAvatar name={inv.from.name} avatar={inv.from.avatar} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {inv.from.name}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                          <Users size={12} />
                          {inv.kind === 'team' ? 'equipo' : 'grupo'} «{inv.groupName}»
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={groupInviteBusyId === inv.id}
                        onClick={() => void answerGroup(inv.id, 'reject')}
                        className="h-10 w-10 rounded-full border-rose-100 p-0 text-rose-500 hover:bg-rose-50"
                        aria-label="Rechazar"
                      >
                        {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={groupInviteBusyId === inv.id}
                        onClick={() => void answerGroup(inv.id, 'accept')}
                        className="h-10 w-10 rounded-full bg-emerald-500 p-0 shadow-emerald-100 hover:bg-emerald-600"
                        aria-label="Aceptar"
                      >
                        {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {coachRequests.length > 0 && (
              <section className="space-y-3 pb-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  Entrenador
                </h2>
                {coachRequests.map(req => {
                  const person = coachRequestPerson(req);
                  return (
                  <Card
                    key={req.id}
                    padding="md"
                    rounded="2xl"
                    className="flex items-center justify-between gap-3 border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20"
                  >
                    <button
                      type="button"
                      onClick={() => void openFriendModal({ id: person.id, name: person.name, avatar: person.avatar ?? undefined })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FeedAvatar name={person.name} avatar={person.avatar} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {person.name}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                          <GraduationCap size={12} />
                          {coachRequestCopy(req).toLowerCase()}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={coachRequestBusyId === req.id}
                        onClick={() => answerCoach(req.id, 'reject')}
                        className="h-10 w-10 rounded-full border-rose-100 p-0 text-rose-500 hover:bg-rose-50"
                        aria-label="Rechazar"
                      >
                        {coachRequestBusyId === req.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={coachRequestBusyId === req.id}
                        onClick={() => answerCoach(req.id, 'accept')}
                        className="h-10 w-10 rounded-full bg-emerald-500 p-0 shadow-emerald-100 hover:bg-emerald-600"
                        aria-label="Aceptar"
                      >
                        {coachRequestBusyId === req.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                      </Button>
                    </div>
                  </Card>
                  );
                })}
              </section>
            )}

            <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">Quién va al gym</h2>
            
            {(() => {
              const todayStr = new Date().toDateString();
              const myCheckInToday = checkIns.find(ci => ci.userId === user.id && new Date(ci.timestamp).toDateString() === todayStr);
              const othersCheckIns = checkIns.filter(ci => ci.id !== myCheckInToday?.id).sort((a, b) => b.timestamp - a.timestamp);
              return (
                <div className="space-y-4">
                  {myCheckInToday && onCheckInUpdate && onCheckInDelete && (
                    <Card padding="md" rounded="2xl" className="flex items-center justify-between border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <Avatar src={user.avatar || myCheckInToday.avatar} name={user.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-slate-100 dark:border-slate-700 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            <span className="text-emerald-600 dark:text-emerald-400">Mi hora</span>
                          </p>
                          <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{myCheckInToday.gymName}</span>
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{myCheckInToday.time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => { setEditingCheckIn(myCheckInToday); setGymName(myCheckInToday.gymName); setGymTime(myCheckInToday.time); }}
                          className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                          title="Editar"
                          aria-label="Editar hora"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => onCheckInDelete(myCheckInToday.id)}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                          title="Quitar"
                          aria-label="Quitar check-in"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </Card>
                  )}
                  {othersCheckIns.length === 0 && !myCheckInToday ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200/90 bg-slate-50/60 py-8 text-center dark:border-slate-600/70 dark:bg-slate-800/25">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100/90 dark:bg-indigo-950/55">
                        <Plus className="text-indigo-600 dark:text-indigo-400" size={20} strokeWidth={2.25} />
                      </div>
                      <p className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Nadie ha avisado que va al gym hoy
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCheckIn(null);
                          setGymName('');
                          setGymTime('');
                          setLocalCheckInIntent('later');
                          setShowCheckInModal(true);
                        }}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/90 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.98] dark:border-indigo-500/35 dark:bg-indigo-950/35 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-900/40"
                      >
                        <Plus
                          size={14}
                          strokeWidth={2.5}
                          className="text-indigo-500 transition-transform group-hover:scale-110 dark:text-indigo-300"
                        />
                        <span>Avisar mi hora</span>
                      </button>
                    </div>
                  ) : (
                    othersCheckIns.map(checkIn => {
                      const alreadyJoined = myCheckInToday && myCheckInToday.gymName === checkIn.gymName && myCheckInToday.time === checkIn.time;
                      return (
                        <Card key={checkIn.id} padding="md" rounded="2xl" className="flex items-center justify-between border-l-4 border-l-indigo-600">
                          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                            <Avatar src={checkIn.avatar} name={checkIn.userName} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-slate-100 dark:border-slate-700 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                                <span className="text-indigo-600 dark:text-indigo-400">{checkIn.userName}</span> va a entrenar
                              </p>
                              <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                                <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <MapPin size={10} className="flex-shrink-0" />
                                  <span className="truncate">{checkIn.gymName}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <Clock size={10} className="flex-shrink-0" />
                                  <span>{checkIn.time}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {alreadyJoined ? (
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex-shrink-0">Tú</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-indigo-200 text-indigo-600 flex-shrink-0"
                              disabled={checkInSaving}
                              onClick={async () => { setCheckInSaving(true); try { await onCheckIn(checkIn.gymName, checkIn.time); } finally { setCheckInSaving(false); } }}
                            >
                              {checkInSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <MapPin size={14} className="mr-1" />}
                              Me uno
                            </Button>
                          )}
                        </Card>
                      );
                    })
                  )}
                </div>
              );
            })()}
        </div>
      </div>

      <GlassModal
        open={showCheckInModal || !!editingCheckIn}
        onClose={() => { setShowCheckInModal(false); setEditingCheckIn(null); setGymName(''); setGymTime(''); }}
        title={editingCheckIn ? 'Cambiar aviso' : (localCheckInIntent ?? checkInIntent) === 'now' ? 'Estoy en el gym' : 'Avisar a tus amigos'}
        subtitle={(localCheckInIntent ?? checkInIntent) === 'now' ? 'Tus amigos verán que estás entrenando ahora.' : 'Diles el gym y a qué hora llegas.'}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setShowCheckInModal(false); setEditingCheckIn(null); setGymName(''); setGymTime(''); }}>Cancelar</Button>
            {editingCheckIn && onCheckInDelete && (
              <Button
                variant="outline"
                className="flex-1 border-rose-200 text-rose-600"
                onClick={() => {
                  onCheckInDelete(editingCheckIn.id);
                  setShowCheckInModal(false);
                  setEditingCheckIn(null);
                  setGymName('');
                  setGymTime('');
                }}
              >
                Quitar
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1"
              disabled={!gymName.trim() || !gymTime || checkInSaving}
              onClick={async () => {
                setCheckInSaving(true);
                try {
                  if (editingCheckIn && onCheckInUpdate) {
                    await onCheckInUpdate(editingCheckIn.id, gymName.trim(), gymTime);
                    setEditingCheckIn(null);
                  } else {
                    await onCheckIn(gymName.trim(), gymTime);
                    setShowCheckInModal(false);
                  }
                  setGymName('');
                  setGymTime('');
                } finally {
                  setCheckInSaving(false);
                }
              }}
            >
              {checkInSaving ? <><Loader2 size={14} className="mr-1 animate-spin" /> Guardando…</> : 'Confirmar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Gimnasio</label>
            <Input placeholder="Basic Fit, McFit…" value={gymName} onChange={(e) => setGymName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Hora</label>
            <Input type="time" value={gymTime} onChange={(e) => setGymTime(e.target.value)} />
          </div>
        </div>
      </GlassModal>

      <GlassModal
        open={showCreateChallengeModal}
        onClose={() => setShowCreateChallengeModal(false)}
        title="Crear torneo"
        subtitle="Solo se unen tus amigos"
      >
        <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Título</label>
                  <Input 
                    placeholder="Dominadas de marzo" 
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Descripción</label>
                  <Input 
                    placeholder="Opcional" 
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-slate-400">Tipo</p>
                  <div className="grid grid-cols-3 gap-1">
                    {CHALLENGE_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCreateType(opt.value)}
                        className={cn(
                          'rounded-xl px-2 py-2 text-[11px] font-medium',
                          createType === opt.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white/50 text-slate-600 dark:bg-white/5 dark:text-slate-300'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-white/50 px-3 py-2.5 dark:bg-white/5">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                    {createUsePointsSystem
                      ? equitySummary(createType, createBodyWeightScoring)
                      : 'Gana quien tenga la mejor marca, sin igualar por peso.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateEquityOpen(v => !v)}
                    className="mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300"
                  >
                    {createEquityOpen ? 'Ocultar ajuste' : '¿Así está bien la equidad?'}
                  </button>
                  {createEquityOpen && (
                    <div className="mt-2 space-y-1">
                      {createType !== 'weight' && EQUITY_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setCreateUsePointsSystem(true);
                            setCreateEquityTouched(true);
                            setCreateBodyWeightScoring(opt.value);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left',
                            createUsePointsSystem && createBodyWeightScoring === opt.value
                              ? 'bg-indigo-50 dark:bg-indigo-950/40'
                              : 'hover:bg-white/40 dark:hover:bg-white/5'
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">{opt.short}</span>
                            <span className="text-[11px] text-slate-400">{opt.hint}</span>
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setCreateEquityTouched(true);
                          setCreateUsePointsSystem(v => !v);
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left text-[12px] text-slate-500"
                      >
                        {createUsePointsSystem ? 'Clasificar solo por marca bruta' : 'Volver a puntos justos'}
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Ejercicio</label>
                  <Input 
                    placeholder="Dominadas, plancha…" 
                    value={createExercise}
                    onChange={(e) => setCreateExercise(e.target.value)}
                    className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                  />
                  {myExercises && myExercises.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {myExercises.slice(0, 10).map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setCreateExercise(name);
                            if (!createTitle.trim()) setCreateTitle(`Reto de ${name}`);
                          }}
                          className={cn(
                            'rounded-lg px-2 py-1 text-[11px] font-medium',
                            createExercise === name
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5'
                          )}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Fecha de fin</label>
                  <Input 
                    type="date" 
                    value={createEndDate}
                    onChange={(e) => setCreateEndDate(e.target.value)}
                    className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Día / mes / año</p>
                </div>
                <button
                  type="button"
                  disabled={!createTitle.trim() || !createExercise.trim() || !createEndDate || createSubmitting}
                  onClick={handleCreateSubmit}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                >
                  <Plus size={15} />
                  {createSubmitting ? 'Creando…' : 'Crear torneo'}
                </button>
        </div>
      </GlassModal>

      {/* Challenge Detail Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedChallengeDetail && (
          <motion.div
            key="challenge-detail-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] flex items-end justify-center p-0 min-h-[100dvh] sm:items-center sm:p-4"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedChallengeDetail(null)}
              className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
            />
            <motion.div 
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm max-h-[78vh] overflow-y-auto rounded-t-[28px] border border-white/50 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/65"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedChallengeDetail.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {selectedChallengeDetail.exercise}
                    <span className="mx-1">·</span>
                    {CHALLENGE_TYPE_LABELS[selectedChallengeDetail.type as ChallengeType]}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedChallengeDetail(null)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-3 py-2">
                <p className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Calendar size={12} />
                  Hasta {new Date(selectedChallengeDetail.endDate).toLocaleDateString('es-ES')}
                </p>
                <p className="mb-3 rounded-xl border border-white/50 bg-white/40 px-3 py-2 text-[11px] leading-snug text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
                  {selectedChallengeDetail.usePointsSystem !== false ? (
                    <>
                      {selectedChallengeDetail.type === 'weight' && 'Puntos IPF GL: misma vara para hombres y mujeres según peso corporal.'}
                      {selectedChallengeDetail.type === 'max_reps' &&
                        'Las reps se igualan por género y, si lo eliges, por peso corporal.'}
                      {selectedChallengeDetail.type === 'seconds' &&
                        'El tiempo se iguala casi a la par; el peso corporal solo si lo eliges.'}
                    </>
                  ) : (
                    'Clasificación solo por la mejor marca, sin puntos.'
                  )}
                </p>

                <p className="mb-2 text-[11px] font-medium text-slate-500">Clasificación</p>
                <div className="space-y-1.5">
                  {sortChallengeRanking(selectedChallengeDetail.participants, selectedChallengeDetail.usePointsSystem).map((p, idx) => {
                    const rank = idx + 1;
                    const unit = CHALLENGE_TYPE_UNIT[selectedChallengeDetail.type as ChallengeType] || '';
                    return (
                      <div 
                        key={p.userId} 
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-2.5 py-2',
                          rank === 1
                            ? 'border-amber-200/80 bg-amber-50/70 dark:border-amber-700/40 dark:bg-amber-900/25'
                            : rank === 2
                              ? 'border-white/50 bg-white/50 dark:border-white/10 dark:bg-slate-800/50'
                              : rank === 3
                                ? 'border-amber-100/80 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/20'
                                : 'border-white/40 bg-white/30 dark:border-white/10 dark:bg-slate-800/30',
                          sameUserId(p.userId, user.id) && 'ring-1 ring-indigo-400/70'
                        )}
                      >
                        <span className={cn(
                          'w-6 text-center text-sm font-semibold',
                          rank === 1 ? 'text-amber-600 dark:text-amber-400' :
                          rank === 2 ? 'text-slate-500' :
                          rank === 3 ? 'text-amber-700 dark:text-amber-500' :
                          'text-slate-400'
                        )}>{rank}</span>
                        <Avatar src={p.avatar} name={p.name} className="h-8 w-8 shrink-0 rounded-full border border-white/70 dark:border-slate-700" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {selectedChallengeDetail.usePointsSystem !== false
                              ? `${p.score} pts · ${p.value} ${unit}`
                              : `${p.value} ${unit}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {selectedChallengeDetail.participants.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/50 px-3 py-4 text-center text-xs text-slate-400 dark:border-white/10">
                      Nadie se ha unido todavía.
                    </p>
                  )}
                </div>
              {new Date(selectedChallengeDetail.endDate) > now && (
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                  onClick={(e) => { e.stopPropagation(); setSelectedChallengeDetail(null); openJoinModal(selectedChallengeDetail); }}
                >
                  {selectedChallengeDetail.participants.some(p => sameUserId(p.userId, user.id)) ? 'Actualizar marca' : 'Unirse'}
                </button>
              )}
              </div>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <GlassModal
        open={!!showJoinChallengeModal}
        onClose={() => setShowJoinChallengeModal(null)}
        title={showJoinChallengeModal?.title}
        subtitle={
          showJoinChallengeModal
            ? `${showJoinChallengeModal.exercise} · ${CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}`
            : undefined
        }
      >
        {showJoinChallengeModal && (
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Marca</label>
            <Input
              type="number"
              placeholder={`Ej: 8 ${CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}`}
              value={joinValue}
              onChange={(e) => setJoinValue(e.target.value)}
              min="0"
              step={showJoinChallengeModal.type === 'weight' ? 0.5 : 1}
              className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
            />
            <button
              type="button"
              disabled={!joinValue || joinSubmitting}
              onClick={handleJoinSubmit}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
            >
              {joinSubmitting ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        )}
      </GlassModal>

      {/* Friend Detail Modal */}
      {viewingProfileId && viewingProfileId !== user.id && typeof document !== 'undefined' && createPortal(
        <motion.div
          key="profile-screen"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-0 overflow-y-auto bg-slate-50 dark:bg-slate-950"
          style={{ zIndex: 99000 }}
        >
          <div className="mx-auto max-w-2xl px-4 py-5 pb-28">
            <ProfileScreen
              userId={viewingProfileId}
              liveAvatar={viewingProfileId === user.id ? user.avatar : undefined}
              onBack={() => setViewingProfileId(null)}
              onOpenProfile={id => setViewingProfileId(id)}
              onOpenRoutine={() => {
                const friend = friendsList.find(f => f.id === viewingProfileId);
                if (friend) openFriendModal(friend);
              }}
              onSendFriendRequest={
                onSendFriendRequest ? async () => { await onSendFriendRequest(viewingProfileId); } : undefined
              }
              onOpenChat={peerId => {
                setViewingProfileId(null);
                setChatPeerId(peerId);
                setActiveTab('chat');
              }}
            />
          </div>
        </motion.div>,
        document.body
      )}

      <GlassModal
        open={!!showFriendModal}
        onClose={closeFriendSheet}
        rise
        sheet
        title={friendProfile?.name || showFriendModal?.name || 'Perfil'}
        subtitle={
          friendProfile?.coach
            ? `Entrena con ${friendProfile.coach.name}`
            : friendProfile?.athleteCount
              ? `Entrenador de ${friendProfile.athleteCount}`
              : 'Marcas y rutina'
        }
        footer={
          showFriendModal ? (
            <div className="flex gap-2">
              {onUnfriend && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setUnfriendConfirmFriend(showFriendModal)}
                >
                  <UserMinus size={16} />
                </Button>
              )}
              <Button
                variant="primary"
                className="flex-1 rounded-xl"
                onClick={() => {
                  const id = showFriendModal.id;
                  closeFriendSheet();
                  setChatPeerId(id);
                  setActiveTab('chat');
                }}
              >
                Escribir
              </Button>
            </div>
          ) : undefined
        }
      >
        {showFriendModal && (
          <div>
              <div className="mb-5">
                <InstagramCover
                  name={friendProfile?.name || showFriendModal.name}
                  username={friendProfile?.username}
                  avatar={friendProfile?.avatar || showFriendModal.avatar}
                  posts={friendProfile?.postCount ?? 0}
                  followers={friendProfile?.followerCount ?? 0}
                  following={friendProfile?.followingCount ?? 0}
                  bio={friendProfile?.bio || ''}
                />
                {friendProfile?.coach && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <GraduationCap size={13} />
                    Entrena con {friendProfile.coach.name}
                  </p>
                )}
                {!!friendProfile?.athleteCount && friendProfile.athleteCount > 0 && (
                  <p className="mt-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    Entrenador de {friendProfile.athleteCount}{' '}
                    {friendProfile.athleteCount === 1 ? 'persona' : 'personas'}
                  </p>
                )}
              </div>

              <div className="border-t border-white/40 pt-4 pb-4 dark:border-white/10">
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Marcas</h4>
                {friendProfile?.trainingMaxes && friendProfile.trainingMaxes.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {friendProfile.trainingMaxes.map((tm, i) => (
                      <button
                        key={tm.id || `${tm.name}-${i}`}
                        type="button"
                        onClick={() => setOpenFriendTm(tm)}
                        className="rounded-2xl bg-white/70 px-2.5 py-2.5 text-left shadow-sm ring-1 ring-black/[0.04] dark:bg-white/5 dark:ring-white/[0.06]"
                      >
                        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tm.name}</p>
                        <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {tm.value}
                          <span className="ml-0.5 text-[11px] font-medium text-slate-400">
                            {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}
                          </span>
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-center text-sm text-slate-400">Aún no tiene marcas.</p>
                )}
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Rutina activa</h4>
                {friendRoutineLoading ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : friendRoutine ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600">
                      <div className="flex items-center gap-2 mb-3">
                        <Dumbbell size={18} className="text-indigo-600 dark:text-indigo-400" />
                        <span className="font-bold text-slate-900 dark:text-slate-100">{friendRoutine.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {friendRoutine.weeks?.length || 0} semanas · {friendRoutine.weeks?.flatMap(w => w.days).filter(d => d.type === 'workout').length || 0} días de entrenamiento
                      </p>
                      {friendRoutine.weeks?.[0] && (
                        <div className="mt-3 space-y-2">
                          {friendRoutine.weeks[0].days.filter(d => d.type === 'workout').slice(0, 3).map(day => (
                            <div key={day.id} className="text-xs">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{day.name}:</span>
                              <span className="text-slate-500 dark:text-slate-400 ml-2">
                                {day.exercises.map(e => e.name).join(', ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {copiedRoutineFromFriend && onGoToCopiedRoutine ? (
                      <div className="space-y-3">
                        {activeRoutineId === copiedRoutineFromFriend.id ? (
                          <>
                            <p className="text-xs text-center text-slate-500 dark:text-slate-400 leading-relaxed px-1">
                              Ya tienes esta rutina copiada y es la que tienes <span className="font-semibold text-slate-700 dark:text-slate-300">activa</span> ahora.
                            </p>
                            <Button
                              variant="primary"
                              className="w-full rounded-xl"
                              onClick={() => onGoToCopiedRoutine(copiedRoutineFromFriend.id)}
                            >
                              <ArrowRight size={18} className="mr-2 shrink-0" />
                              Ir a Programa (Rutinas)
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            className="w-full rounded-xl"
                            onClick={() => onGoToCopiedRoutine(copiedRoutineFromFriend.id)}
                          >
                            <ArrowRight size={18} className="mr-2 shrink-0" />
                            Activar esta rutina
                          </Button>
                        )}
                      </div>
                    ) : onCopyFriendRoutine ? (
                      <Button 
                        variant="primary" 
                        className="w-full rounded-xl"
                        onClick={() => void handleCopyAndActivate()}
                        disabled={copyingFriendRoutine}
                      >
                        {copyingFriendRoutine ? (
                          <>
                            <Loader2 size={18} className="mr-2 animate-spin shrink-0" />
                            Copiando rutina…
                          </>
                        ) : (
                          <>
                            <Copy size={18} className="mr-2 shrink-0" />
                            Copiar y activar en Rutinas
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 py-6 text-center text-sm">
                    {showFriendModal.name} no tiene una rutina configurada o la tiene oculta.
                  </p>
                )}
              </div>
          </div>
        )}
      </GlassModal>

      {openFriendTm && showFriendModal && (
        <TmHistoryModal
          userId={showFriendModal.id}
          tm={openFriendTm}
          onClose={() => setOpenFriendTm(null)}
        />
      )}

      <GlassModal
        open={!!unfriendConfirmFriend}
        onClose={() => setUnfriendConfirmFriend(null)}
        rise
        zIndexClass="z-[100050]"
        title="¿Dejar de ser amigo?"
        subtitle={unfriendConfirmFriend?.name}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setUnfriendConfirmFriend(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1 rounded-xl"
              onClick={async () => {
                if (!unfriendConfirmFriend) return;
                try {
                  await onUnfriend?.(unfriendConfirmFriend.id);
                } catch (e: any) {
                  setFriendActionError(e?.message || 'No se pudo eliminar la amistad.');
                }
                setUnfriendConfirmFriend(null);
                closeFriendSheet();
              }}
            >
              Dejar de ser amigo
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Dejáis de ser amigos. Podéis volver a enviaros solicitud cuando queráis.
        </p>
      </GlassModal>

      <HomeActivitySheet
        open={showHomeActivity}
        onClose={() => setShowHomeActivity(false)}
        pendingRequests={pendingRequests}
        chatAsks={chatAsks}
        groupInvites={groupInvites}
        coachRequests={coachRequests}
        acceptRejectLoadingId={acceptRejectLoadingId}
        chatAskBusyId={chatAskBusyId}
        groupInviteBusyId={groupInviteBusyId}
        coachRequestBusyId={coachRequestBusyId}
        onAcceptFriend={id => void handleRequestAction(id, onAccept)}
        onRejectFriend={id => void handleRequestAction(id, onReject)}
        onAnswerChat={(id, decision) => {
          void answerChatAsk(id, decision);
          if (decision === 'accept') setShowHomeActivity(false);
        }}
        onAnswerGroup={(id, decision) => {
          void answerGroup(id, decision);
          if (decision === 'accept') setShowHomeActivity(false);
        }}
        onAnswerCoach={(id, decision) => void answerCoach(id, decision)}
        onOpenProfile={id => {
          setShowHomeActivity(false);
          const friend = friendsList.find(f => f.id === id);
          void openFriendModal(friend || { id, name: 'Atleta' });
        }}
        onGoFriends={() => {
          setShowHomeActivity(false);
          setActiveTab('friends');
        }}
        onOpenChat={peerId => {
          setShowHomeActivity(false);
          setChatPeerId(peerId);
          setActiveTab('chat');
        }}
        onGoChallenges={() => {
          setShowHomeActivity(false);
          setActiveTab('challenges');
        }}
        onNotificationsRead={markHomeNotifsRead}
      />
    </motion.div>
  );
};

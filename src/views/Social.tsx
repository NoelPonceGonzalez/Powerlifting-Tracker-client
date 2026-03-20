import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  UserPlus, 
  UserCheck, 
  UserX, 
  UserMinus,
  Trophy,
  MapPin,
  Clock, 
  Plus,
  Bell,
  ArrowRight,
  Calendar,
  TrendingUp,
  Copy,
  Dumbbell,
  X,
  Send,
  Check,
  Pencil,
  Trash2
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { FriendRequest, Friend, Challenge, GymCheckIn, User, UserSearchResult, ChallengeType, TrainingWeek } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { apiPut } from '@/src/lib/api';
import { apiGet } from '@/src/lib/api';

interface SocialViewProps {
  user: User;
  friendsList: Friend[];
  requests: FriendRequest[];
  challenges: Challenge[];
  checkIns: GymCheckIn[];
  initialTab?: 'friends' | 'challenges' | 'checkins';
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendFriendRequest?: (userId: string) => Promise<void>;
  onCreateChallenge: (data: { title: string; description?: string; type: ChallengeType; exercise: string; endDate: string }) => void;
  onJoinChallenge: (id: string, value: number) => void;
  onCheckIn: (gymName: string, time: string) => void;
  onCheckInUpdate?: (checkInId: string, gymName: string, time: string) => void;
  onCheckInDelete?: (checkInId: string) => void;
  onRefreshChallenges?: () => void;
  onCopyFriendRoutine?: (routine: { name: string; weeks: TrainingWeek[] }) => void;
  onUnfriend?: (friendId: string) => Promise<void>;
}

const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  max_reps: 'Repeticiones',
  weight: 'Fuerza (IPF GL)',
  seconds: 'Segundos',
};

const CHALLENGE_TYPE_UNIT: Record<ChallengeType, string> = {
  max_reps: 'reps',
  weight: 'kg',
  seconds: 'seg',
};

export const SocialView: React.FC<SocialViewProps> = ({ 
  user,
  friendsList,
  requests, 
  challenges, 
  checkIns,
  initialTab = 'friends',
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
  onUnfriend,
}) => {
  const [search, setSearch] = useState('');
  const [challengeSearch, setChallengeSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'challenges' | 'checkins'>(initialTab);
  const [challengeSubTab, setChallengeSubTab] = useState<'active' | 'finished' | 'progress'>('active');
  const [progressExerciseFilter, setProgressExerciseFilter] = useState<string>('');
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState(false);
  const [showJoinChallengeModal, setShowJoinChallengeModal] = useState<Challenge | null>(null);
  const [selectedChallengeDetail, setSelectedChallengeDetail] = useState<Challenge | null>(null);
  const [showFriendModal, setShowFriendModal] = useState<Friend | null>(null);
  const [unfriendConfirmFriend, setUnfriendConfirmFriend] = useState<Friend | null>(null);
  const [friendRoutine, setFriendRoutine] = useState<{ name: string; weeks: TrainingWeek[] } | null>(null);
  const [friendRoutineLoading, setFriendRoutineLoading] = useState(false);
  const [friendProfile, setFriendProfile] = useState<{ name: string; avatar: string; trainingMaxes: { name: string; value: number; mode: string }[] } | null>(null);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
  const [gymName, setGymName] = useState('');
  const [gymTime, setGymTime] = useState('');
  const [editingCheckIn, setEditingCheckIn] = useState<GymCheckIn | null>(null);

  // Búsqueda de usuarios
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Form crear torneo
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createType, setCreateType] = useState<ChallengeType>('max_reps');
  const [createExercise, setCreateExercise] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Form unirse a torneo
  const [joinValue, setJoinValue] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  const pendingRequests = requests.filter(r => r.status === 'pending');

  // Marcar notificaciones como leídas al ver la pestaña Actividad
  useEffect(() => {
    if (activeTab === 'checkins') {
      apiPut('/api/notifications/read-all', {}).catch(() => {});
    }
  }, [activeTab]);

  // Debounced search de usuarios
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q: search.trim() });
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const now = new Date();
  const activeChallenges = challenges.filter(c => (c.status || (new Date(c.endDate) > now)) && new Date(c.endDate) > now);
  const finishedChallenges = challenges.filter(c => (c.status === 'finished') || new Date(c.endDate) <= now);
  const displayedChallenges = challengeSubTab === 'active' ? activeChallenges : challengeSubTab === 'progress' ? [...activeChallenges, ...finishedChallenges] : finishedChallenges;

  /** Calcular % de mejora: ((final - inicial) / inicial) * 100. Si inicial=0, retorna 0. */
  const getImprovementPct = (p: { value: number; initialValue?: number }) => {
    const init = p.initialValue ?? p.value;
    if (init <= 0) return 0;
    return Math.round(((p.value - init) / init) * 100);
  };

  /** Torneos en los que participa el usuario */
  const myProgressChallenges = challenges.filter(c => c.participants.some(p => p.userId === user.id));
  const myImprovements = myProgressChallenges.map(c => {
    const p = c.participants.find(pa => pa.userId === user.id)!;
    return { challenge: c, improvement: getImprovementPct(p) };
  });
  const myAverageImprovement = myImprovements.length > 0
    ? Math.round(myImprovements.reduce((s, x) => s + x.improvement, 0) / myImprovements.length)
    : 0;

  const distinctExercises = Array.from(new Set(challenges.map(c => c.exercise))).sort();

  const challengeSearchLower = challengeSearch.toLowerCase();
  let filteredChallenges = challengeSearchLower
    ? displayedChallenges.filter(
        c =>
          c.title.toLowerCase().includes(challengeSearchLower) ||
          (c.exercise || '').toLowerCase().includes(challengeSearchLower) ||
          (c.description || '').toLowerCase().includes(challengeSearchLower)
      )
    : displayedChallenges;

  if (challengeSubTab === 'progress' && progressExerciseFilter) {
    filteredChallenges = filteredChallenges.filter(c => c.exercise === progressExerciseFilter);
  }

  const filteredFriends = search.trim().length >= 2
    ? friendsList.filter(
        f =>
          f.name?.toLowerCase().includes(search.toLowerCase()) ||
          f.email?.toLowerCase().includes(search.toLowerCase())
      )
    : friendsList;

  const openJoinModal = useCallback((challenge: Challenge) => {
    setShowJoinChallengeModal(challenge);
    setJoinValue('');
  }, []);

  const openFriendModal = useCallback(async (friend: Friend) => {
    setShowFriendModal(friend);
    setFriendRoutine(null);
    setFriendProfile(null);
    setFriendRoutineLoading(true);
    try {
      const [routine, profile] = await Promise.all([
        apiGet<{ name: string; weeks: TrainingWeek[] } | null>(`/api/social/friends/${friend.id}/routine`),
        apiGet<{ name: string; avatar: string; trainingMaxes: { name: string; value: number; mode: string }[] }>(`/api/social/friends/${friend.id}/profile`).catch(() => ({ name: friend.name, avatar: friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.name)}`, trainingMaxes: [] })),
      ]);
      setFriendRoutine(routine);
      setFriendProfile(profile);
    } catch {
      setFriendRoutine(null);
      setFriendProfile({ name: friend.name, avatar: friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friend.name)}`, trainingMaxes: [] });
    } finally {
      setFriendRoutineLoading(false);
    }
  }, []);

  const handleCopyAndActivate = useCallback(() => {
    if (!friendRoutine || !onCopyFriendRoutine) return;
    onCopyFriendRoutine(friendRoutine);
    setShowFriendModal(null);
    setFriendRoutine(null);
  }, [friendRoutine, onCopyFriendRoutine]);

  const handleSendRequestClick = useCallback(async (u: UserSearchResult) => {
    if (!onSendFriendRequest || u.friendshipStatus === 'accepted' || u.friendshipStatus === 'pending') return;
    setSendingRequestTo(u.id);
    try {
      await onSendFriendRequest(u.id);
      setSearchResults(prev => prev.map(x => x.id === u.id ? { ...x, friendshipStatus: 'pending' as const } : x));
    } finally {
      setSendingRequestTo(null);
    }
  }, [onSendFriendRequest]);

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
      });
      setShowCreateChallengeModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreateExercise('');
      setCreateEndDate('');
      onRefreshChallenges?.();
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
    } finally {
      setJoinSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32 text-slate-900 dark:text-slate-100"
    >
      <header className="mb-10">
        <div className="mb-6 flex items-center justify-between">
          <Avatar 
            src={user.avatar} 
            name={user.name} 
            className="w-12 h-12 rounded-2xl border-2 border-white dark:border-slate-700 shadow-lg"
          />
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => setShowCheckInModal(true)}
            className="w-11 h-11 p-0 rounded-xl shadow-lg shadow-indigo-200"
            title="Voy al Gym"
            aria-label="Voy al Gym"
          >
            <MapPin size={18} />
          </Button>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl dark:bg-slate-800">
          {(['friends', 'challenges', 'checkins'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === tab ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400" : "text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              {tab === 'friends' ? 'Amigos' : tab === 'challenges' ? 'Torneos' : 'Actividad'}
            </button>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'friends' && (
          <motion.div 
            key="friends"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="mb-6">
              <Input 
                placeholder="Buscar atletas por nombre, email o usuario..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={20} />}
                className="py-4 text-lg"
              />
              {searchLoading && <p className="text-xs text-slate-400 mt-1">Buscando...</p>}
            </div>

            {search.trim().length >= 2 && searchResults.length > 0 && (
              <section>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4 dark:text-slate-100">Resultados de búsqueda</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map(u => (
                    <Card key={u.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar src={u.avatar} name={u.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-slate-100">{u.name}</h3>
                          {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                        </div>
                      </div>
                      <div>
                        {u.friendshipStatus === 'accepted' ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                            <Check size={14} />
                            Amigos
                          </span>
                        ) : u.friendshipStatus === 'pending' ? (
                          <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400"
                          >
                            <Send size={14} />
                            Enviada
                          </motion.span>
                        ) : (
                          <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={() => handleSendRequestClick(u)}
                            disabled={sendingRequestTo === u.id}
                            className="rounded-full min-w-[44px] min-h-[44px]"
                          >
                            {sendingRequestTo === u.id ? (
                              <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
                                className="inline-block"
                              >
                                <Send size={16} />
                              </motion.span>
                            ) : (
                              <UserPlus size={16} />
                            )}
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight dark:text-slate-100">Solicitudes Pendientes</h2>
                <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-xs font-bold">
                  {pendingRequests.length}
                </span>
              </div>

              {pendingRequests.length === 0 ? (
                <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                  <p className="text-slate-400 font-medium">No tienes solicitudes pendientes</p>
                </Card>
              ) : (
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
                          onClick={() => onReject(req.id)}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          <UserX size={18} />
                        </Button>
                        <Button 
                          variant="primary" 
                          size="sm" 
                          onClick={() => onAccept(req.id)}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          <UserCheck size={18} />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4 dark:text-slate-100">Mis Amigos</h2>
              {filteredFriends.length === 0 ? (
                <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                  <p className="text-slate-400 font-medium">Aún no tienes amigos. Busca atletas arriba.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredFriends.map(f => (
                    <Card 
                      key={f.id} 
                      padding="md" 
                      rounded="xl" 
                      className="flex items-center gap-4 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                      onClick={() => openFriendModal(f)}
                    >
                      <Avatar src={f.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.name || 'U')}`} name={f.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100">{f.name}</h3>
                        {f.email && <p className="text-xs text-slate-500 truncate">{f.email}</p>}
                      </div>
                      <ArrowRight size={18} className="text-slate-400 flex-shrink-0" />
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}

        {activeTab === 'challenges' && (
          <motion.div 
            key="challenges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button 
                  onClick={() => setChallengeSubTab('active')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    challengeSubTab === 'active' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Activos
                </button>
                <button 
                  onClick={() => setChallengeSubTab('finished')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    challengeSubTab === 'finished' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Finalizados
                </button>
                <button 
                  onClick={() => setChallengeSubTab('progress')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    challengeSubTab === 'progress' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Progreso
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowCreateChallengeModal(true)} className="rounded-xl border-2">
                <Plus size={16} className="mr-2" />
                <span className="text-[10px] font-black uppercase tracking-widest">Crear Torneo</span>
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Input 
                placeholder="Buscar torneos por título, ejercicio..."
                value={challengeSearch}
                onChange={(e) => setChallengeSearch(e.target.value)}
                icon={<Search size={20} />}
                className="py-3 flex-1"
              />
              {challengeSubTab === 'progress' && (
                <select
                  value={progressExerciseFilter}
                  onChange={(e) => setProgressExerciseFilter(e.target.value)}
                  className="rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-slate-100 font-medium min-w-[180px]"
                >
                  <option value="">Todos los ejercicios</option>
                  {distinctExercises.map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
              )}
            </div>

            {challengeSubTab === 'progress' && (
              <Card padding="lg" rounded="2xl" className="border-2 border-indigo-200 dark:border-indigo-900/50 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/30 dark:to-slate-900">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-100 dark:bg-indigo-900/50 p-4 rounded-2xl">
                    <TrendingUp size={32} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Tu mejora media</h3>
                    <p className="text-3xl font-black text-slate-900 dark:text-slate-100">{myAverageImprovement > 0 ? '+' : ''}{myAverageImprovement}%</p>
                    <p className="text-xs text-slate-500 mt-1">Promedio de todos tus torneos (desde que te uniste hasta el final)</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredChallenges.map(challenge => {
                const isFinished = challengeSubTab === 'finished' || new Date(challenge.endDate) <= now;
                const isParticipant = challenge.participants.some(p => p.userId === user.id);
                const unit = CHALLENGE_TYPE_UNIT[challenge.type as ChallengeType] || '';

                return (
                  <Card 
                    key={challenge.id} 
                    padding="lg" 
                    rounded="2xl" 
                    className={cn(
                      "border-2 relative overflow-hidden group cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors",
                      isFinished ? "border-slate-200 opacity-90 dark:border-slate-700" : "border-slate-100 dark:border-slate-700"
                    )}
                    onClick={() => setSelectedChallengeDetail(challenge)}
                  >
                    {isFinished && (
                      <div className="absolute top-3 right-3 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase px-2 py-1 rounded-lg">
                        Finalizado
                      </div>
                    )}
                    <div className="absolute top-0 right-0 p-4">
                      <div className="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 p-2 rounded-xl">
                        <Trophy size={20} />
                      </div>
                    </div>
                    <div className="mb-6">
                      <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-1">{challenge.title}</h3>
                      {challenge.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{challenge.description}</p>
                      )}
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{challenge.exercise}</p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {CHALLENGE_TYPE_LABELS[challenge.type as ChallengeType]}
                        <span className="mx-1">•</span>
                        <Calendar size={10} className="inline" /> Hasta {new Date(challenge.endDate).toLocaleDateString('es-ES')}
                      </p>
                    </div>

                    <div className="space-y-4 mb-6">
                      {(challengeSubTab === 'progress'
                        ? [...challenge.participants].sort((a, b) => getImprovementPct(b) - getImprovementPct(a))
                        : [...challenge.participants].sort((a, b) => b.score - a.score)
                      ).map((p, idx) => {
                        const imp = getImprovementPct(p);
                        return (
                          <div key={p.userId} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                "text-xs font-black w-4",
                                idx === 0 && challengeSubTab === 'progress' ? "text-emerald-500 dark:text-emerald-400" :
                                idx === 0 ? "text-amber-500 dark:text-amber-400" :
                                idx === 1 ? "text-slate-500 dark:text-slate-400" :
                                idx === 2 ? "text-amber-700 dark:text-amber-600" :
                                "text-slate-300 dark:text-slate-600"
                              )}>{idx + 1}</span>
                              <Avatar src={p.avatar} name={p.name} className="w-8 h-8 rounded-full border border-slate-100 dark:border-slate-700" />
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{p.name}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              {challengeSubTab === 'progress' ? (
                                <>
                                  <span className={cn(
                                    "text-sm font-black",
                                    imp > 0 ? "text-emerald-600 dark:text-emerald-400" : imp < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500"
                                  )}>{imp > 0 ? '+' : ''}{imp}%</span>
                                  <span className="text-[10px] text-slate-400 font-medium">{p.initialValue ?? p.value} → {p.value} {unit}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">{p.score} pts</span>
                                  <span className="text-[10px] text-slate-400 font-medium">{p.value} {unit}</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!isFinished && !isParticipant && (
                      <Button 
                        variant="primary" 
                        className="w-full rounded-xl"
                        onClick={(e) => { e.stopPropagation(); openJoinModal(challenge); }}
                      >
                        Unirse al Torneo
                      </Button>
                    )}
                    {!isFinished && isParticipant && (
                      <Button 
                        variant="outline" 
                        className="w-full rounded-xl"
                        onClick={(e) => { e.stopPropagation(); openJoinModal(challenge); }}
                      >
                        Actualizar mi marca
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>

            {filteredChallenges.length === 0 && (
              <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                <p className="text-slate-400 font-medium">
                  {challengeSubTab === 'active' 
                    ? 'No hay torneos activos. Crea uno o espera a que tus amigos creen uno.' 
                    : challengeSubTab === 'progress'
                      ? 'No hay torneos con datos de progreso. Únete a torneos y actualiza tu marca para ver la mejora.'
                      : 'No hay torneos finalizados.'}
                </p>
              </Card>
            )}
          </motion.div>
        )}

        {activeTab === 'checkins' && (
          <motion.div 
            key="checkins"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6 dark:text-slate-100">Actividad de Amigos</h2>
            
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
                    <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                      <p className="text-slate-400 font-medium">Nadie ha avisado que va al gym hoy</p>
                    </Card>
                  ) : (
                    othersCheckIns.map(checkIn => (
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
                        <Button variant="ghost" size="sm" className="text-indigo-600 flex-shrink-0">
                          <ArrowRight size={18} />
                        </Button>
                      </Card>
                    ))
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Check-In Modal (crear o editar) */}
      {(showCheckInModal || editingCheckIn) && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div key="checkin-modal" className="fixed inset-0 flex items-center justify-center px-4 py-6 min-h-[100dvh] overflow-y-auto" style={{ zIndex: 100000 }}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowCheckInModal(false); setEditingCheckIn(null); setGymName(''); setGymTime(''); }}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl dark:border dark:border-slate-700 my-auto"
            >
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-6 uppercase tracking-tight dark:text-slate-100">
                {editingCheckIn ? 'Editar hora de entreno' : '¿A qué gym vas?'}
              </h3>
              <div className="space-y-4 mb-8">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre del Gimnasio</label>
                  <Input 
                    placeholder="Ej: Basic Fit, McFit..." 
                    value={gymName}
                    onChange={(e) => setGymName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hora de llegada</label>
                  <Input 
                    type="time" 
                    value={gymTime}
                    onChange={(e) => setGymTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowCheckInModal(false); setEditingCheckIn(null); setGymName(''); setGymTime(''); }}>Cancelar</Button>
                {editingCheckIn && onCheckInDelete && (
                  <Button
                    variant="outline"
                    className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    onClick={() => {
                      onCheckInDelete(editingCheckIn.id);
                      setShowCheckInModal(false);
                      setEditingCheckIn(null);
                      setGymName('');
                      setGymTime('');
                    }}
                  >
                    Quitar mi hora
                  </Button>
                )}
                <Button 
                  variant="primary" 
                  className="flex-1"
                  disabled={!gymName.trim() || !gymTime}
                  onClick={() => {
                    if (editingCheckIn && onCheckInUpdate) {
                      onCheckInUpdate(editingCheckIn.id, gymName.trim(), gymTime);
                      setEditingCheckIn(null);
                    } else {
                      onCheckIn(gymName.trim(), gymTime);
                      setShowCheckInModal(false);
                    }
                    setGymName('');
                    setGymTime('');
                  }}
                >
                  {editingCheckIn ? 'Guardar' : 'Confirmar'}
                </Button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* Create Challenge Modal */}
      {showCreateChallengeModal && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div key="create-challenge-modal" className="fixed inset-0 flex items-center justify-center px-4 overflow-y-auto py-8 min-h-[100dvh]" style={{ zIndex: 100000 }}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateChallengeModal(false)}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl dark:border dark:border-slate-700"
            >
              <h3 className="text-2xl font-black text-slate-900 mb-6 uppercase tracking-tight dark:text-slate-100">Crear Torneo</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Solo tus amigos podrán unirse.</p>
              <div className="space-y-4 mb-8">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Título *</label>
                  <Input 
                    placeholder="Ej: Dominadas de marzo" 
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción (opcional)</label>
                  <Input 
                    placeholder="Reglas o detalles adicionales" 
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de prueba</label>
                  <select 
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value as ChallengeType)}
                    className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-slate-900 dark:text-slate-100"
                  >
                    <option value="max_reps">Repeticiones</option>
                    <option value="weight">Fuerza (IPF GL)</option>
                    <option value="seconds">Segundos</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ejercicio *</label>
                  <Input 
                    placeholder="Ej: Dominadas, Plancha..." 
                    value={createExercise}
                    onChange={(e) => setCreateExercise(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha de fin *</label>
                  <Input 
                    type="date" 
                    value={createEndDate}
                    onChange={(e) => setCreateEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreateChallengeModal(false)}>Cancelar</Button>
                <Button 
                  variant="primary" 
                  className="flex-1"
                  disabled={!createTitle.trim() || !createExercise.trim() || !createEndDate || createSubmitting}
                  onClick={handleCreateSubmit}
                >
                  {createSubmitting ? 'Creando...' : 'Crear torneo'}
                </Button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* Challenge Detail Modal - Ranking con oro/plata/bronce */}
      {selectedChallengeDetail && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div key="challenge-detail-modal" className="fixed inset-0 flex items-center justify-center px-4 min-h-[100dvh]" style={{ zIndex: 100000 }}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedChallengeDetail(null)}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl dark:border dark:border-slate-700"
            >
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <Trophy size={24} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{selectedChallengeDetail.title}</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{selectedChallengeDetail.exercise}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedChallengeDetail(null)}
                  className="p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-1">
                <Calendar size={12} /> Hasta {new Date(selectedChallengeDetail.endDate).toLocaleDateString('es-ES')}
                <span className="mx-1">•</span>
                {CHALLENGE_TYPE_LABELS[selectedChallengeDetail.type as ChallengeType]}
              </p>

              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Clasificación</h4>
              <div className="space-y-2 mb-6">
                {(challengeSubTab === 'progress'
                  ? [...selectedChallengeDetail.participants].sort((a, b) => getImprovementPct(b) - getImprovementPct(a))
                  : [...selectedChallengeDetail.participants].sort((a, b) => b.score - a.score)
                ).map((p, idx) => {
                  const rank = idx + 1;
                  const imp = getImprovementPct(p);
                  const unit = CHALLENGE_TYPE_UNIT[selectedChallengeDetail.type as ChallengeType] || '';
                  const rankStyle = rank === 1
                    ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700/50'
                    : rank === 2
                      ? 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-600/50'
                      : rank === 3
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/70 dark:border-amber-800/50'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50';
                  const rankText = rank === 1
                    ? 'text-amber-600 dark:text-amber-400'
                    : rank === 2
                      ? 'text-slate-500 dark:text-slate-400'
                      : rank === 3
                        ? 'text-amber-700 dark:text-amber-600'
                        : 'text-slate-600 dark:text-slate-400';
                  return (
                    <div 
                      key={p.userId} 
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-xl border-2 transition-colors",
                        rankStyle,
                        p.userId === user.id && "ring-2 ring-indigo-400 dark:ring-indigo-500"
                      )}
                    >
                      <span className={cn("text-lg font-black w-8 flex justify-center", rankText)}>{rank}</span>
                      <Avatar src={p.avatar} name={p.name} className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-700 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.name}</p>
                        {challengeSubTab === 'progress' ? (
                          <p className={cn(
                            "text-sm font-black",
                            imp > 0 ? "text-emerald-600 dark:text-emerald-400" : imp < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500"
                          )}>{imp > 0 ? '+' : ''}{imp}%</p>
                        ) : (
                          <p className="text-sm font-black text-slate-700 dark:text-slate-300">{p.score} pts · {p.value} {unit}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {new Date(selectedChallengeDetail.endDate) > now && (
                <div className="flex gap-3">
                  {!selectedChallengeDetail.participants.some(p => p.userId === user.id) ? (
                    <Button 
                      variant="primary" 
                      className="flex-1 rounded-xl"
                      onClick={(e) => { e.stopPropagation(); setSelectedChallengeDetail(null); openJoinModal(selectedChallengeDetail); }}
                    >
                      Unirse al Torneo
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="flex-1 rounded-xl"
                      onClick={(e) => { e.stopPropagation(); setSelectedChallengeDetail(null); openJoinModal(selectedChallengeDetail); }}
                    >
                      Actualizar mi marca
                    </Button>
                  )}
                  <Button variant="outline" className="rounded-xl" onClick={() => setSelectedChallengeDetail(null)}>
                    Cerrar
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* Join Challenge Modal */}
      {showJoinChallengeModal && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div key="join-challenge-modal" className="fixed inset-0 flex items-center justify-center px-4 min-h-[100dvh]" style={{ zIndex: 100000 }}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinChallengeModal(null)}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl dark:border dark:border-slate-700"
            >
              <h3 className="text-2xl font-black text-slate-900 mb-2 dark:text-slate-100">{showJoinChallengeModal.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                {showJoinChallengeModal.exercise} – Introduce tu marca en {CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}
              </p>
              <div className="space-y-4 mb-8">
                <Input 
                  type="number"
                  placeholder={`Tu marca en ${CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}`}
                  value={joinValue}
                  onChange={(e) => setJoinValue(e.target.value)}
                  min="0"
                  step={showJoinChallengeModal.type === 'weight' ? 0.5 : 1}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowJoinChallengeModal(null)}>Cancelar</Button>
                <Button 
                  variant="primary" 
                  className="flex-1"
                  disabled={!joinValue || joinSubmitting}
                  onClick={handleJoinSubmit}
                >
                  {joinSubmitting ? 'Uniendo...' : 'Confirmar'}
                </Button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* Friend Detail Modal */}
      {showFriendModal && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div key="friend-detail-modal" className="fixed inset-0 flex items-center justify-center px-4 min-h-[100dvh]" style={{ zIndex: 100000 }}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowFriendModal(null); setFriendRoutine(null); setFriendProfile(null); }}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl dark:border dark:border-slate-700 max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between gap-2 mb-6 pr-1">
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 truncate flex-1 min-w-0">
                  {friendProfile?.name || showFriendModal.name}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  {onUnfriend && (
                    <button
                      onClick={() => setUnfriendConfirmFriend(showFriendModal)}
                      className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                      title="Dejar de ser amigo"
                    >
                      <UserMinus size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => { setShowFriendModal(null); setFriendRoutine(null); setFriendProfile(null); }}
                    className="p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Cerrar"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 mb-6">
                <Avatar 
                  src={friendProfile?.avatar || showFriendModal.avatar} 
                  name={friendProfile?.name || showFriendModal.name} 
                  className="w-20 h-20 rounded-full border-2 border-slate-200 dark:border-slate-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">{friendProfile?.name || showFriendModal.name}</h4>
                </div>
              </div>

              {friendProfile?.trainingMaxes && friendProfile.trainingMaxes.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-6 pb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Marcas compartidas</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {friendProfile.trainingMaxes.map((tm, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate">{tm.name}</p>
                        <p className="text-lg font-black text-slate-900 dark:text-slate-100">
                          {tm.value} <span className="text-xs font-medium text-slate-400">{tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    {onCopyFriendRoutine && (
                      <Button 
                        variant="primary" 
                        className="w-full rounded-xl"
                        onClick={handleCopyAndActivate}
                      >
                        <Copy size={18} className="mr-2" />
                        Copiar y activar en Rutinas
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 py-6 text-center text-sm">
                    {showFriendModal.name} no tiene una rutina configurada o la tiene oculta.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* Confirmar dejar de ser amigo */}
      {unfriendConfirmFriend && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div key="unfriend-confirm-modal" className="fixed inset-0 flex items-center justify-center px-4 min-h-[100dvh]" style={{ zIndex: 100001 }}>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUnfriendConfirmFriend(null)}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-2xl dark:border dark:border-slate-700 text-center z-10"
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
                <UserMinus size={28} className="text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-2">¿Dejar de ser amigo?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Dejarás de ser amigo de <span className="font-semibold text-slate-700 dark:text-slate-300">{unfriendConfirmFriend.name}</span>. Podéis volver a enviaros solicitud cuando queráis.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 rounded-xl" 
                  onClick={() => setUnfriendConfirmFriend(null)}
                >
                  Cancelar
                </Button>
                <Button 
                  variant="primary"
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 border-rose-600"
                  onClick={async () => {
                    await onUnfriend?.(unfriendConfirmFriend.id);
                    setUnfriendConfirmFriend(null);
                    setShowFriendModal(null);
                    setFriendRoutine(null);
                  }}
                >
                  Dejar de ser amigo
                </Button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
};

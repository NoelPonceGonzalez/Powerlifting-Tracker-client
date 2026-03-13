import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Users, 
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
  Check
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { FriendRequest, Friend, Challenge, GymCheckIn, User, UserSearchResult, ChallengeType, TrainingWeek } from '@/src/types';
import { cn } from '@/src/lib/utils';
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
  onRefreshChallenges?: () => void;
  onCopyFriendRoutine?: (routine: { name: string; weeks: TrainingWeek[] }) => void;
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
  onRefreshChallenges,
  onCopyFriendRoutine,
}) => {
  const [search, setSearch] = useState('');
  const [challengeSearch, setChallengeSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'challenges' | 'checkins'>(initialTab);
  const [challengeSubTab, setChallengeSubTab] = useState<'active' | 'finished' | 'progress'>('active');
  const [progressExerciseFilter, setProgressExerciseFilter] = useState<string>('');
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState(false);
  const [showJoinChallengeModal, setShowJoinChallengeModal] = useState<Challenge | null>(null);
  const [showFriendModal, setShowFriendModal] = useState<Friend | null>(null);
  const [friendRoutine, setFriendRoutine] = useState<{ name: string; weeks: TrainingWeek[] } | null>(null);
  const [friendRoutineLoading, setFriendRoutineLoading] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
  const [gymName, setGymName] = useState('');
  const [gymTime, setGymTime] = useState('');

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
    setFriendRoutineLoading(true);
    try {
      const routine = await apiGet<{ name: string; weeks: TrainingWeek[] } | null>(`/api/social/friends/${friend.id}/routine`);
      setFriendRoutine(routine);
    } catch {
      setFriendRoutine(null);
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
      className="max-w-5xl mx-auto px-4 py-8 pb-32 text-slate-900 dark:text-slate-100"
    >
      <header className="mb-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <Users className="text-white" size={24} />
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">Comunidad</h1>
          </div>
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
                        <img 
                          src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`} 
                          alt={u.name} 
                          className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
                          referrerPolicy="no-referrer"
                        />
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
                        <img 
                          src={req.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.name)}`} 
                          alt={req.name} 
                          className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
                          referrerPolicy="no-referrer"
                        />
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
                      <img 
                        src={f.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.name)}`} 
                        alt={f.name} 
                        className="w-12 h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700"
                        referrerPolicy="no-referrer"
                      />
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
                  <Card key={challenge.id} padding="lg" rounded="2xl" className={cn(
                    "border-2 relative overflow-hidden group",
                    isFinished ? "border-slate-200 opacity-90 dark:border-slate-700" : "border-slate-100 dark:border-slate-700"
                  )}>
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
                                idx === 0 && challengeSubTab === 'progress' ? "text-emerald-500" : idx === 0 ? "text-amber-500" : "text-slate-300 dark:text-slate-600"
                              )}>{idx + 1}</span>
                              <img src={p.avatar} className="w-8 h-8 rounded-full border border-slate-100 dark:border-slate-700" referrerPolicy="no-referrer" alt="" />
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
                        onClick={() => openJoinModal(challenge)}
                      >
                        Unirse al Torneo
                      </Button>
                    )}
                    {!isFinished && isParticipant && (
                      <Button 
                        variant="outline" 
                        className="w-full rounded-xl"
                        onClick={() => openJoinModal(challenge)}
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
            
            <div className="space-y-4">
              {checkIns.length === 0 ? (
                <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                  <p className="text-slate-400 font-medium">Nadie ha avisado que va al gym hoy</p>
                </Card>
              ) : (
                checkIns.sort((a, b) => b.timestamp - a.timestamp).map(checkIn => (
                  <Card key={checkIn.id} padding="md" rounded="2xl" className="flex items-center justify-between border-l-4 border-l-indigo-600">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-2xl text-indigo-600 dark:text-indigo-400">
                        <Bell size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          <span className="text-indigo-600 dark:text-indigo-400">{checkIn.userName}</span> va a entrenar
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            <MapPin size={10} />
                            <span>{checkIn.gymName}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            <Clock size={10} />
                            <span>{checkIn.time}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-indigo-600">
                      <ArrowRight size={18} />
                    </Button>
                  </Card>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Check-In Modal */}
      <AnimatePresence>
        {showCheckInModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckInModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl dark:border dark:border-slate-700"
            >
              <h3 className="text-2xl font-black text-slate-900 mb-6 uppercase tracking-tight dark:text-slate-100">¿A qué gym vas?</h3>
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
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckInModal(false)}>Cancelar</Button>
                <Button 
                  variant="primary" 
                  className="flex-1"
                  onClick={() => {
                    onCheckIn(gymName, gymTime);
                    setShowCheckInModal(false);
                    setGymName('');
                    setGymTime('');
                  }}
                >
                  Confirmar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Challenge Modal */}
      <AnimatePresence>
        {showCreateChallengeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 overflow-y-auto py-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateChallengeModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl dark:border dark:border-slate-700"
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
        )}
      </AnimatePresence>

      {/* Join Challenge Modal */}
      <AnimatePresence>
        {showJoinChallengeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinChallengeModal(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl dark:border dark:border-slate-700"
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
        )}
      </AnimatePresence>

      {/* Friend Detail Modal */}
      <AnimatePresence>
        {showFriendModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowFriendModal(null); setFriendRoutine(null); }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl dark:border dark:border-slate-700 max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => { setShowFriendModal(null); setFriendRoutine(null); }}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-4 mb-6">
                <img 
                  src={showFriendModal.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(showFriendModal.name)}`} 
                  alt={showFriendModal.name} 
                  className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 dark:border-slate-600"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{showFriendModal.name}</h3>
                  {showFriendModal.email && <p className="text-sm text-slate-500">{showFriendModal.email}</p>}
                </div>
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
                    {showFriendModal.name} no tiene una rutina configurada aún.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

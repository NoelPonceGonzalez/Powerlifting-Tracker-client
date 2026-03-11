import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, TrendingUp, ArrowUpRight, Dumbbell, ChevronRight, MapPin, Clock, Bell } from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from 'recharts';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { HistoryEntry, RMData, TrainingMax, Challenge, GymCheckIn, User } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface DashboardProps {
  user: User;
  history: HistoryEntry[];
  rms: RMData;
  trainingMaxes: TrainingMax[];
  challenges: Challenge[];
  checkIns: GymCheckIn[];
  onOpenProgram: () => void;
  onOpenSocial: (tab?: 'friends' | 'challenges' | 'checkins') => void;
  onJoinFriendCheckIn: (checkIn: GymCheckIn) => void;
  onLogout: () => void;
}

export const DashboardView: React.FC<DashboardProps> = ({ 
  user,
  history, 
  rms, 
  trainingMaxes, 
  challenges,
  checkIns,
  onOpenProgram, 
  onOpenSocial,
  onJoinFriendCheckIn,
  onLogout 
}) => {
  const [selectedCheckIn, setSelectedCheckIn] = useState<GymCheckIn | null>(null);
  const lastHistory = history[history.length - 1];
  const firstHistory = history[0];
  const totalGain = lastHistory.total - firstHistory.total;

  const joinedChallenges = challenges.filter(c => 
    c.participants.some(p => p.userId === user.id)
  );

  const todayCheckIns = checkIns.filter(ci => {
    const checkInDate = new Date(ci.timestamp).toDateString();
    const todayDate = new Date().toDateString();
    return checkInDate === todayDate;
  });

  const getTMConfig = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('banca')) return { color: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-600' };
    if (lower.includes('sentadilla')) return { color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-600' };
    if (lower.includes('muerto')) return { color: '#f43f5e', bg: 'bg-rose-50', text: 'text-rose-600' };
    return { color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-600' };
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto px-4 py-8 pb-32"
    >
      <header className="mb-10 flex justify-between items-start">
        <div className="flex items-center gap-4">
          <img 
            src={user.avatar || 'https://picsum.photos/seed/default/100/100'} 
            className="w-16 h-16 rounded-3xl object-cover border-4 border-white shadow-lg"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl font-black tracking-tight text-slate-900">Elite 5/3/1</h1>
            </div>
            <p className="text-slate-500 font-medium">Hola, {user.name || 'Atleta'} • Tu progreso</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout} className="text-slate-400 hover:text-rose-500">
          Cerrar Sesión
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Main Stat Card */}
        <Card variant="dark" padding="lg" rounded="2xl" className="md:col-span-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 blur-[100px] rounded-full -mr-20 -mt-20" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div>
                <span className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1 block">Total Combinado</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black">{lastHistory.total}</span>
                  <span className="text-indigo-400 font-bold">kg</span>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                <ArrowUpRight size={18} className="text-emerald-400" />
                <span className="text-sm font-bold">+{totalGain}kg</span>
              </div>
            </div>
            
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'rgba(255,255,255,0.4)'}} />
                  <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    itemStyle={{ color: '#818cf8' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#818cf8" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* Individual Progress Cards - TODOS los TMs */}
        {trainingMaxes.map((tm, idx) => {
          const config = getTMConfig(tm.name);
          const historyKey = tm.linkedExercise || tm.name.toLowerCase().replace(/\s+/g, '_');
          
          // Obtener valores históricos del TM desde history.trainingMaxes
          const tmHistory = history.map(entry => ({
            date: entry.date,
            value: entry.trainingMaxes?.[tm.id] ?? (entry.rms[historyKey] ?? 0)
          }));
          
          // Añadir el valor actual si no está en el último entry o si es diferente
          const lastEntry = history[history.length - 1];
          const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
          const lastValue = lastEntry?.trainingMaxes?.[tm.id] ?? lastEntry?.rms[historyKey];
          
          // Si el último valor histórico es diferente al actual, o si no hay historial, añadir el valor actual
          if (tmHistory.length === 0 || lastValue !== tm.value || lastEntry?.date !== currentDate) {
            tmHistory.push({
              date: currentDate,
              value: tm.value
            });
          }
          
          const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
          
          return (
            <motion.div 
              key={tm.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card padding="md" rounded="xl" className="group hover:shadow-xl hover:shadow-slate-200/50">
                <div className="flex justify-between items-center mb-4">
                  <div className={cn("p-3 rounded-2xl", config.bg)}>
                    <Dumbbell size={20} className={config.text} />
                  </div>
                  <span className="text-2xl font-black text-slate-900">
                    {tm.value}
                    <span className="text-xs text-slate-400 ml-1">{unit}</span>
                  </span>
                </div>
                <h3 className="font-bold text-slate-800 mb-4">{tm.name}</h3>
                <div className="h-[100px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tmHistory.length > 0 ? tmHistory : [{ date: 'Inicio', value: tm.value }]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        itemStyle={{ color: config.color }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke={config.color} 
                        strokeWidth={3} 
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        {/* Joined Challenges Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Trophy size={20} className="text-amber-500" />
              Mis Torneos
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenSocial('challenges')} className="text-indigo-600 text-xs font-bold">
              Ver todos
            </Button>
          </div>
          
          <div className="space-y-4">
            {joinedChallenges.length === 0 ? (
              <Card padding="md" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                <p className="text-slate-400 text-sm font-medium">No te has unido a ningún torneo aún</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => onOpenSocial('challenges')}>Explorar</Button>
              </Card>
            ) : (
              joinedChallenges.map(challenge => {
                const myRank = challenge.participants.sort((a, b) => b.score - a.score).findIndex(p => p.userId === user.id) + 1;
                return (
                  <Card key={challenge.id} padding="md" rounded="2xl" className="hover:border-indigo-200 transition-colors cursor-pointer" onClick={() => onOpenSocial('challenges')}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900">{challenge.title}</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{challenge.exercise}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-xs font-black text-slate-400">Puesto</span>
                          <span className="text-lg font-black text-indigo-600">#{myRank}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">de {challenge.participants.length} atletas</p>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        {/* Today's Gym Check-ins */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Bell size={20} className="text-indigo-600" />
              ¿Quién entrena hoy?
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenSocial('checkins')} className="text-indigo-600 text-xs font-bold">
              Ver feed
            </Button>
          </div>

          <div className="space-y-4">
            {todayCheckIns.length === 0 ? (
              <Card padding="md" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                <p className="text-slate-400 text-sm font-medium">Nadie ha avisado hoy todavía</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => onOpenSocial('checkins')}>Avisar yo</Button>
              </Card>
            ) : (
              todayCheckIns.map(checkIn => (
                <div key={checkIn.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <img src={checkIn.avatar || `https://picsum.photos/seed/${checkIn.userId}/100/100`} className="w-10 h-10 rounded-full border border-slate-100" referrerPolicy="no-referrer" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{checkIn.userName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">{checkIn.gymName}</span>
                        <span className="text-[10px] font-medium text-slate-400">• {checkIn.time}</span>
                      </div>
                    </div>
                  </div>
                  {checkIn.userId === user.id ? (
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Tú</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-indigo-200 text-indigo-600"
                      onClick={() => setSelectedCheckIn(checkIn)}
                    >
                      <MapPin size={16} className="mr-1" />
                      Me uno
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {selectedCheckIn && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSelectedCheckIn(null)}
          />
          <Card padding="lg" rounded="2xl" className="relative w-full max-w-sm bg-white">
            <h3 className="text-lg font-black text-slate-900 mb-2">Vas a ir a la misma hora?</h3>
            <p className="text-sm text-slate-600 mb-4">
              Se enviará una notificación a {selectedCheckIn.userName} indicando que vas a
              las {selectedCheckIn.time} en {selectedCheckIn.gymName}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedCheckIn(null)}>
                No
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  onJoinFriendCheckIn(selectedCheckIn);
                  setSelectedCheckIn(null);
                }}
              >
                Si
              </Button>
            </div>
          </Card>
        </div>
      )}

    </motion.div>
  );
};

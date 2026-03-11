import React from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Camera, Weight, Moon, Sun, LogOut, ChevronRight } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { User } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface SettingsViewProps {
  user: User;
  onUpdateUser: (updates: Partial<User>) => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUpdateUser, onLogout }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl mx-auto px-4 py-8 pb-32 text-slate-900 dark:text-slate-100"
    >
      <header className="mb-10">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">Configuración</h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium">Personaliza tu perfil y preferencias</p>
      </header>

      <div className="space-y-8">
        {/* Profile Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <UserIcon className="text-white" size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Perfil</h2>
          </div>

          <Card padding="lg" rounded="2xl" className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative group">
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-xl"
                  referrerPolicy="no-referrer"
                />
                <button className="absolute inset-0 bg-black/40 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="text-white" size={24} />
                </button>
              </div>
              <div className="flex-1 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de Usuario</label>
                  <Input 
                    value={user.name} 
                    onChange={(e) => onUpdateUser({ name: e.target.value })}
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                  <Input 
                    value={user.email} 
                    disabled
                    className="bg-slate-50 text-slate-400 font-medium cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Physical Stats */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-600 p-2 rounded-xl">
              <Weight className="text-white" size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Datos Físicos</h2>
          </div>

          <Card padding="lg" rounded="2xl">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peso Corporal</label>
                <div className="flex items-baseline gap-2">
                  <input 
                    type="number"
                    value={user.bodyWeight}
                    onChange={(e) => onUpdateUser({ bodyWeight: parseFloat(e.target.value) || 0 })}
                    className="text-3xl font-black text-slate-900 dark:text-slate-100 bg-transparent w-24 focus:outline-none"
                  />
                  <span className="text-slate-400 font-bold uppercase text-sm">kg</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 max-w-[200px] text-right">
                Tu peso se utiliza para calcular tu fuerza relativa en los desafíos.
              </p>
            </div>
          </Card>
        </section>

        {/* Appearance */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-500 p-2 rounded-xl">
              <Sun className="text-white" size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Apariencia</h2>
          </div>

          <Card padding="md" rounded="2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  user.theme === 'dark' ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-600"
                )}>
                  {user.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">Modo {user.theme === 'dark' ? 'Oscuro' : 'Claro'}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Cambia el aspecto visual de la app</p>
                </div>
              </div>
              <button 
                onClick={() => onUpdateUser({ theme: user.theme === 'light' ? 'dark' : 'light' })}
                className={cn(
                  "w-14 h-8 rounded-full p-1 transition-colors relative",
                  user.theme === 'dark' ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                )}
              >
                <motion.div 
                  animate={{ x: user.theme === 'dark' ? 24 : 0 }}
                  className="w-6 h-6 bg-white rounded-full shadow-sm"
                />
              </button>
            </div>
          </Card>
        </section>

        {/* Danger Zone */}
        <section className="pt-8 border-t border-slate-100 dark:border-slate-700">
          <Button 
            variant="outline" 
            className="w-full py-6 rounded-2xl border-2 border-rose-100 text-rose-500 hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center gap-2"
            onClick={onLogout}
          >
            <LogOut size={20} />
            <span className="font-black uppercase tracking-widest text-xs">Cerrar Sesión</span>
          </Button>
        </section>
      </div>
    </motion.div>
  );
};

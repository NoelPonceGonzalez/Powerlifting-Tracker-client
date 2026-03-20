import React from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Camera, Image as ImageIcon, Weight, Moon, Sun, LogOut } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
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
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleAvatarFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 3 * 1024 * 1024) return; // max 3MB para fotos de móvil
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      // Recortar y redimensionar a cuadrado para que se vea bien en el avatar
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height, 400);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onUpdateUser({ avatar: dataUrl });
          return;
        }
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        const result = canvas.toDataURL('image/jpeg', 0.85);
        onUpdateUser({ avatar: result });
      };
      img.onerror = () => onUpdateUser({ avatar: dataUrl });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32 text-slate-900 dark:text-slate-100"
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
                <Avatar 
                  src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
                  name={user.name}
                  className="w-24 h-24 rounded-3xl border-4 border-white dark:border-slate-700 shadow-xl"
                />
              </div>
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Foto de perfil</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Elige de la galería o hazte una foto con la cámara</p>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => galleryInputRef.current?.click()}
                      className="rounded-xl"
                    >
                      <ImageIcon size={16} className="mr-1.5" />
                      Galería
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => cameraInputRef.current?.click()}
                      className="rounded-xl"
                    >
                      <Camera size={16} className="mr-1.5" />
                      Hacer foto
                    </Button>
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handleAvatarFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={(e) => {
                        handleAvatarFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>
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

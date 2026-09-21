import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Mail, Lock, User, ArrowLeft, Eye, EyeOff, Camera } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { AvatarCropModal } from '@/src/components/AvatarCropModal';
import { User as AppUser } from '@/src/types';
import { getApiBaseUrl, isLocalDevApiBase } from '@/src/lib/api';
import { downscaleForCrop } from '@/src/lib/avatarCrop';
import { SocialOnboarding } from '@/src/components/social/SocialOnboarding';

/** Mensaje de conexión: en local menciona puerto 3000; en AWS/producción no. */
function serverUnreachableHint(): string {
  return isLocalDevApiBase()
    ? 'Verifica que el servidor esté en marcha (en local, puerto 3000).'
    : 'Comprueba la conexión y que la URL del API sea la correcta (HTTPS en producción).';
}

/**
 * Traduce el fallo a algo que el usuario pueda entender y accionar. Antes se enseñaba el
 * mensaje crudo del servidor ("El servidor respondió con un formato inválido", rutas, JSON),
 * que no le dice nada a quien solo quiere entrar a entrenar.
 */
function friendlyAuthError(status: number, serverMessage?: string): string {
  const raw = (serverMessage || '').toLowerCase();

  // 503: la API está viva pero sin base de datos. Es temporal y se arregla solo.
  if (status === 502 || status === 503 || raw.includes('base de datos no está conectada')) {
    return 'Estamos reconectando con el servidor. Prueba otra vez en unos segundos.';
  }
  if (status === 429) return 'Demasiados intentos. Espera un minuto y vuelve a probarlo.';
  if (raw.includes('email no verificado')) {
    return 'Tu correo aún no está verificado. Crea la cuenta otra vez para recibir un código nuevo.';
  }
  if (raw.includes('cuenta incompleta')) {
    return 'Te faltó terminar el registro. Entra en «Crear cuenta» para completarlo.';
  }
  if (status === 401 || status === 400 || raw.includes('credenciales')) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (status >= 500) {
    return 'El servidor ha fallado. Inténtalo de nuevo en un momento.';
  }
  return 'No se ha podido iniciar sesión. Inténtalo de nuevo.';
}

/** Misma origen que la página (proxy Vite / rewrites). Evita pegar a localhost:3000 desde el móvil. */
function authApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    try {
      const o = window.location.origin;
      if (o && o !== 'null' && /^https?:/i.test(o)) {
        return `${o.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
      }
    } catch {
      /* ignore */
    }
  }
  const base = getApiBaseUrl();
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** El proxy Vite responde 502 si el API se está reiniciando; reintentamos un par de veces. */
async function fetchAuth(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timeout);
      if ((res.status === 502 || res.status === 503) && i < attempts - 1) {
        await sleep(650 * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      window.clearTimeout(timeout);
      lastError = err;
      if ((err as { name?: string })?.name === 'AbortError' || i === attempts - 1) throw err;
      await sleep(650 * (i + 1));
    }
  }
  throw lastError;
}

/** Fallos de red o de conexión, antes de que el servidor llegue a responder. */
function friendlyNetworkError(err: { name?: string; message?: string }): string {
  if (err?.name === 'AbortError') {
    return 'El servidor está tardando demasiado. Comprueba tu conexión e inténtalo otra vez.';
  }
  return `No hay conexión con el servidor. ${serverUnreachableHint()}`;
}

interface LoginProps {
  onLogin: (user: AppUser) => void;
  /** Añadir otra cuenta sin cerrar la sesión actual. */
  variant?: 'default' | 'addAccount';
  onCancel?: () => void;
}

export const LoginView: React.FC<LoginProps> = ({ onLogin, variant = 'default', onCancel }) => {
  const [mode, setMode] = useState<
    'login' | 'register' | 'complete' | 'follow' | 'forgot-email' | 'forgot-code' | 'forgot-password'
  >('login');
  const [sessionReady, setSessionReady] = useState<{ token: string; user: any } | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [registerStep, setRegisterStep] = useState<'email' | 'code'>('email');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [gender, setGender] = useState<'hombre' | 'mujer' | ''>('');
  const [completeToken, setCompleteToken] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [cropImage, setCropImage] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
  const completingRef = React.useRef(false);

  // Limpiar errores al montar el componente
  React.useEffect(() => {
    setError('');
  }, []);

  React.useEffect(() => {
    if (variant === 'addAccount') {
      setError('');
    }
  }, [variant]);

  const normalizeEmail = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return clean;
    return clean.includes('@') ? clean : `${clean}@gmail.com`;
  };

  const activateCompleteMode = (token: string) => {
    if (!token || token.trim().length < 6) return;
    setCompleteToken(token.trim());
    setMode('complete');
    setError('');
    if (typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'registration_token_consumed' }));
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('token') || params.get('registrationToken');
    if (fromQuery) activateCompleteMode(fromQuery);

    const fromNative = (window as any).__REGISTRATION_TOKEN__ as string | undefined;
    if (fromNative) activateCompleteMode(fromNative);

    const onTokenReady = () => {
      const token = (window as any).__REGISTRATION_TOKEN__ as string | undefined;
      if (token) activateCompleteMode(token);
    };

    window.addEventListener('registrationTokenReady', onTokenReady);
    return () => window.removeEventListener('registrationTokenReady', onTokenReady);
  }, []);

  const enterSession = (data: { token?: string; user?: any }) => {
    if (!data?.token || !data?.user) throw new Error('Respuesta de sesión incompleta');
    localStorage.setItem('auth_token', data.token);
    onLogin({
      id: String(data.user.id),
      name: data.user.name || 'Atleta',
      email: data.user.email,
      avatar: data.user.avatar || '',
      bodyWeight: data.user.bodyWeight ?? 80,
      gender: data.user.gender === 'mujer' || data.user.gender === 'hombre' ? data.user.gender : undefined,
      theme: (data.user.theme ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) as 'light' | 'dark',
      progressMode:
        data.user.progressMode === 'year'
          ? 'year'
          : data.user.progressMode === 'month' || data.user.progressMode === 'week'
            ? 'month'
            : undefined,
      mbMode: !!data.user.mbMode,
      workoutReminderOn: data.user.workoutReminderOn !== false,
      workoutReminderTime: data.user.workoutReminderTime || '10:00',
      timezone: data.user.timezone,
    });
  };

  const backToLogin = () => {
    setMode('login');
    setError('');
    setResetCode('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleForgotEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const normalized = normalizeEmail(email);
      if (!normalized || !normalized.includes('@')) {
        setError('Introduce un correo válido');
        setIsLoading(false);
        return;
      }
      setEmail(normalized);
      setResetEmail(normalized);
      const res = await fetchAuth(authApiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.errors?.[0]?.msg || 'No se pudo enviar el código');
      setMode('forgot-code');
    } catch (err: any) {
      setError(err?.message || friendlyNetworkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const code = resetCode.trim();
      if (!/^\d{6}$/.test(code)) {
        setError('El código tiene 6 dígitos');
        setIsLoading(false);
        return;
      }
      const res = await fetchAuth(authApiUrl('/api/auth/verify-reset-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail || normalizeEmail(email), code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.errors?.[0]?.msg || 'Código inválido o expirado');
      setMode('forgot-password');
    } catch (err: any) {
      setError(err?.message || friendlyNetworkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (!password || password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        setIsLoading(false);
        return;
      }
      const res = await fetchAuth(authApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail || normalizeEmail(email),
          code: resetCode.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || data?.errors?.[0]?.msg || 'No se pudo cambiar la contraseña');
      }
      enterSession(data);
    } catch (err: any) {
      setError(err?.message || friendlyNetworkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (!username.trim() || !password) {
        const errorMsg = 'Por favor ingresa tu usuario y contraseña';
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      const url = authApiUrl('/api/auth/login');
      const bodyData = { username: username.trim(), password };

      let res;
      try {
        res = await fetchAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData),
        });
      } catch (fetchError: any) {
        console.error('[CLIENT-LOGIN] Error en fetch:', fetchError);
        setError(friendlyNetworkError(fetchError));
        setIsLoading(false);
        return;
      }

      // Si no responde JSON, la petición no llegó al API (proxy, HTML de error, 502…).
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      }

      if (!res.ok || !data) {
        const serverMessage = data?.error || data?.message;
        console.error('[CLIENT-LOGIN] Login rechazado:', res.status, serverMessage);
        setError(friendlyAuthError(res.status, serverMessage));
        setIsLoading(false);
        return;
      }

      enterSession(data);
    } catch (err: any) {
      console.error('[CLIENT-LOGIN] Error completo:', err);
      setError(friendlyNetworkError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        const errorMsg = 'Por favor ingresa un email válido';
        setError(errorMsg);
        setIsLoading(false);
        return;
      }
      
      setEmail(normalizedEmail);
      
      const registerUrl = authApiUrl('/api/auth/register');
      console.log('[CLIENT-REGISTER] Enviando registro a:', registerUrl);
      
      let res;
      try {
        res = await fetchAuth(registerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail }),
        });
      } catch (fetchError: any) {
        console.error('[CLIENT-REGISTER] Error en fetch:', fetchError);
        if (fetchError.name === 'AbortError') {
          throw new Error('El servidor tardó demasiado en responder. Verifica que esté corriendo y accesible desde el emulador.');
        }
        throw fetchError;
      }
      
      // Verificar si la respuesta es JSON antes de parsear
      const contentType = res.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('[CLIENT-REGISTER] Error parseando JSON:', parseError);
          throw new Error('El servidor respondió con un formato inválido. Verifica que el servidor esté corriendo correctamente.');
        }
      } else {
        // Si no es JSON, puede ser HTML (página de error) o texto plano
        const textResponse = await res.text();
        console.error('[CLIENT-REGISTER] Respuesta no JSON recibida:', textResponse.substring(0, 200));
        throw new Error(`El servidor no respondió correctamente. ${serverUnreachableHint()}`);
      }
      
      if (!res.ok) {
        let errorMsg = data?.error || data?.message || 'No se pudo enviar el email de verificación';
        
        // NO filtrar mensajes de autenticación aquí, mostrar el mensaje real del servidor
        // Solo filtrar si realmente contiene "NOT AUTHENTICATED" explícitamente
        if (errorMsg.toLowerCase() === 'not authenticated' || 
            errorMsg.toLowerCase() === 'no autenticado') {
          errorMsg = 'Error de conexión con el servidor. Verifica que esté corriendo.';
        }
        
        // Mensajes específicos según el tipo de error
        if (res.status === 400) {
          if (errorMsg.toLowerCase().includes('ya está registrado')) {
            setUsername(normalizedEmail);
            setEmail(normalizedEmail);
            setMode('login');
            setError('Este email ya tiene cuenta. Entra o recupera la contraseña.');
            setIsLoading(false);
            return;
          } else if (errorMsg.includes('Email inválido') || errorMsg.includes('email inválido')) {
            setError('Email inválido');
          } else {
            setError(errorMsg);
          }
        } else if (res.status === 401 || res.status === 403) {
          // Esto no debería pasar en registro, pero si pasa, mostrar el mensaje real
          console.error('[CLIENT-REGISTER] Error 401/403 inesperado:', errorMsg);
          setError(errorMsg || 'Error de autenticación');
        } else if (res.status >= 500) {
          // Mostrar el mensaje específico del servidor
          console.error('[CLIENT-REGISTER] Error del servidor:', {
            status: res.status,
            error: errorMsg,
            data: data
          });
          
          if (errorMsg.includes('servidor de correo') || errorMsg.includes('email') || errorMsg.includes('correo')) {
            setError('Error al enviar email');
          } else if (errorMsg.includes('duplicate') || errorMsg.includes('ya está registrado')) {
            setError('Email ya registrado');
          } else {
            // Mostrar el mensaje completo del servidor
            setError(errorMsg || 'Error del servidor');
          }
        } else {
          setError(errorMsg);
        }
        
        setIsLoading(false);
        return;
      }

      // Sin SMTP el servidor no puede mandar el correo: pasa directo a completar
      // la cuenta con el token. Si no, el navegador se queda esperando un código.
      if (data?.emailSent === false && typeof data?.token === 'string' && data.token.trim()) {
        activateCompleteMode(data.token.trim());
        return;
      }

      setPendingVerificationEmail(normalizedEmail);
      setVerificationCode('');
      setRegisterStep('code');
    } catch (err: any) {
      console.error('[CLIENT-REGISTER] Error completo:', err);
      
      let errorMsg = 'Error de conexión';
      
      if (err.message) {
        errorMsg = err.message;
        // Filtrar mensajes de autenticación
        if (errorMsg.toLowerCase().includes('not authenticated') || 
            errorMsg.toLowerCase().includes('no autenticado')) {
          errorMsg = 'No se pudo conectar al servidor. Verifica que esté corriendo.';
        }
      } else if (err.name === 'TypeError' && err.message?.includes('fetch')) {
        errorMsg = `No se pudo conectar al servidor. Verifica que esté accesible en ${getApiBaseUrl()}`;
      } else if (err.name === 'NetworkError' || err.message?.includes('Failed to fetch')) {
        errorMsg = 'Error de red. Verifica tu conexión y que el servidor esté corriendo.';
      }
      
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const normalizedEmail = normalizeEmail(pendingVerificationEmail || email);
      const cleanCode = verificationCode.replace(/\D/g, '').slice(0, 6);
      if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Email inválido');
      if (cleanCode.length !== 6) throw new Error('Introduce un código de 6 dígitos');

      const res = await fetchAuth(authApiUrl('/api/auth/verify-registration-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, code: cleanCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.errors?.[0]?.msg || 'Código inválido o expirado');
      }

      activateCompleteMode(data?.token || cleanCode);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo verificar el código';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (completingRef.current) return;
    completingRef.current = true;
    setIsLoading(true);
    setError('');

    try {
      if (!completeToken) throw new Error('Token de registro no encontrado.');
      if (!name.trim() || name.trim().length < 2) throw new Error('El nombre debe tener al menos 2 caracteres.');
      const bw = Number(bodyWeight);
      if (!Number.isFinite(bw) || bw < 25 || bw > 400) throw new Error('Introduce un peso válido entre 25 y 400 kg.');
      if (!gender) throw new Error('Selecciona tu género.');
      if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.');

      const res = await fetch(authApiUrl('/api/auth/complete-registration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: completeToken,
          name: name.trim(),
          bodyWeight: bw,
          password,
          gender,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data?.error || data?.errors?.[0]?.msg || 'No se pudo completar el registro';
        if (String(errMsg).toLowerCase().includes('ya está registrado')) {
          setUsername(email);
          setMode('login');
          throw new Error('Este email ya tiene cuenta. Entra o recupera la contraseña.');
        }
        throw new Error(errMsg);
      }

      let savedAvatar = data.user.avatar || '';
      if (avatar) {
        try {
          const { uploadAvatarDataUrl } = await import('@/src/lib/avatar');
          savedAvatar = await uploadAvatarDataUrl(avatar);
        } catch {
          savedAvatar = data.user.avatar || '';
        }
      }
      const ready = { token: data.token, user: { ...data.user, avatar: savedAvatar } };
      localStorage.setItem('auth_token', ready.token);
      setSessionReady(ready);
      setMode('follow');
    } catch (err: any) {
      const msg = err?.message || 'Error al completar el registro';
      setError(msg);
    } finally {
      completingRef.current = false;
      setIsLoading(false);
    }
  };

  const isAddAccount = variant === 'addAccount';

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-y-auto bg-slate-50 px-3 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="my-4 w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40 sm:p-8"
      >
        {isAddAccount && onCancel && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:opacity-80"
            >
              <ArrowLeft size={18} />
              Volver a la app
            </button>
          </div>
        )}
        <div className="mb-6 text-center sm:mb-10">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex bg-indigo-600 dark:bg-indigo-500 p-4 rounded-3xl shadow-xl shadow-indigo-300/40 dark:shadow-indigo-500/20 dark:shadow-lg mb-6"
          >
            <Trophy className="text-white" size={32} />
          </motion.div>
          <motion.h1
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl"
          >
            {isAddAccount ? 'Otra cuenta' : 'Power'}
          </motion.h1>
          <motion.p
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-slate-500 dark:text-slate-400 font-medium"
          >
            {isAddAccount
              ? 'Inicia sesión o regístrate; la cuenta quedará guardada en este dispositivo.'
              : 'Tu gym, tu marca, tus amigos'}
          </motion.p>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card padding="xl" rounded="2xl" className="shadow-sm bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
            {mode !== 'complete' && mode !== 'follow' && !mode.startsWith('forgot') && (
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => { 
                    setMode('login'); 
                    setError(''); 
                    setEmail('');
                    setPassword('');
                    setUsername('');
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wider transition-colors ${mode === 'login' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => { 
                    setMode('register'); 
                    setRegisterStep('email');
                    setError(''); 
                    setEmail('');
                    setPassword('');
                    setUsername('');
                    setVerificationCode('');
                    setPendingVerificationEmail('');
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wider transition-colors ${mode === 'register' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  Crear cuenta
                </button>
              </div>
            )}

            {mode === 'follow' && sessionReady ? (
              <SocialOnboarding
                myId={String(sessionReady.user.id)}
                onDone={() => enterSession(sessionReady)}
              />
            ) : mode === 'login' ? (
              <form onSubmit={handleStandardLogin} className="space-y-5">
                <Input
                  label="Usuario o correo"
                  placeholder="juanperez o tu@email.com"
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  spellCheck={false}
                  icon={<User size={18} />}
                />
                <Input
                  label="Contraseña"
                  placeholder="••••••••"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  icon={<Lock size={18} />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="rounded-xl p-2 text-slate-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                />
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Entrando…' : 'Entrar'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot-email');
                    setError('');
                    setResetCode('');
                    setPassword('');
                    setConfirmPassword('');
                    if (username.includes('@')) setEmail(username);
                  }}
                  className="w-full text-center text-sm font-semibold text-indigo-600 hover:opacity-80 dark:text-indigo-400"
                >
                  ¿Has olvidado tu contraseña?
                </button>
              </form>
            ) : mode === 'forgot-email' ? (
              <form onSubmit={handleForgotEmail} className="space-y-5">
                <button type="button" onClick={backToLogin} className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  <ArrowLeft size={16} />
                  Volver a entrar
                </button>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Escribe el correo de tu cuenta. Te enviaremos un código de 6 dígitos.
                </p>
                <Input
                  label="Correo"
                  placeholder="tu@email.com"
                  type="text"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmail((prev) => normalizeEmail(prev))}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  icon={<Mail size={18} />}
                />
                {error && (
                  <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Enviando…' : 'Enviar código'}
                </Button>
              </form>
            ) : mode === 'forgot-code' ? (
              <form onSubmit={handleForgotCode} className="space-y-5">
                <button type="button" onClick={() => { setMode('forgot-email'); setError(''); }} className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  <ArrowLeft size={16} />
                  Cambiar correo
                </button>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Revisa el correo e introduce el código de 6 dígitos.
                </p>
                <Input
                  label="Correo"
                  type="text"
                  value={resetEmail || email}
                  readOnly
                  className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  icon={<Mail size={18} />}
                />
                <Input
                  label="Código"
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  required
                  autoFocus
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  icon={<Lock size={18} />}
                />
                {error && (
                  <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Comprobando…' : 'Continuar'}
                </Button>
              </form>
            ) : mode === 'forgot-password' ? (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <button type="button" onClick={() => { setMode('forgot-code'); setError(''); }} className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  <ArrowLeft size={16} />
                  Volver al código
                </button>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Elige una contraseña nueva. Entrarás automáticamente.
                </p>
                <Input
                  label="Nueva contraseña"
                  placeholder="••••••••"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  icon={<Lock size={18} />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="rounded-xl p-2 text-slate-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                />
                <Input
                  label="Repite la contraseña"
                  placeholder="••••••••"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  icon={<Lock size={18} />}
                />
                {error && (
                  <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Guardando…' : 'Cambiar e entrar'}
                </Button>
              </form>
            ) : mode === 'register' ? (
              registerStep === 'email' ? (
                <form onSubmit={handleRegisterByEmail} className="space-y-5">
                  <Input
                    label="Correo Electrónico"
                    placeholder="tu@email.com"
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmail((prev) => normalizeEmail(prev))}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    icon={<Mail size={18} />}
                  />
                  {error && <p className="text-xs font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider">{error}</p>}
                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? 'Enviando código...' : 'Enviar código'}
                  </Button>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                    Te enviaremos un código de 6 dígitos para verificar tu correo.
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                    Si escribes el correo sin @, se completará automáticamente con @gmail.com.
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-5">
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    Revisa tu correo e introduce el código
                  </p>
                  <Input
                    label="Correo"
                    type="text"
                    value={pendingVerificationEmail}
                    readOnly
                    className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    icon={<Mail size={18} />}
                  />
                  <Input
                    label="Código (6 dígitos)"
                    placeholder="123456"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {error && <p className="text-xs font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider">{error}</p>}
                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? 'Verificando...' : 'Verificar código'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setRegisterStep('email');
                      setVerificationCode('');
                      setError('');
                    }}
                    className="w-full text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors py-2"
                  >
                    Cambiar correo
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleCompleteRegistration} className="space-y-5">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Completa tu cuenta
                </p>
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="relative"
                    aria-label="Añadir foto de perfil"
                  >
                    <Avatar
                      src={avatar}
                      name={name || 'Tú'}
                      className="h-24 w-24 rounded-full border-2 border-slate-200 dark:border-slate-700"
                    />
                    <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow">
                      <Camera size={14} />
                    </span>
                  </button>
                  <p className="text-[11px] font-semibold text-slate-400">Foto de perfil (opcional)</p>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif"
                    className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !file.type.startsWith('image/')) return;
                      try {
                        setCropImage(await downscaleForCrop(file));
                      } catch {
                        setError('No se ha podido abrir esa foto.');
                      }
                    }}
                  />
                </div>
                <Input
                  label="Nombre"
                  placeholder="Tu nombre"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  icon={<User size={18} />}
                />
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                    Género
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGender('hombre')}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold ${gender === 'hombre' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                    >
                      Hombre
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('mujer')}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold ${gender === 'mujer' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                    >
                      Mujer
                    </button>
                  </div>
                </div>
                <Input
                  label="Peso corporal (kg)"
                  placeholder="Ej: 80"
                  type="number"
                  required
                  value={bodyWeight}
                  onChange={(e) => setBodyWeight(e.target.value)}
                />
                <Input
                  label="Contraseña"
                  placeholder="Mínimo 6 caracteres"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={18} />}
                />
                <Input
                  label="Confirmar contraseña"
                  placeholder="Repite tu contraseña"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  icon={<Lock size={18} />}
                />
                {error && <p className="text-xs font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Creando cuenta...' : 'Completar registro'}
                </Button>
              </form>
            )}
          </Card>
        </motion.div>
      </motion.div>
      <AvatarCropModal
        image={cropImage}
        onCancel={() => setCropImage(null)}
        onConfirm={(dataUrl) => {
          setAvatar(dataUrl);
          setCropImage(null);
        }}
      />
    </div>
  );
};

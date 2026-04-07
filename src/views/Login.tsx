import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Mail, Lock, User, ArrowLeft } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Card } from '@/src/components/ui/Card';
import { User as AppUser } from '@/src/types';
import { getApiBaseUrl, isLocalDevApiBase } from '@/src/lib/api';

/** Mensaje de conexión: en local menciona puerto 3000; en AWS/producción no. */
function serverUnreachableHint(): string {
  return isLocalDevApiBase()
    ? 'Verifica que el servidor esté en marcha (en local, puerto 3000).'
    : 'Comprueba la conexión y que la URL del API sea la correcta (HTTPS en producción).';
}

interface LoginProps {
  onLogin: (user: AppUser) => void;
  /** Añadir otra cuenta sin cerrar la sesión actual. */
  variant?: 'default' | 'addAccount';
  onCancel?: () => void;
}

export const LoginView: React.FC<LoginProps> = ({ onLogin, variant = 'default', onCancel }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'complete'>('login');
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

      // Usar la URL del servidor configurada en src/config.ts
      const baseUrl = getApiBaseUrl();
      const healthUrl = `${baseUrl}/health`;
      
      console.log('[CLIENT-LOGIN] Usando baseUrl:', baseUrl);
      console.log('[CLIENT-LOGIN] Health URL:', healthUrl);
      
      const healthController = new AbortController();
      const healthTimeout = setTimeout(() => healthController.abort(), 5000); // Aumentado a 5 segundos
      
      try {
        const healthCheck = await fetch(healthUrl, { 
          method: 'GET',
          signal: healthController.signal,
          headers: {
            'Accept': 'application/json'
          }
        });
        clearTimeout(healthTimeout);
        
        console.log('[CLIENT-LOGIN] Health check response status:', healthCheck.status);
        console.log('[CLIENT-LOGIN] Health check response headers:', Object.fromEntries(healthCheck.headers.entries()));
        
        if (!healthCheck.ok) {
          const errorText = await healthCheck.text();
          console.error('[CLIENT-LOGIN] Health check falló:', {
            status: healthCheck.status,
            statusText: healthCheck.statusText,
            body: errorText.substring(0, 200)
          });
          throw new Error(`Servidor respondió con status ${healthCheck.status}: ${errorText.substring(0, 100)}`);
        }
        
        const healthData = await healthCheck.json();
        console.log('[CLIENT-LOGIN] Health check exitoso:', healthData);
      } catch (healthError: any) {
        clearTimeout(healthTimeout);
        console.error('[CLIENT-LOGIN] Error en health check:', healthError);
        
        let errorMsg = 'No se pudo conectar al servidor. ';
        if (healthError.name === 'AbortError') {
          errorMsg += `El servidor tardó demasiado en responder. Verifica que esté accesible en ${baseUrl}`;
        } else if (healthError.message?.includes('Failed to fetch') || healthError.message?.includes('NetworkError')) {
          errorMsg += `Error de red. Verifica que el servidor esté accesible en ${baseUrl}`;
        } else {
          errorMsg += healthError.message || serverUnreachableHint();
        }
        
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      const url = `${baseUrl}/api/auth/login`;
      const bodyData = { username: username.trim(), password };
      
      console.log('[CLIENT-LOGIN] Enviando login a:', url);
      
      const loginController = new AbortController();
      const loginTimeout = setTimeout(() => loginController.abort(), 15000); // Aumentado a 15 segundos
      
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData),
          signal: loginController.signal
        });
        clearTimeout(loginTimeout);
      } catch (fetchError: any) {
        clearTimeout(loginTimeout);
        console.error('[CLIENT-LOGIN] Error en fetch:', fetchError);
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
          console.error('[CLIENT-LOGIN] Error parseando JSON:', parseError);
          throw new Error('El servidor respondió con un formato inválido. Verifica que el servidor esté corriendo correctamente.');
        }
      } else {
        // Si no es JSON, puede ser HTML (página de error) o texto plano
        const textResponse = await res.text();
        console.error('[CLIENT-LOGIN] Respuesta no JSON recibida:', textResponse.substring(0, 200));
        throw new Error(`El servidor no respondió correctamente. ${serverUnreachableHint()}`);
      }
      
      if (!res.ok) {
        let errorMsg = data?.error || data?.message || 'No se pudo iniciar sesión';
        
        // Filtrar mensajes de autenticación genéricos
        if (errorMsg.toLowerCase().includes('not authenticated') || 
            errorMsg.toLowerCase().includes('no autenticado') ||
            (errorMsg.toLowerCase().includes('token') && !errorMsg.toLowerCase().includes('inválido'))) {
          errorMsg = 'Credenciales inválidas. Verifica tu usuario y contraseña.';
        }
        
        // Mensajes específicos según el tipo de error
        if (res.status === 400) {
          setError(errorMsg || 'Datos inválidos');
        } else if (res.status === 401) {
          if (errorMsg.includes('Email no verificado')) {
            setError('Email no verificado');
          } else if (errorMsg.includes('Credenciales inválidas')) {
            setError('Credenciales inválidas');
          } else if (errorMsg.includes('Cuenta incompleta')) {
            setError('Cuenta incompleta');
          } else {
            setError(errorMsg);
          }
        } else if (res.status >= 500) {
          // Mostrar mensaje de error específico si está disponible
          const specificError = data?.error || 'Error del servidor';
          const errorDetails = data?.details || '';
          const errorType = data?.type || '';
          
          let displayMessage = specificError;
          if (errorDetails && errorDetails !== specificError) {
            displayMessage = `${specificError}: ${errorDetails}`;
          }
          
          console.error('[CLIENT-LOGIN] Error del servidor:', {
            status: res.status,
            error: specificError,
            details: errorDetails,
            type: errorType
          });
          
          setError(displayMessage);
        } else {
          setError(errorMsg);
        }
        
        setIsLoading(false);
        return;
      }

      // Éxito
      localStorage.setItem('auth_token', data.token);
      onLogin({
        id: String(data.user.id),
        name: data.user.name || 'Atleta',
        email: data.user.email,
        avatar: data.user.avatar || 'https://picsum.photos/seed/user/200/200',
        bodyWeight: data.user.bodyWeight ?? 80,
        theme: (data.user.theme ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) as 'light' | 'dark',
        progressMode:
          data.user.progressMode === 'year'
            ? 'year'
            : data.user.progressMode === 'month' || data.user.progressMode === 'week'
              ? 'month'
              : undefined,
        mbMode: !!data.user.mbMode,
      });
    } catch (err: any) {
      console.error('[CLIENT-LOGIN] Error completo:', err);
      
      let errorMsg = 'Error al iniciar sesión';
      
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        errorMsg = 'El servidor tardó demasiado en responder. Verifica que esté corriendo y accesible.';
      } else if (err.message) {
        errorMsg = err.message;
        // Filtrar mensajes de autenticación
        if (errorMsg.toLowerCase().includes('not authenticated') || 
            errorMsg.toLowerCase().includes('no autenticado')) {
          errorMsg = `No se pudo conectar al servidor. ${serverUnreachableHint()}`;
        }
      } else if (err.name === 'TypeError' && (err.message?.includes('fetch') || err.message?.includes('Failed to fetch'))) {
        errorMsg = `No se pudo conectar al servidor. ${serverUnreachableHint()}`;
      } else if (err.name === 'NetworkError' || err.message?.includes('Failed to fetch')) {
        errorMsg = 'Error de red. Verifica tu conexión y que el servidor esté corriendo.';
      }
      
      setError(errorMsg);
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
      
      // Usar la URL del servidor configurada en src/config.ts
      const baseUrl = getApiBaseUrl();
      const healthUrl = `${baseUrl}/health`;
      
      console.log('[CLIENT-REGISTER] Usando baseUrl:', baseUrl);
      console.log('[CLIENT-REGISTER] Health URL:', healthUrl);
      
      const healthController = new AbortController();
      const healthTimeout = setTimeout(() => healthController.abort(), 5000); // Aumentado a 5 segundos
      
      try {
        const healthCheck = await fetch(healthUrl, { 
          method: 'GET',
          signal: healthController.signal,
          headers: {
            'Accept': 'application/json'
          }
        });
        clearTimeout(healthTimeout);
        
        console.log('[CLIENT-REGISTER] Health check response status:', healthCheck.status);
        console.log('[CLIENT-REGISTER] Health check response headers:', Object.fromEntries(healthCheck.headers.entries()));
        
        if (!healthCheck.ok) {
          const errorText = await healthCheck.text();
          console.error('[CLIENT-REGISTER] Health check falló:', {
            status: healthCheck.status,
            statusText: healthCheck.statusText,
            body: errorText.substring(0, 200)
          });
          throw new Error(`Servidor respondió con status ${healthCheck.status}: ${errorText.substring(0, 100)}`);
        }
        
        const healthData = await healthCheck.json();
        console.log('[CLIENT-REGISTER] Health check exitoso:', healthData);
      } catch (healthError: any) {
        clearTimeout(healthTimeout);
        console.error('[CLIENT-REGISTER] Error en health check:', healthError);
        
        let errorMsg = 'No se pudo conectar al servidor. ';
        if (healthError.name === 'AbortError') {
          errorMsg += `El servidor tardó demasiado en responder. Verifica que esté accesible en ${baseUrl}`;
        } else if (healthError.message?.includes('Failed to fetch') || healthError.message?.includes('NetworkError')) {
          errorMsg += `Error de red. Verifica que el servidor esté accesible en ${baseUrl}`;
        } else {
          errorMsg += healthError.message || serverUnreachableHint();
        }
        
        setError(errorMsg);
        setIsLoading(false);
        return;
      }
      
      // Usar la URL completa para la petición de registro
      const registerUrl = `${baseUrl}/api/auth/register`;
      console.log('[CLIENT-REGISTER] Enviando registro a:', registerUrl);
      
      const registerController = new AbortController();
      const registerTimeout = setTimeout(() => registerController.abort(), 15000); // Aumentado a 15 segundos
      
      let res;
      try {
        res = await fetch(registerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail }),
          signal: registerController.signal
        });
        clearTimeout(registerTimeout);
      } catch (fetchError: any) {
        clearTimeout(registerTimeout);
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
          if (errorMsg.includes('ya está registrado')) {
            setError('Este email ya está registrado');
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

      // Éxito
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

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/verify-registration-code`, {
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

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/complete-registration`, {
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
        throw new Error(data?.error || data?.errors?.[0]?.msg || 'No se pudo completar el registro');
      }

      localStorage.setItem('auth_token', data.token);
      onLogin({
        id: String(data.user.id),
        name: data.user.name || 'Atleta',
        email: data.user.email,
        avatar: data.user.avatar || 'https://picsum.photos/seed/user/200/200',
        bodyWeight: data.user.bodyWeight ?? bw,
        theme: (data.user.theme ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) as 'light' | 'dark',
        progressMode:
          data.user.progressMode === 'year'
            ? 'year'
            : data.user.progressMode === 'month' || data.user.progressMode === 'week'
              ? 'month'
              : undefined,
        mbMode: !!data.user.mbMode,
      });
    } catch (err: any) {
      const msg = err?.message || 'Error al completar el registro';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const isAddAccount = variant === 'addAccount';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md backdrop-blur-2xl bg-white/70 dark:bg-slate-950/85 rounded-3xl p-8 border border-white/40 dark:border-slate-800/50 shadow-2xl dark:shadow-black/40"
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
        <div className="text-center mb-10">
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
            className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2"
          >
            {isAddAccount ? 'Otra cuenta' : 'Tracker'}
          </motion.h1>
          <motion.p
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-slate-500 dark:text-slate-400 font-medium"
          >
            {isAddAccount
              ? 'Inicia sesión o regístrate; la cuenta quedará guardada en este dispositivo.'
              : 'Entrena como un profesional'}
          </motion.p>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card padding="xl" rounded="2xl" className="shadow-xl shadow-slate-200/50 dark:shadow-xl dark:shadow-black/50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border border-white/60 dark:border-slate-800/60">
            {mode !== 'complete' && (
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
                  Login
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
                  Register
                </button>
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleStandardLogin} className="space-y-5">
                <Input
                  label="Usuario o correo"
                  placeholder="juanperez o tu@email.com"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  icon={<User size={18} />}
                />
                <Input
                  label="Contraseña"
                  placeholder="••••••••"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={18} />}
                />
                {error && <p className="text-xs font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
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
                  Completa tu registro en la app
                </p>
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
    </div>
  );
};

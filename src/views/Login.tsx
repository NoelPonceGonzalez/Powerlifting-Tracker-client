import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Mail, Lock, User } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Card } from '@/src/components/ui/Card';
import { User as AppUser } from '@/src/types';
import { useToast } from '@/src/hooks/useToast';

interface LoginProps {
  onLogin: (user: AppUser) => void;
  toast: ReturnType<typeof useToast>;
}

export const LoginView: React.FC<LoginProps> = ({ onLogin, toast }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Limpiar errores al montar el componente
  React.useEffect(() => {
    setError('');
  }, []);

  const normalizeEmail = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return clean;
    return clean.includes('@') ? clean : `${clean}@gmail.com`;
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (!username.trim() || !password) {
        const errorMsg = 'Por favor ingresa tu usuario y contraseña';
        toast.error(errorMsg);
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      // Para emulador Android, SIEMPRE usar 10.0.2.2:3000
      // No usar window.location.origin porque puede causar problemas en WebView
      const baseUrl = 'http://10.0.2.2:3000';
      const healthUrl = `${baseUrl}/health`;
      
      console.log('[CLIENT-LOGIN] Usando baseUrl fijo para Android emulador:', baseUrl);
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
          errorMsg += 'El servidor tardó demasiado en responder. Verifica que esté corriendo en el puerto 3000 y accesible desde el emulador (usa 10.0.2.2:3000 para Android).';
        } else if (healthError.message?.includes('Failed to fetch') || healthError.message?.includes('NetworkError')) {
          errorMsg += 'Error de red. Verifica que el servidor esté corriendo y que el emulador pueda acceder a 10.0.2.2:3000.';
        } else {
          errorMsg += healthError.message || 'Verifica que esté corriendo en el puerto 3000.';
        }
        
        toast.error(errorMsg);
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
        throw new Error('El servidor no respondió correctamente. Verifica que esté corriendo en el puerto 3000.');
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
          toast.error(errorMsg || 'Datos inválidos. Verifica tus credenciales.');
          setError(errorMsg || 'Datos inválidos');
        } else if (res.status === 401) {
          if (errorMsg.includes('Email no verificado')) {
            toast.error('Email no verificado. Revisa tu bandeja o usa "Register" para reenviar enlace.');
            setError('Email no verificado');
          } else if (errorMsg.includes('Credenciales inválidas')) {
            toast.error('Credenciales inválidas. Prueba con usuario, correo o nombre.');
            setError('Credenciales inválidas');
          } else if (errorMsg.includes('Cuenta incompleta')) {
            toast.error('Cuenta incompleta. Termina el registro desde el enlace de correo.');
            setError('Cuenta incompleta');
          } else {
            toast.error(errorMsg);
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
          
          toast.error(displayMessage);
          setError(displayMessage);
        } else {
          toast.error(errorMsg);
          setError(errorMsg);
        }
        
        setIsLoading(false);
        return;
      }

      // Éxito
      localStorage.setItem('auth_token', data.token);
      toast.success('¡Login exitoso!');
      onLogin({
        id: String(data.user.id),
        name: data.user.name || 'Atleta',
        email: data.user.email,
        avatar: data.user.avatar || 'https://picsum.photos/seed/user/200/200',
        bodyWeight: data.user.bodyWeight ?? 80,
        theme: data.user.theme ?? 'light',
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
          errorMsg = 'No se pudo conectar al servidor. Verifica que esté corriendo en el puerto 3000.';
        }
      } else if (err.name === 'TypeError' && (err.message?.includes('fetch') || err.message?.includes('Failed to fetch'))) {
        errorMsg = 'No se pudo conectar al servidor. Verifica que esté corriendo en el puerto 3000.';
      } else if (err.name === 'NetworkError' || err.message?.includes('Failed to fetch')) {
        errorMsg = 'Error de red. Verifica tu conexión y que el servidor esté corriendo.';
      }
      
      toast.error(errorMsg);
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
        toast.error(errorMsg);
        setError(errorMsg);
        setIsLoading(false);
        return;
      }
      
      setEmail(normalizedEmail);
      
      // Para emulador Android, SIEMPRE usar 10.0.2.2:3000
      // No usar window.location.origin porque puede causar problemas en WebView
      const baseUrl = 'http://10.0.2.2:3000';
      const healthUrl = `${baseUrl}/health`;
      
      console.log('[CLIENT-REGISTER] Usando baseUrl fijo para Android emulador:', baseUrl);
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
          errorMsg += 'El servidor tardó demasiado en responder. Verifica que esté corriendo en el puerto 3000 y accesible desde el emulador (usa 10.0.2.2:3000 para Android).';
        } else if (healthError.message?.includes('Failed to fetch') || healthError.message?.includes('NetworkError')) {
          errorMsg += 'Error de red. Verifica que el servidor esté corriendo y que el emulador pueda acceder a 10.0.2.2:3000.';
        } else {
          errorMsg += healthError.message || 'Verifica que esté corriendo en el puerto 3000.';
        }
        
        toast.error(errorMsg);
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
        throw new Error('El servidor no respondió correctamente. Verifica que esté corriendo en el puerto 3000.');
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
            toast.error('Este email ya está registrado. Si no recuerdas tu contraseña, intenta hacer login.');
            setError('Este email ya está registrado');
          } else if (errorMsg.includes('Email inválido') || errorMsg.includes('email inválido')) {
            toast.error('Por favor ingresa un email válido.');
            setError('Email inválido');
          } else {
            toast.error(errorMsg);
            setError(errorMsg);
          }
        } else if (res.status === 401 || res.status === 403) {
          // Esto no debería pasar en registro, pero si pasa, mostrar el mensaje real
          console.error('[CLIENT-REGISTER] Error 401/403 inesperado:', errorMsg);
          toast.error(errorMsg || 'Error de autenticación inesperado. Por favor intenta de nuevo.');
          setError(errorMsg || 'Error de autenticación');
        } else if (res.status >= 500) {
          // Mostrar el mensaje específico del servidor
          console.error('[CLIENT-REGISTER] Error del servidor:', {
            status: res.status,
            error: errorMsg,
            data: data
          });
          
          if (errorMsg.includes('servidor de correo') || errorMsg.includes('email') || errorMsg.includes('correo')) {
            toast.error('Error al enviar el email de verificación. El usuario fue creado pero no se pudo enviar el email. Contacta al administrador.');
            setError('Error al enviar email');
          } else if (errorMsg.includes('duplicate') || errorMsg.includes('ya está registrado')) {
            toast.error('Este email ya está registrado. Intenta hacer login.');
            setError('Email ya registrado');
          } else {
            // Mostrar el mensaje completo del servidor
            toast.error(errorMsg || 'Error del servidor. Revisa la consola para más detalles.');
            setError(errorMsg || 'Error del servidor');
          }
        } else {
          toast.error(errorMsg);
          setError(errorMsg);
        }
        
        setIsLoading(false);
        return;
      }

      // Éxito
      toast.success('Te enviamos un enlace de verificación por correo. Revisa tu bandeja y spam.');
      setEmail('');
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
        errorMsg = 'No se pudo conectar al servidor. Verifica que esté corriendo en http://localhost:3000';
      } else if (err.name === 'NetworkError' || err.message?.includes('Failed to fetch')) {
        errorMsg = 'Error de red. Verifica tu conexión y que el servidor esté corriendo.';
      }
      
      toast.error(errorMsg);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex bg-indigo-600 p-4 rounded-3xl shadow-2xl shadow-indigo-200 mb-6"
          >
            <Trophy className="text-white" size={32} />
          </motion.div>
          <motion.h1
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-black tracking-tight text-slate-900 mb-2"
          >
            Powerlifting Tracker
          </motion.h1>
          <motion.p
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-slate-500 font-medium"
          >
            Entrena como un profesional
          </motion.p>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card padding="xl" rounded="2xl" className="shadow-2xl shadow-slate-200/50">
            <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => { 
                  setMode('login'); 
                  setError(''); 
                  setEmail('');
                  setPassword('');
                  setUsername('');
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wider ${mode === 'login' ? 'bg-white text-indigo-600' : 'text-slate-500'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => { 
                  setMode('register'); 
                  setError(''); 
                  setEmail('');
                  setPassword('');
                  setUsername('');
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-wider ${mode === 'register' ? 'bg-white text-indigo-600' : 'text-slate-500'}`}
              >
                Register
              </button>
            </div>

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
                {error && <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </Button>
              </form>
            ) : (
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
                {error && <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Enviando enlace...' : 'Enviar enlace de registro'}
                </Button>
                <p className="text-[11px] text-slate-500 font-semibold">
                  Completarás nombre, género y contraseña desde el enlace del correo.
                </p>
                <p className="text-[11px] text-slate-400 font-semibold">
                  Si escribes el correo sin @, se completará automáticamente con @gmail.com.
                </p>
              </form>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

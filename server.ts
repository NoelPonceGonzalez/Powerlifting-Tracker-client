import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { connectDB } from '../server/src/config/database';
import authRoutes from '../server/src/routes/auth';
import routinesRoutes from '../server/src/routes/routines';
import trainingMaxesRoutes from '../server/src/routes/trainingMaxes';
import socialRoutes from '../server/src/routes/social';
import checkinsRoutes from '../server/src/routes/checkins';
import notificationsRoutes from '../server/src/routes/notifications';
import challengesRoutes from '../server/src/routes/challenges';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS headers para permitir conexiones desde WebView móvil (PRIMERO)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());
  
  // --- MongoDB + API routes ---
  await connectDB();
  
  // ============================================
  // IMPORTANTE: Todas las rutas de API DEBEN estar ANTES de Vite
  // Express procesa los middlewares en orden, así que las rutas específicas
  // (app.get, app.post, app.use con path específico) tienen prioridad
  // ============================================
  
  // Health check endpoint - PRIMERO, antes de cualquier otro middleware
  app.get('/health', (req, res) => {
    const clientIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
    console.log('\n[HEALTH] ✅ Health check recibido');
    console.log('[HEALTH] Desde IP:', clientIp);
    console.log('[HEALTH] Path:', req.path);
    console.log('[HEALTH] Method:', req.method);
    console.log('[HEALTH] URL:', req.url);
    console.log('[HEALTH] Host:', req.get('host'));
    return res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      server: 'Powerlifting Tracker API',
      version: '1.0.0',
      clientIp: clientIp
    });
  });
  
  // Endpoint de prueba simple (solo texto)
  app.get('/ping', (req, res) => {
    console.log('[PING] ✅ Ping recibido');
    res.send('pong');
  });
  
  // Registrar TODAS las rutas de API ANTES de Vite
  app.use('/api/auth', authRoutes);
  app.use('/api/routines', routinesRoutes);
  app.use('/api/training-maxes', trainingMaxesRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/checkins', checkinsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/challenges', challengesRoutes);
  
  console.log('\n✅ Rutas de API registradas:');
  console.log('   GET  /health');
  console.log('   GET  /ping');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/auth/login');
  console.log('   ... y otras rutas de API\n');
  
  // Middleware de logging para TODAS las peticiones (después de registrar rutas)
  app.use((req, res, next) => {
    console.log(`\n🔵 [REQUEST] ${req.method} ${req.path} - ${new Date().toISOString()}`);
    console.log(`🔵 [REQUEST] IP: ${req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown'}`);
    if (req.path !== '/health' && req.path !== '/ping') {
      if (req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
        console.log(`🔵 [REQUEST] Body:`, JSON.stringify(sanitizedBody, null, 2));
      }
    }
    next();
  });

  // --- Vite Middleware ---
  // IMPORTANTE: Vite debe ir DESPUÉS de todas las rutas de API
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: {
          port: 5173,
          host: '0.0.0.0',
        },
      },
      appType: 'spa',
    });
    
    // Middleware de Vite - solo para rutas que NO son API
    // IMPORTANTE: Express procesa los middlewares en orden secuencial
    // Si una ruta ya fue manejada arriba (con app.get o app.use con path específico),
    // Express NO continúa al siguiente middleware. Así que si llegamos aquí con
    // una ruta de API, significa que NO fue manejada arriba (error de configuración)
    app.use((req, res, next) => {
      // Si es una ruta de API o health check, NO usar Vite
      // Estas rutas deberían haber sido manejadas arriba
      if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/ping') {
        // Si llegamos aquí, la ruta NO fue manejada arriba (error de configuración)
        console.error(`[VITE] ❌ ERROR CRÍTICO: Ruta ${req.method} ${req.path} llegó a Vite sin ser manejada`);
        console.error(`[VITE] Esto significa que las rutas de API NO están registradas correctamente`);
        console.error(`[VITE] Verifica el orden de los middlewares en server.ts`);
        return res.status(404).json({ 
          error: 'Ruta no encontrada',
          path: req.path,
          method: req.method,
          message: 'Esta ruta debería haber sido manejada por los endpoints de API pero llegó a Vite'
        });
      }
      // Para todas las demás rutas (SPA frontend), usar Vite
      vite.middlewares(req, res, next);
    });
    
    console.log('✅ Vite middleware configurado (solo para rutas SPA, después de API)');
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   http://0.0.0.0:${PORT}`);
    console.log(`\n📱 Para móvil:`);
    console.log(`   Android emulador: http://10.0.2.2:${PORT}`);
    console.log(`   iOS simulator: http://localhost:${PORT}`);
    console.log(`   Dispositivo físico: http://[TU_IP_LOCAL]:${PORT}`);
    console.log(`\n🔍 Endpoints disponibles:`);
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log(`   GET  http://localhost:${PORT}/ping`);
    console.log(`   POST http://localhost:${PORT}/api/auth/register`);
    console.log(`   POST http://localhost:${PORT}/api/auth/login`);
    console.log(`\n⏳ Esperando conexiones...\n`);
    
    // Verificar que el servidor está escuchando
    const address = server.address();
    if (address && typeof address === 'object') {
      console.log(`✅ Servidor escuchando en ${address.address}:${address.port}`);
      console.log(`✅ Puedes probar: curl http://localhost:${PORT}/health`);
    }
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error: El puerto ${PORT} ya está en uso.`);
      console.error(`   Cierra otros procesos o cambia el puerto.\n`);
    } else {
      console.error(`\n❌ Error al iniciar servidor:`, err);
    }
    process.exit(1);
  });
}

startServer();

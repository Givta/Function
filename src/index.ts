import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import './config/firebase'; // Initialize Firebase
import { WhatsAppService } from './services/whatsapp/WhatsAppService';

// Initialize Express app   
const app = express();

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// CORS
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS?.split(',') || [])
    : [
        'http://localhost:3000',
        'https://localhost:3000',
        'http://localhost:19006',
        'https://localhost:19006',
        // Local network IPs for mobile development
        'http://192.168.206.2:3000',
        'http://192.168.206.2:19006',
        'https://192.168.206.2:3000',
        'https://192.168.206.2:19006',
        'exp://192.168.206.2:*',
        // Expo development IPs
        'http://10.119.84.69:3000',
        'http://10.119.84.69:19006',
        'https://10.119.84.69:3000',
        'https://10.119.84.69:19006',
        'exp://10.119.84.69:*',
        // Allow all origins in development for easier testing
        true
      ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
console.log('Loading routes...');
app.use('/api', routes);
console.log('Routes loaded successfully');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Givta Backend is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Test API route
app.get('/api/test', (req, res) => {
  console.log('API test route called');
  res.json({ success: true, message: 'API is working' });
});

// Test route
app.get('/test', (req, res) => {
  res.json({ success: true, message: 'Server is working' });
});

// Global error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Givta Backend Server running on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
  console.log(`🌐 Server accessible from all network interfaces`);
  console.log(`💚 Health check at http://localhost:${PORT}/api/health`);
  console.log(`📚 API documentation at http://localhost:${PORT}/api`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize WhatsApp bot (only if enabled)
  const enableWhatsApp = process.env.ENABLE_WHATSAPP_BOT !== 'false';
  if (enableWhatsApp) {
    console.log('🤖 Initializing WhatsApp bot...');
    WhatsAppService.initialize().catch(error => {
      console.error('Failed to initialize WhatsApp bot:', error);
    });
  } else {
    console.log('🤖 WhatsApp bot disabled (set ENABLE_WHATSAPP_BOT=true to enable)');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;

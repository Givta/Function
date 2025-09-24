import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export class RateLimitMiddleware {
  // General API rate limiting
  static apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: any, res: Response) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000)
      });
    }
  });

  // Authentication endpoints rate limiting (more restrictive)
  static authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 auth attempts per windowMs
    message: {
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        message: 'Too many authentication attempts, please try again later.',
        retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000)
      });
    }
  });

  // WhatsApp bot rate limiting (very restrictive to prevent spam)
  static whatsappLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Limit each user to 10 messages per minute
    message: {
      success: false,
      message: 'Too many messages, please slow down.',
      retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use phone number as key for WhatsApp requests
      return req.body.phoneNumber || req.ip;
    }
  });

  // Financial operations rate limiting
  static financialLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each user to 20 financial operations per hour
    message: {
      success: false,
      message: 'Too many financial operations, please try again later.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise IP
      return (req as any).user?.id || req.ip;
    }
  });

  // File upload rate limiting
  static uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each user to 10 uploads per hour
    message: {
      success: false,
      message: 'Too many file uploads, please try again later.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return (req as any).user?.id || req.ip;
    }
  });

  // Admin endpoints rate limiting
  static adminLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Limit admin requests
    message: {
      success: false,
      message: 'Too many admin requests, please try again later.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Create custom rate limiter for specific routes
  static createCustomLimiter(options: {
    windowMs: number;
    max: number;
    message?: string;
    keyGenerator?: (req: Request) => string;
  }) {
    return rateLimit({
      windowMs: options.windowMs,
      max: options.max,
      message: {
        success: false,
        message: options.message || 'Too many requests, please try again later.',
        retryAfter: `${Math.ceil(options.windowMs / 60000)} minutes`
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: options.keyGenerator || ((req: Request) => req.ip || 'unknown')
    });
  }

  // Strict rate limiter for sensitive operations
  static strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Very restrictive
    message: {
      success: false,
      message: 'Too many sensitive operations, please contact support.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return (req as any).user?.id || req.ip;
    }
  });
}

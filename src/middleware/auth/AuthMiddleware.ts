import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/auth/AuthService';
import { IUser } from '../../models';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export class AuthMiddleware {
  /**
   * Middleware to verify JWT token
   */
  static async authenticate(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Access token required'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const user = await AuthService.verifyToken(token);

      req.user = user;
      next();
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: error.message
      });
    }
  }

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  static async optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = await AuthService.verifyToken(token);
        req.user = user;
      }

      next();
    } catch (error) {
      // Don't fail, just continue without user
      next();
    }
  }

  /**
   * Middleware to check if user is active
   */
  static requireActiveUser(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!req.user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    next();
  }

  /**
   * Middleware to check if user has verified email (for email auth)
   */
  static requireEmailVerification(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.email && !req.user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required'
      });
    }

    next();
  }

  /**
   * Middleware to check if user has completed KYC
   */
  static requireKYC(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.kycStatus !== 'verified') {
      return res.status(403).json({
        success: false,
        message: 'KYC verification required'
      });
    }

    next();
  }

  /**
   * Role-based access control middleware
   */
  static requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // TODO: Implement role-based access when roles are added to user model
      // For now, just check if user is active
      if (!req.user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    };
  }

  /**
   * Admin-only access middleware
   */
  static requireAdmin(req: Request, res: Response, next: NextFunction) {
    // TODO: Implement admin role checking
    // For now, just pass through
    next();
  }
}

import { db, collections } from '../config/firebase';

export interface CacheEntry {
  key: string;
  value: any;
  expiresAt: Date;
  createdAt: Date;
}

export class CacheService {
  private static readonly CACHE_COLLECTION = 'cache';
  private static readonly DEFAULT_TTL = 300; // 5 minutes in seconds

  /**
   * Set a cache entry
   */
  static async set(key: string, value: any, ttlSeconds: number = this.DEFAULT_TTL): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      const cacheEntry: CacheEntry = {
        key,
        value: JSON.stringify(value), // Serialize the value
        expiresAt,
        createdAt: new Date()
      };

      await db.collection(this.CACHE_COLLECTION).doc(key).set(cacheEntry);
    } catch (error) {
      console.error('Cache set error:', error);
      // Don't throw - caching failures shouldn't break the app
    }
  }

  /**
   * Get a cache entry
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const doc = await db.collection(this.CACHE_COLLECTION).doc(key).get();

      if (!doc.exists) {
        return null;
      }

      const cacheEntry = doc.data() as CacheEntry;

      // Check if expired
      if (cacheEntry.expiresAt < new Date()) {
        // Clean up expired entry
        await this.delete(key);
        return null;
      }

      // Deserialize and return
      return JSON.parse(cacheEntry.value) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete a cache entry
   */
  static async delete(key: string): Promise<void> {
    try {
      await db.collection(this.CACHE_COLLECTION).doc(key).delete();
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Clear all cache entries
   */
  static async clear(): Promise<void> {
    try {
      const snapshot = await db.collection(this.CACHE_COLLECTION).get();
      const batch = db.batch();

      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Get or set cache entry (cache-aside pattern)
   */
  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = this.DEFAULT_TTL
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Cache the result
    await this.set(key, data, ttlSeconds);

    return data;
  }

  /**
   * Clean up expired cache entries
   */
  static async cleanup(): Promise<number> {
    try {
      const now = new Date();
      const snapshot = await db.collection(this.CACHE_COLLECTION)
        .where('expiresAt', '<', now)
        .get();

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      return snapshot.docs.length;
    } catch (error) {
      console.error('Cache cleanup error:', error);
      return 0;
    }
  }

  /**
   * Cache user data
   */
  static async cacheUserData(userId: string, userData: any, ttlSeconds: number = 600): Promise<void> {
    await this.set(`user:${userId}`, userData, ttlSeconds);
  }

  /**
   * Get cached user data
   */
  static async getCachedUserData(userId: string): Promise<any | null> {
    return this.get(`user:${userId}`);
  }

  /**
   * Cache wallet balance
   */
  static async cacheWalletBalance(userId: string, balance: any, ttlSeconds: number = 60): Promise<void> {
    await this.set(`wallet_balance:${userId}`, balance, ttlSeconds);
  }

  /**
   * Get cached wallet balance
   */
  static async getCachedWalletBalance(userId: string): Promise<any | null> {
    return this.get(`wallet_balance:${userId}`);
  }

  /**
   * Cache transaction history
   */
  static async cacheTransactionHistory(userId: string, transactions: any[], ttlSeconds: number = 300): Promise<void> {
    await this.set(`transactions:${userId}`, transactions, ttlSeconds);
  }

  /**
   * Get cached transaction history
   */
  static async getCachedTransactionHistory(userId: string): Promise<any[] | null> {
    return this.get(`transactions:${userId}`);
  }

  /**
   * Cache referral stats
   */
  static async cacheReferralStats(userId: string, stats: any, ttlSeconds: number = 300): Promise<void> {
    await this.set(`referral_stats:${userId}`, stats, ttlSeconds);
  }

  /**
   * Get cached referral stats
   */
  static async getCachedReferralStats(userId: string): Promise<any | null> {
    return this.get(`referral_stats:${userId}`);
  }

  /**
   * Cache admin stats
   */
  static async cacheAdminStats(stats: any, ttlSeconds: number = 60): Promise<void> {
    await this.set('admin_stats', stats, ttlSeconds);
  }

  /**
   * Get cached admin stats
   */
  static async getCachedAdminStats(): Promise<any | null> {
    return this.get('admin_stats');
  }

  /**
   * Invalidate user-related cache
   */
  static async invalidateUserCache(userId: string): Promise<void> {
    const keys = [
      `user:${userId}`,
      `wallet_balance:${userId}`,
      `transactions:${userId}`,
      `referral_stats:${userId}`
    ];

    for (const key of keys) {
      await this.delete(key);
    }
  }

  /**
   * Invalidate admin cache
   */
  static async invalidateAdminCache(): Promise<void> {
    await this.delete('admin_stats');
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    activeEntries: number;
  }> {
    try {
      const all = await db.collection(this.CACHE_COLLECTION).get();
      const now = new Date();

      let expiredCount = 0;
      let activeCount = 0;

      all.docs.forEach(doc => {
        const entry = doc.data() as CacheEntry;
        if (entry.expiresAt < now) {
          expiredCount++;
        } else {
          activeCount++;
        }
      });

      return {
        totalEntries: all.docs.length,
        expiredEntries: expiredCount,
        activeEntries: activeCount
      };
    } catch (error) {
      console.error('Get cache stats error:', error);
      return {
        totalEntries: 0,
        expiredEntries: 0,
        activeEntries: 0
      };
    }
  }
}

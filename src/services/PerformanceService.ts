import { Request, Response, NextFunction } from 'express';

export interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    percentage: number;
  };
  cpuUsage?: {
    user: number;
    system: number;
  };
  timestamp: Date;
  endpoint: string;
  method: string;
  statusCode: number;
}

export class PerformanceService {
  private static metrics: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS = 1000;

  /**
   * Middleware to track response time and performance metrics
   */
  static trackPerformance(req: Request, res: Response, next: NextFunction) {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();

    // Track response finish
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();

      const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      const metrics: PerformanceMetrics = {
        responseTime,
        memoryUsage: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal,
          external: endMemory.external - startMemory.external,
          percentage: Math.round((endMemory.heapUsed / endMemory.heapTotal) * 100)
        },
        timestamp: new Date(),
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode
      };

      this.addMetrics(metrics);

      // Log slow requests
      if (responseTime > 1000) { // More than 1 second
        console.warn(`🐌 Slow request: ${req.method} ${req.originalUrl} - ${responseTime.toFixed(2)}ms`);
      }

      // Log high memory usage
      if (metrics.memoryUsage.percentage > 80) {
        console.warn(`🧠 High memory usage: ${metrics.memoryUsage.percentage}% for ${req.method} ${req.originalUrl}`);
      }
    });

    next();
  }

  /**
   * Add metrics to the collection
   */
  private static addMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // Keep only the most recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  /**
   * Get performance statistics
   */
  static getPerformanceStats(timeRangeMinutes: number = 60): {
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    totalRequests: number;
    errorRate: number;
    memoryUsage: {
      average: number;
      peak: number;
    };
    topSlowEndpoints: Array<{
      endpoint: string;
      method: string;
      averageTime: number;
      count: number;
    }>;
  } {
    const now = new Date();
    const timeRange = timeRangeMinutes * 60 * 1000; // Convert to milliseconds
    const cutoffTime = new Date(now.getTime() - timeRange);

    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    if (recentMetrics.length === 0) {
      return {
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
        totalRequests: 0,
        errorRate: 0,
        memoryUsage: { average: 0, peak: 0 },
        topSlowEndpoints: []
      };
    }

    const responseTimes = recentMetrics.map(m => m.responseTime);
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    const memoryUsages = recentMetrics.map(m => m.memoryUsage.percentage);

    // Calculate endpoint performance
    const endpointStats = new Map<string, { totalTime: number; count: number; method: string }>();

    recentMetrics.forEach(metric => {
      const key = `${metric.method} ${metric.endpoint}`;
      const existing = endpointStats.get(key) || { totalTime: 0, count: 0, method: metric.method };

      endpointStats.set(key, {
        totalTime: existing.totalTime + metric.responseTime,
        count: existing.count + 1,
        method: metric.method
      });
    });

    const topSlowEndpoints = Array.from(endpointStats.entries())
      .map(([endpoint, stats]) => ({
        endpoint: endpoint.split(' ').slice(1).join(' '),
        method: stats.method,
        averageTime: stats.totalTime / stats.count,
        count: stats.count
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    return {
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      maxResponseTime: Math.max(...responseTimes),
      minResponseTime: Math.min(...responseTimes),
      totalRequests: recentMetrics.length,
      errorRate: (errorCount / recentMetrics.length) * 100,
      memoryUsage: {
        average: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        peak: Math.max(...memoryUsages)
      },
      topSlowEndpoints
    };
  }

  /**
   * Get current system performance
   */
  static getSystemPerformance(): {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    process: {
      pid: number;
      platform: string;
      nodeVersion: string;
    };
  } {
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;

    return {
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(usedMem / 1024 / 1024), // MB
        total: Math.round(totalMem / 1024 / 1024), // MB
        percentage: Math.round((usedMem / totalMem) * 100)
      },
      cpu: {
        usage: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000000) // CPU microseconds to milliseconds
      },
      process: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version
      }
    };
  }

  /**
   * Monitor database query performance
   */
  static async monitorDatabaseQuery<T>(
    operation: string,
    query: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = process.hrtime.bigint();

    try {
      const result = await query();
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      // Log slow queries
      if (duration > 100) { // More than 100ms
        console.warn(`🐌 Slow database query: ${operation} - ${duration.toFixed(2)}ms`);
      }

      return { result, duration };
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      console.error(`❌ Database query failed: ${operation} - ${duration.toFixed(2)}ms - ${error}`);
      throw error;
    }
  }

  /**
   * Health check with performance metrics
   */
  static async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    timestamp: Date;
    performance: {
      uptime: number;
      memory: { used: number; total: number; percentage: number; };
      cpu: { usage: number; };
      process: { pid: number; platform: string; nodeVersion: string; };
    };
    metrics: {
      averageResponseTime: number;
      maxResponseTime: number;
      minResponseTime: number;
      totalRequests: number;
      errorRate: number;
      memoryUsage: { average: number; peak: number; };
      topSlowEndpoints: Array<{ endpoint: string; method: string; averageTime: number; count: number; }>;
    };
    database: {
      status: 'connected' | 'disconnected';
      responseTime: number;
    };
  }> {
    const performance = this.getSystemPerformance();
    const metrics = this.getPerformanceStats(5); // Last 5 minutes

    // Database health check
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let dbResponseTime = 0;

    try {
      const { duration } = await this.monitorDatabaseQuery(
        'health_check',
        async () => {
          const { collections } = await import('../config/firebase');
          return collections.users.limit(1).get();
        }
      );
      dbStatus = 'connected';
      dbResponseTime = duration;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (
      performance.memory.percentage > 90 ||
      metrics.errorRate > 10 ||
      metrics.averageResponseTime > 2000 ||
      dbStatus === 'disconnected'
    ) {
      status = 'critical';
    } else if (
      performance.memory.percentage > 75 ||
      metrics.errorRate > 5 ||
      metrics.averageResponseTime > 1000
    ) {
      status = 'warning';
    }

    return {
      status,
      timestamp: new Date(),
      performance,
      metrics,
      database: {
        status: dbStatus,
        responseTime: dbResponseTime
      }
    };
  }

  /**
   * Clear performance metrics (for testing)
   */
  static clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Export metrics for monitoring systems
   */
  static exportMetrics(): {
    metrics: PerformanceMetrics[];
    summary: {
      averageResponseTime: number;
      maxResponseTime: number;
      minResponseTime: number;
      totalRequests: number;
      errorRate: number;
      memoryUsage: { average: number; peak: number; };
      topSlowEndpoints: Array<{ endpoint: string; method: string; averageTime: number; count: number; }>;
    };
    system: {
      uptime: number;
      memory: { used: number; total: number; percentage: number; };
      cpu: { usage: number; };
      process: { pid: number; platform: string; nodeVersion: string; };
    };
  } {
    return {
      metrics: [...this.metrics],
      summary: this.getPerformanceStats(),
      system: this.getSystemPerformance()
    };
  }
}

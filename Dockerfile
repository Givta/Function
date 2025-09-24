# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for canvas and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S givta -u 1001

# Create app directory and set permissions
RUN mkdir -p /app/auth_info_baileys && \
    chown -R givta:nodejs /app

# Switch to non-root user
USER givta

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]

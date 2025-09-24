#!/bin/bash

# Givta Backend Deployment Script
# This script handles deployment to various environments

set -e

# Configuration
APP_NAME="givta-backend"
DOCKER_IMAGE="givta-backend"
ENVIRONMENT=${1:-"production"}
TAG=${2:-"latest"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check if docker-compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose is not installed. Please install docker-compose first."
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        log_error "Environment file .env.${ENVIRONMENT} not found."
        exit 1
    fi

    log_success "Prerequisites check passed."
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."

    # Create build args
    BUILD_ARGS=""
    if [ "$ENVIRONMENT" = "production" ]; then
        BUILD_ARGS="--no-cache"
    fi

    # Build the image
    docker build $BUILD_ARGS -t ${DOCKER_IMAGE}:${TAG} .

    if [ $? -eq 0 ]; then
        log_success "Docker image built successfully."
    else
        log_error "Failed to build Docker image."
        exit 1
    fi
}

# Run pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."

    # Run tests
    if [ -f "package.json" ]; then
        log_info "Running tests..."
        npm test
    fi

    # Run linting
    if [ -f "package.json" ]; then
        log_info "Running linting..."
        npm run lint
    fi

    # Check if required environment variables are set
    source ".env.${ENVIRONMENT}"
    required_vars=("FIREBASE_PROJECT_ID" "JWT_SECRET" "PORT")

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable $var is not set."
            exit 1
        fi
    done

    log_success "Pre-deployment checks passed."
}

# Deploy using docker-compose
deploy_with_compose() {
    log_info "Deploying with docker-compose..."

    # Copy environment file
    cp ".env.${ENVIRONMENT}" ".env"

    # Stop existing containers
    docker-compose down

    # Start services
    docker-compose up -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 30

    # Check health
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_success "Deployment successful! Service is healthy."
    else
        log_error "Deployment failed! Service is not healthy."
        exit 1
    fi
}

# Deploy to AWS ECS
deploy_to_aws() {
    log_info "Deploying to AWS ECS..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed."
        exit 1
    fi

    # Build and push to ECR
    aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

    # Tag and push image
    docker tag ${DOCKER_IMAGE}:${TAG} ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${DOCKER_IMAGE}:${TAG}
    docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${DOCKER_IMAGE}:${TAG}

    # Update ECS service
    aws ecs update-service \
        --cluster givta-cluster \
        --service givta-backend-service \
        --force-new-deployment \
        --region us-east-1

    log_success "AWS deployment initiated."
}

# Rollback deployment
rollback() {
    log_info "Rolling back deployment..."

    # For docker-compose
    if [ -f "docker-compose.yml" ]; then
        docker-compose down
        # Pull previous image or use backup
        docker-compose up -d --no-deps givta-backend
    fi

    log_success "Rollback completed."
}

# Main deployment function
main() {
    log_info "Starting deployment of ${APP_NAME} to ${ENVIRONMENT} environment..."

    check_prerequisites
    pre_deployment_checks
    build_image

    case $ENVIRONMENT in
        "development"|"staging")
            deploy_with_compose
            ;;
        "production")
            deploy_to_aws
            ;;
        *)
            log_error "Unknown environment: ${ENVIRONMENT}"
            exit 1
            ;;
    esac

    log_success "Deployment completed successfully!"
    log_info "You can check the application at: http://localhost:3000/api/health"
}

# Handle command line arguments
case "${2:-}" in
    "rollback")
        rollback
        ;;
    *)
        main
        ;;
esac

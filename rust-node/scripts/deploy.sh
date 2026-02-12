#!/bin/bash
# BitSage Coordinator Deployment Script
# Usage: ./scripts/deploy.sh [dev|prod] [up|down|logs|build]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default values
ENVIRONMENT="${1:-dev}"
ACTION="${2:-up}"

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Use 'dev' or 'prod'"
    exit 1
fi

# Set compose file based on environment
if [[ "$ENVIRONMENT" == "prod" ]]; then
    COMPOSE_FILE="docker-compose.production.yml"
    ENV_FILE=".env.production"
else
    COMPOSE_FILE="docker-compose.yml"
    ENV_FILE=".env"
fi

cd "$PROJECT_DIR"

# Check for required files
check_requirements() {
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi

    if [[ "$ENVIRONMENT" == "prod" && ! -f "$ENV_FILE" ]]; then
        log_error "Production requires $ENV_FILE. Copy from .env.example and configure."
        exit 1
    fi
}

# Generate secrets if needed
generate_secrets() {
    if [[ ! -f "$ENV_FILE" ]]; then
        log_info "Creating $ENV_FILE from template..."
        cp .env.example "$ENV_FILE"

        # Generate random JWT secret
        JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
        sed -i.bak "s/your-super-secret-jwt-key-min-32-characters/$JWT_SECRET/" "$ENV_FILE"

        # Generate random worker API key
        WORKER_KEY=$(openssl rand -hex 32)
        sed -i.bak "s/your-worker-api-key/$WORKER_KEY/" "$ENV_FILE"

        rm -f "${ENV_FILE}.bak"

        log_warn "Generated $ENV_FILE with random secrets. Review before deploying to production!"
    fi
}

# Build images
build() {
    log_info "Building Docker images..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache
}

# Start services
up() {
    check_requirements
    generate_secrets

    log_info "Starting BitSage Coordinator ($ENVIRONMENT)..."

    if [[ "$ENVIRONMENT" == "prod" ]]; then
        # Production: include monitoring
        docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    else
        # Development: basic services only
        docker-compose -f "$COMPOSE_FILE" up -d
    fi

    log_info "Waiting for services to be healthy..."
    sleep 5

    # Check health
    if curl -sf http://localhost:3030/health > /dev/null; then
        log_info "Coordinator is healthy!"
    else
        log_warn "Coordinator may still be starting..."
    fi

    echo ""
    log_info "Services started successfully!"
    echo "  - API:      http://localhost:3030"
    echo "  - Health:   http://localhost:3030/health"
    echo "  - Metrics:  http://localhost:9090/metrics"

    if [[ "$ENVIRONMENT" == "prod" ]]; then
        echo "  - Grafana:  http://localhost:3000 (admin/admin)"
    fi
}

# Stop services
down() {
    log_info "Stopping BitSage Coordinator..."
    docker-compose -f "$COMPOSE_FILE" down
    log_info "Services stopped."
}

# View logs
logs() {
    docker-compose -f "$COMPOSE_FILE" logs -f "${3:-coordinator}"
}

# Show status
status() {
    docker-compose -f "$COMPOSE_FILE" ps
}

# Run database migrations
migrate() {
    log_info "Running database migrations..."
    docker-compose -f "$COMPOSE_FILE" exec coordinator /app/bitsage-coordinator migrate
}

# Backup database
backup() {
    BACKUP_DIR="$PROJECT_DIR/backups"
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)

    if [[ "$ENVIRONMENT" == "prod" ]]; then
        log_info "Backing up PostgreSQL database..."
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U bitsage bitsage > "$BACKUP_DIR/bitsage_$TIMESTAMP.sql"
    else
        log_info "Backing up SQLite database..."
        docker cp bitsage-coordinator:/app/data/bitsage.db "$BACKUP_DIR/bitsage_$TIMESTAMP.db"
    fi

    log_info "Backup saved to $BACKUP_DIR"
}

# Main command handler
case "$ACTION" in
    up)
        up
        ;;
    down)
        down
        ;;
    logs)
        logs "$@"
        ;;
    build)
        build
        ;;
    status)
        status
        ;;
    migrate)
        migrate
        ;;
    backup)
        backup
        ;;
    restart)
        down
        up
        ;;
    *)
        echo "BitSage Coordinator Deployment"
        echo ""
        echo "Usage: $0 [dev|prod] [command]"
        echo ""
        echo "Commands:"
        echo "  up        Start services (default)"
        echo "  down      Stop services"
        echo "  restart   Restart services"
        echo "  logs      View logs (add service name as 3rd arg)"
        echo "  build     Build Docker images"
        echo "  status    Show service status"
        echo "  migrate   Run database migrations"
        echo "  backup    Backup database"
        echo ""
        echo "Examples:"
        echo "  $0 dev up          # Start development environment"
        echo "  $0 prod up         # Start production environment"
        echo "  $0 dev logs        # View coordinator logs"
        echo "  $0 prod backup     # Backup production database"
        ;;
esac

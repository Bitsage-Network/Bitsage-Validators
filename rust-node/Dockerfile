# BitSage Coordinator Node
# Multi-stage build for minimal production image

# Stage 1: Build
FROM rust:1.75-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY Cargo.toml Cargo.lock ./

# Create dummy main.rs for dependency compilation
RUN mkdir -p src && \
    echo "fn main() {}" > src/main.rs

# Build dependencies only (cached layer)
RUN cargo build --release && rm -rf src

# Copy actual source code
COPY src ./src
COPY migrations ./migrations

# Touch main.rs to invalidate the dummy build
RUN touch src/main.rs

# Build the actual application
RUN cargo build --release --bin bitsage-coordinator

# Stage 2: Runtime
FROM debian:bookworm-slim AS runtime

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash bitsage

# Create data directory
RUN mkdir -p /app/data && chown bitsage:bitsage /app/data

# Copy binary from builder
COPY --from=builder /app/target/release/bitsage-coordinator /app/bitsage-coordinator

# Copy migrations
COPY --from=builder /app/migrations /app/migrations

# Set ownership
RUN chown -R bitsage:bitsage /app

# Switch to non-root user
USER bitsage

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3030/health || exit 1

# Expose ports
EXPOSE 3030 9090

# Environment defaults
ENV RUST_LOG=bitsage_coordinator=info,tower_http=info
ENV BITSAGE_SERVER__HOST=0.0.0.0
ENV BITSAGE_SERVER__PORT=3030
ENV BITSAGE_METRICS__PORT=9090

# Run the coordinator
ENTRYPOINT ["/app/bitsage-coordinator"]

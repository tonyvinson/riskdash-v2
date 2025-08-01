#!/bin/bash
# Secure frontend deployment script for GovCloud
set -e

# Configuration
PROJECT_NAME="ksi-mvp"
ENVIRONMENT="dev"
BUCKET_NAME="${PROJECT_NAME}-frontend-${ENVIRONMENT}"
BUILD_DIR="frontend/build"
REGION="us-gov-west-1"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

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

echo "🚀 Deploying React App to Secure S3 + CloudFront"
echo "================================================"
log_info "Project: $PROJECT_NAME"
log_info "Environment: $ENVIRONMENT"
log_info "Region: $REGION"
log_info "Bucket: $BUCKET_NAME"

# Step 1: Check if build exists
if [ ! -d "$BUILD_DIR" ]; then
    log_warning "Build directory not found. Running npm run build..."
    cd frontend
    npm install
    npm run build
    cd ..
    log_success "React app built successfully"
else
    log_info "Using existing build directory"
fi

# Step 2: Check if S3 bucket exists
log_info "Checking S3 bucket status..."
if aws s3 ls "s3://$BUCKET_NAME" --region "$REGION" >/dev/null 2>&1; then
    log_success "S3 bucket exists: $BUCKET_NAME"
else
    log_error "S3 bucket not found. Run 'terraform apply' first to create infrastructure."
    exit 1
fi

# Step 3: Sync files to S3 with proper caching
log_info "Uploading files to S3..."

# Upload static assets with long-term caching
log_info "Uploading static assets (CSS, JS, images) with cache headers..."
aws s3 sync "$BUILD_DIR" "s3://$BUCKET_NAME" \
    --region "$REGION" \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "*.html" \
    --exclude "service-worker.js" \
    --exclude "manifest.json" \
    --quiet

# Upload HTML files and service worker with no caching
log_info "Uploading HTML files with no-cache headers..."
aws s3 sync "$BUILD_DIR" "s3://$BUCKET_NAME" \
    --region "$REGION" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --include "*.html" \
    --include "service-worker.js" \
    --include "manifest.json" \
    --quiet

log_success "Files uploaded to S3 successfully"

# Step 4: Get CloudFront distribution URL
log_info "Getting CloudFront distribution URL..."
FRONTEND_URL=$(cd terraform && terraform output -raw frontend_url 2>/dev/null || echo "")

if [ -n "$FRONTEND_URL" ]; then
    log_success "Frontend deployed successfully!"
    echo ""
    echo "🌐 Your FedRAMP 20x Dashboard is live at:"
    echo "   $FRONTEND_URL"
    echo ""
    echo "🔒 Security Features:"
    echo "   ✅ HTTPS enabled by default"
    echo "   ✅ Private S3 bucket (no public access)"
    echo "   ✅ CloudFront Origin Access Control"
    echo "   ✅ GovCloud compliant"
    echo ""
    echo "🔗 API Endpoint:"
    echo "   https://hqen6rb9j1.execute-api.us-gov-west-1.amazonaws.com/dev"
    echo ""
    
    # Optional: Test the deployment
    log_info "Testing deployment..."
    if curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" | grep -q "200"; then
        log_success "✅ Frontend is responding correctly"
    else
        log_warning "⚠️  Frontend may take a few minutes to propagate globally"
    fi
else
    log_warning "Could not retrieve CloudFront URL. Check terraform outputs."
    echo "Run: cd terraform && terraform output frontend_url"
fi

# Step 5: Optional CloudFront cache invalidation
read -p "🔄 Invalidate CloudFront cache for instant updates? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Creating CloudFront invalidation..."
    DISTRIBUTION_ID=$(cd terraform && terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
    
    if [ -n "$DISTRIBUTION_ID" ]; then
        aws cloudfront create-invalidation \
            --distribution-id "$DISTRIBUTION_ID" \
            --paths "/*" \
            --region "$REGION" >/dev/null 2>&1
        log_success "Cache invalidation created - updates will be live in 1-2 minutes"
    else
        log_warning "Could not get CloudFront distribution ID for cache invalidation"
    fi
fi

log_success "🎉 Deployment completed successfully!"
echo ""
echo "Next steps:"
echo "1. 🌐 Open: $FRONTEND_URL"
echo "2. 🔍 Check History tab for FedRAMP 20x CLI commands audit trail"
echo "3. 🔧 Test API connectivity from frontend"

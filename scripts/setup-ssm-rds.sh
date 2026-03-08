#!/bin/bash
# One-time setup: Create SSM parameters for RDS VPC/Subnets.
# Run: ./scripts/setup-ssm-rds.sh dev
# Or with values: VPC_ID=vpc-xxx SUBNET_IDS=subnet-a,subnet-b ./scripts/setup-ssm-rds.sh dev

set -e
STAGE=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE" 2>/dev/null || true
  set +a
fi

VPC_ID=${VPC_ID:-}
SUBNET_IDS=${SUBNET_IDS:-}

if [ -z "$VPC_ID" ] || [ -z "$SUBNET_IDS" ]; then
  echo "Usage: VPC_ID=vpc-xxx SUBNET_IDS=subnet-a,subnet-b $0 $STAGE"
  echo "Or add VPC_ID and SUBNET_IDS to .env"
  exit 1
fi

aws ssm put-parameter --name "/byajbazaar/$STAGE/vpc-id" --value "$VPC_ID" --type String --overwrite
aws ssm put-parameter --name "/byajbazaar/$STAGE/subnet-ids" --value "$SUBNET_IDS" --type String --overwrite
echo "Created SSM parameters for stage $STAGE"

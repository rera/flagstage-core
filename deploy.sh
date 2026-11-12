#!/usr/bin/env bash
# Build the image, push it to ECR, and deploy the CloudFormation stack.
# Reads flagstage.config.json. Does not print secrets. The auth secret is
# created by the stack.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
config="$root/flagstage.config.json"
if [[ ! -f "$config" ]]; then
  echo "Missing $config" >&2
  exit 1
fi

eval "$(
  python3 - "$config" <<'PY'
import json, shlex, sys
data = json.load(open(sys.argv[1]))
for name, key in (
    ("DOMAIN", "domain"),
    ("MODEL", "bedrockModelId"),
    ("REGION", "region"),
    ("SES_FROM", "sesFrom"),
):
    print(f"{name}={shlex.quote(str(data[key]))}")
PY
)"

account="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
repo="flagstage"
registry="${account}.dkr.ecr.${REGION}.amazonaws.com"
tag="$(git -C "$root" rev-parse --short HEAD)"
image="${registry}/${repo}:${tag}"

aws ecr describe-repositories --repository-name "$repo" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$repo" --region "$REGION" >/dev/null
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$registry"
docker build -f "$root/docker/Dockerfile" -t "$image" "$root"
docker push "$image"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name flagstage \
  --template-file "$root/infra/cloudformation/template.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    "Domain=${DOMAIN}" \
    "BedrockModelId=${MODEL}" \
    "SesFrom=${SES_FROM}" \
    "Image=${image}"

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name flagstage \
  --query "Stacks[0].Outputs" \
  --output table

#!/usr/bin/env bash
# Deploy the CloudFormation stack.
# With no arguments, use the released public image pinned in the template.
# ./deploy.sh --build builds the image and pushes it to your own ECR.
# Does not print secrets. The auth secret is created by the stack.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
config="$root/flagstage.config.json"
if [[ ! -f "$config" ]]; then
  echo "Missing $config" >&2
  exit 1
fi

build=0
if [[ "${1:-}" == "--build" ]]; then
  build=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: ./deploy.sh [--build]" >&2
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

overrides=(
  "Domain=${DOMAIN}"
  "BedrockModelId=${MODEL}"
  "SesFrom=${SES_FROM}"
)

if [[ "$build" == "1" ]]; then
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
  docker build -f "$root/docker/Dockerfile" --target lambda -t "${image}-lambda" "$root"
  docker push "${image}-lambda"
  overrides+=("ImageUri=${image}" "LambdaImageUri=${image}-lambda")
fi

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name flagstage \
  --template-file "$root/infra/cloudformation/template.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "${overrides[@]}"

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name flagstage \
  --query "Stacks[0].Outputs" \
  --output table

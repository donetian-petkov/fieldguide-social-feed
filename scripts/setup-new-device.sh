#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_TEMPLATE="$ROOT_DIR/.env.example"
ENV_FILE="$ROOT_DIR/.env"
MODE="database"
MODE_EXPLICIT=false
INSTALL_PLAYWRIGHT=false
INSTALL_PLAYWRIGHT_EXPLICIT=false
RUN_BUILD=false
RUN_BUILD_EXPLICIT=false
START_STACK=false
START_STACK_EXPLICIT=false
SEED_PASSWORD=""
NON_INTERACTIVE=false
INTERACTIVE=false

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-new-device.sh [options]

Bootstrap Fieldguide on a new machine.

Options:
  --demo                 Configure fixture mode and skip Docker/Prisma/seed.
  --database             Configure database mode (default).
  --playwright           Install Playwright browsers for e2e/screenshots.
  --build                Run npm run build after setup.
  --start                Start the stack with npm run dev after setup.
  --seed-password VALUE  Set SEED_USER_PASSWORD in .env before seeding.
  --non-interactive      Use defaults and flags without prompting.
  -h, --help             Show this help text.
EOF
}

log() {
  printf '[setup] %s\n' "$1"
}

die() {
  printf '[setup] Error: %s\n' "$1" >&2
  exit 1
}

ensure_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

version_at_least() {
  node --input-type=module - "$1" "$2" <<'EOF'
const [current, minimum] = process.argv.slice(2);
const normalize = (value) => value.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
const left = normalize(current);
const right = normalize(minimum);
const length = Math.max(left.length, right.length);
for (let index = 0; index < length; index += 1) {
  const a = left[index] ?? 0;
  const b = right[index] ?? 0;
  if (a > b) process.exit(0);
  if (a < b) process.exit(1);
}
process.exit(0);
EOF
}

ensure_version() {
  local name="$1"
  local current="$2"
  local minimum="$3"
  if ! version_at_least "$current" "$minimum"; then
    die "$name $minimum or newer is required. Found $current."
  fi
}

read_env_value() {
  node --input-type=module - "$ENV_FILE" "$1" <<'EOF'
import { existsSync, readFileSync } from 'node:fs';

const [filePath, key] = process.argv.slice(2);
if (!existsSync(filePath)) {
  process.exit(0);
}

for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const separatorIndex = normalized.indexOf('=');
  if (separatorIndex === -1) continue;
  const currentKey = normalized.slice(0, separatorIndex).trim();
  if (currentKey !== key) continue;
  let value = normalized.slice(separatorIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  process.exit(0);
}
EOF
}

write_env_value() {
  node --input-type=module - "$ENV_FILE" "$1" "$2" <<'EOF'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [filePath, key, value] = process.argv.slice(2);
const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
const lines = current ? current.split(/\r?\n/) : [];
let replaced = false;

const nextLines = lines.map((rawLine) => {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) {
    return rawLine;
  }
  const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
  const separatorIndex = normalized.indexOf('=');
  if (separatorIndex === -1) {
    return rawLine;
  }
  const currentKey = normalized.slice(0, separatorIndex).trim();
  if (currentKey !== key) {
    return rawLine;
  }
  replaced = true;
  return `${key}=${value}`;
});

if (!replaced) {
  if (nextLines.length && nextLines[nextLines.length - 1] !== '') {
    nextLines.push('');
  }
  nextLines.push(`${key}=${value}`);
}

writeFileSync(filePath, `${nextLines.join('\n').replace(/\n*$/, '\n')}`);
EOF
}

generate_secret() {
  node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(24).toString('hex'));"
}

generate_seed_password() {
  node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(\`fieldguide-\${randomBytes(6).toString('hex')}\`);"
}

install_node_modules() {
  if [[ -f "$ROOT_DIR/package-lock.json" ]]; then
    log 'Installing npm dependencies with npm ci...'
    (cd "$ROOT_DIR" && npm ci)
  else
    log 'Installing npm dependencies with npm install...'
    (cd "$ROOT_DIR" && npm install)
  fi
}

prompt_value() {
  local prompt="$1"
  local default_value="${2-}"
  local reply=""
  if [[ "$INTERACTIVE" != "true" ]]; then
    printf '%s' "$default_value"
    return 0
  fi
  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt [$default_value]: " reply
  else
    read -r -p "$prompt: " reply
  fi
  printf '%s' "${reply:-$default_value}"
}

prompt_secret() {
  local prompt="$1"
  local reply=""
  if [[ "$INTERACTIVE" != "true" ]]; then
    printf ''
    return 0
  fi
  read -r -s -p "$prompt: " reply
  printf '\n' >&2
  printf '%s' "$reply"
}

prompt_yes_no() {
  local prompt="$1"
  local default_answer="$2"
  local reply=""
  local normalized=""
  if [[ "$INTERACTIVE" != "true" ]]; then
    [[ "$default_answer" == "y" ]]
    return
  fi
  while true; do
    if [[ "$default_answer" == "y" ]]; then
      read -r -p "$prompt [Y/n]: " reply
      normalized="${reply:-y}"
    else
      read -r -p "$prompt [y/N]: " reply
      normalized="${reply:-n}"
    fi
    case "${normalized,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
    esac
  done
}

is_blank_or_placeholder() {
  local value="$1"
  local placeholder="$2"
  [[ -z "$value" || "$value" == "$placeholder" ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --demo)
      MODE="demo"
      MODE_EXPLICIT=true
      shift
      ;;
    --database)
      MODE="database"
      MODE_EXPLICIT=true
      shift
      ;;
    --playwright)
      INSTALL_PLAYWRIGHT=true
      INSTALL_PLAYWRIGHT_EXPLICIT=true
      shift
      ;;
    --build)
      RUN_BUILD=true
      RUN_BUILD_EXPLICIT=true
      shift
      ;;
    --start)
      START_STACK=true
      START_STACK_EXPLICIT=true
      shift
      ;;
    --seed-password)
      [[ $# -ge 2 ]] || die '--seed-password requires a value.'
      SEED_PASSWORD="$2"
      shift 2
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

ensure_command node
ensure_command npm

if [[ "$NON_INTERACTIVE" != "true" && -t 0 && -t 1 ]]; then
  INTERACTIVE=true
fi

NODE_VERSION="$(node -p "process.versions.node")"
NPM_VERSION="$(npm --version)"
ensure_version "Node.js" "$NODE_VERSION" "22.14.0"
ensure_version "npm" "$NPM_VERSION" "10.9.2"

if [[ ! -f "$ENV_TEMPLATE" ]]; then
  die "Missing env template: $ENV_TEMPLATE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log 'Creating .env from .env.example...'
  cp "$ENV_TEMPLATE" "$ENV_FILE"
else
  log 'Using existing .env file.'
fi

if [[ "$INTERACTIVE" == "true" ]]; then
  printf '\n[setup] Interactive configuration\n'
  if [[ "$MODE_EXPLICIT" != "true" ]]; then
    while true; do
      MODE="$(prompt_value "Setup mode (database or demo)" "$MODE")"
      case "$MODE" in
        database|demo) break ;;
      esac
    done
  fi

  DEFAULT_AI_PROVIDER_VALUE="$(read_env_value "DEFAULT_AI_PROVIDER")"
  DEFAULT_AI_PROVIDER_VALUE="${DEFAULT_AI_PROVIDER_VALUE:-openai}"
  SUMMARY_MODEL_VALUE="$(read_env_value "SUMMARY_MODEL")"
  SUMMARY_MODEL_VALUE="${SUMMARY_MODEL_VALUE:-gpt-4.1-mini}"
  TRANSLATION_MODEL_VALUE="$(read_env_value "TRANSLATION_MODEL")"
  TRANSLATION_MODEL_VALUE="${TRANSLATION_MODEL_VALUE:-gpt-4.1-mini}"
  ASK_MODEL_VALUE="$(read_env_value "ASK_MODEL")"
  ASK_MODEL_VALUE="${ASK_MODEL_VALUE:-gpt-4.1-mini}"
  NEWSLETTER_MODEL_VALUE="$(read_env_value "NEWSLETTER_MODEL")"
  NEWSLETTER_MODEL_VALUE="${NEWSLETTER_MODEL_VALUE:-gpt-4.1-mini}"
  ENABLE_EMAIL_VALUE="$(read_env_value "ENABLE_EMAIL")"
  ENABLE_EMAIL_VALUE="${ENABLE_EMAIL_VALUE:-false}"
  EMAIL_FROM_VALUE="$(read_env_value "EMAIL_FROM")"
  EMAIL_FROM_VALUE="${EMAIL_FROM_VALUE:-Fieldguide <noreply@example.com>}"

  if prompt_yes_no "Configure AI provider settings?" "y"; then
    while true; do
      DEFAULT_AI_PROVIDER_VALUE="$(prompt_value "AI provider (openai, anthropic, openrouter)" "$DEFAULT_AI_PROVIDER_VALUE")"
      case "$DEFAULT_AI_PROVIDER_VALUE" in
        openai|anthropic|openrouter) break ;;
      esac
    done
    write_env_value "DEFAULT_AI_PROVIDER" "$DEFAULT_AI_PROVIDER_VALUE"
    SUMMARY_MODEL_VALUE="$(prompt_value "Summary model" "$SUMMARY_MODEL_VALUE")"
    TRANSLATION_MODEL_VALUE="$(prompt_value "Translation model" "$TRANSLATION_MODEL_VALUE")"
    ASK_MODEL_VALUE="$(prompt_value "Ask-AI model" "$ASK_MODEL_VALUE")"
    NEWSLETTER_MODEL_VALUE="$(prompt_value "Newsletter model" "$NEWSLETTER_MODEL_VALUE")"
    write_env_value "SUMMARY_MODEL" "$SUMMARY_MODEL_VALUE"
    write_env_value "TRANSLATION_MODEL" "$TRANSLATION_MODEL_VALUE"
    write_env_value "ASK_MODEL" "$ASK_MODEL_VALUE"
    write_env_value "NEWSLETTER_MODEL" "$NEWSLETTER_MODEL_VALUE"

    case "$DEFAULT_AI_PROVIDER_VALUE" in
      openai)
        CURRENT_PROVIDER_KEY="$(read_env_value "OPENAI_API_KEY")"
        ;;
      anthropic)
        CURRENT_PROVIDER_KEY="$(read_env_value "ANTHROPIC_API_KEY")"
        ;;
      openrouter)
        CURRENT_PROVIDER_KEY="$(read_env_value "OPENROUTER_API_KEY")"
        ;;
    esac

    PROVIDER_KEY_PROMPT="API key for $DEFAULT_AI_PROVIDER_VALUE"
    if [[ -n "$CURRENT_PROVIDER_KEY" ]]; then
      PROVIDER_KEY_PROMPT="$PROVIDER_KEY_PROMPT (leave blank to keep current value)"
    else
      PROVIDER_KEY_PROMPT="$PROVIDER_KEY_PROMPT (leave blank to keep AI disabled)"
    fi
    NEXT_PROVIDER_KEY="$(prompt_secret "$PROVIDER_KEY_PROMPT")"
    if [[ -n "$NEXT_PROVIDER_KEY" ]]; then
      case "$DEFAULT_AI_PROVIDER_VALUE" in
        openai)
          write_env_value "OPENAI_API_KEY" "$NEXT_PROVIDER_KEY"
          ;;
        anthropic)
          write_env_value "ANTHROPIC_API_KEY" "$NEXT_PROVIDER_KEY"
          ;;
        openrouter)
          write_env_value "OPENROUTER_API_KEY" "$NEXT_PROVIDER_KEY"
          ;;
      esac
    fi
  fi

  if prompt_yes_no "Configure email delivery settings?" "$([[ "$ENABLE_EMAIL_VALUE" == "true" ]] && printf y || printf n)"; then
    RESEND_API_KEY_VALUE="$(read_env_value "RESEND_API_KEY")"
    NEXT_RESEND_API_KEY="$(prompt_secret "Resend API key$( [[ -n "$RESEND_API_KEY_VALUE" ]] && printf ' (leave blank to keep current value)' )")"
    if [[ -n "$NEXT_RESEND_API_KEY" ]]; then
      write_env_value "RESEND_API_KEY" "$NEXT_RESEND_API_KEY"
    fi
    EMAIL_FROM_VALUE="$(prompt_value "Email from address" "$EMAIL_FROM_VALUE")"
    write_env_value "EMAIL_FROM" "$EMAIL_FROM_VALUE"
    write_env_value "ENABLE_EMAIL" "true"
  else
    write_env_value "ENABLE_EMAIL" "false"
  fi

  if [[ "$INSTALL_PLAYWRIGHT_EXPLICIT" != "true" ]] && prompt_yes_no "Install Playwright browsers?" "n"; then
    INSTALL_PLAYWRIGHT=true
  fi
  if [[ "$RUN_BUILD_EXPLICIT" != "true" ]] && prompt_yes_no "Run production build after setup?" "n"; then
    RUN_BUILD=true
  fi
  if [[ "$START_STACK_EXPLICIT" != "true" ]] && prompt_yes_no "Start npm run dev when setup completes?" "n"; then
    START_STACK=true
  fi
fi

if [[ "$MODE" == "database" ]]; then
  ensure_command docker
  docker compose version >/dev/null 2>&1 || die 'Docker Compose is required.'
fi

if [[ "$MODE" == "demo" ]]; then
  write_env_value "DEMO_MODE" "true"
  write_env_value "NEXT_PUBLIC_DEMO_FALLBACK" "true"
else
  write_env_value "DEMO_MODE" "false"
  write_env_value "NEXT_PUBLIC_DEMO_FALLBACK" "false"
fi

COOKIE_SECRET_VALUE="$(read_env_value "COOKIE_SECRET")"
if [[ -z "$COOKIE_SECRET_VALUE" || "$COOKIE_SECRET_VALUE" == "replace-with-a-long-random-string" ]]; then
  COOKIE_SECRET_VALUE="$(generate_secret)"
  write_env_value "COOKIE_SECRET" "$COOKIE_SECRET_VALUE"
  log 'Generated a local COOKIE_SECRET.'
fi

CURRENT_SEED_PASSWORD="$(read_env_value "SEED_USER_PASSWORD")"
if [[ -n "$SEED_PASSWORD" ]]; then
  write_env_value "SEED_USER_PASSWORD" "$SEED_PASSWORD"
  CURRENT_SEED_PASSWORD="$SEED_PASSWORD"
elif [[ "$INTERACTIVE" == "true" && "$MODE" == "database" ]]; then
  if is_blank_or_placeholder "$CURRENT_SEED_PASSWORD" "change-this-local-seed-password"; then
    CURRENT_SEED_PASSWORD="$(prompt_secret "Admin seed password (leave blank to auto-generate)")"
    if [[ -z "$CURRENT_SEED_PASSWORD" ]]; then
      CURRENT_SEED_PASSWORD="$(generate_seed_password)"
      log 'Generated a local SEED_USER_PASSWORD.'
    fi
    write_env_value "SEED_USER_PASSWORD" "$CURRENT_SEED_PASSWORD"
  else
    NEXT_SEED_PASSWORD="$(prompt_secret "Admin seed password (leave blank to keep current value)")"
    if [[ -n "$NEXT_SEED_PASSWORD" ]]; then
      CURRENT_SEED_PASSWORD="$NEXT_SEED_PASSWORD"
      write_env_value "SEED_USER_PASSWORD" "$CURRENT_SEED_PASSWORD"
    fi
  fi
elif [[ -z "$CURRENT_SEED_PASSWORD" || "$CURRENT_SEED_PASSWORD" == "change-this-local-seed-password" ]]; then
  CURRENT_SEED_PASSWORD="$(generate_seed_password)"
  write_env_value "SEED_USER_PASSWORD" "$CURRENT_SEED_PASSWORD"
  log 'Generated a local SEED_USER_PASSWORD.'
fi

install_node_modules

if [[ "$MODE" == "database" ]]; then
  log 'Starting Docker dependencies...'
  (cd "$ROOT_DIR" && docker compose up -d --wait)

  log 'Generating Prisma client...'
  (cd "$ROOT_DIR" && npm run prisma:generate)

  log 'Running Prisma migrations...'
  (cd "$ROOT_DIR" && npm run prisma:migrate)

  log 'Seeding database...'
  (cd "$ROOT_DIR" && npm run seed)
else
  log 'Demo mode selected; skipping Docker, Prisma, and seed steps.'
fi

if [[ "$INSTALL_PLAYWRIGHT" == "true" ]]; then
  log 'Installing Playwright browsers...'
  (cd "$ROOT_DIR" && npx playwright install)
fi

if [[ "$RUN_BUILD" == "true" ]]; then
  log 'Running production build...'
  (cd "$ROOT_DIR" && npm run build)
fi

log 'Setup complete.'
printf '\n'
printf 'Mode: %s\n' "$MODE"
printf 'Web:  http://localhost:3000\n'
printf 'API:  http://localhost:4000/health\n'
DEFAULT_AI_PROVIDER_VALUE="$(read_env_value "DEFAULT_AI_PROVIDER")"
DEFAULT_AI_PROVIDER_VALUE="${DEFAULT_AI_PROVIDER_VALUE:-openai}"
case "$DEFAULT_AI_PROVIDER_VALUE" in
  openai)
    ACTIVE_AI_KEY="$(read_env_value "OPENAI_API_KEY")"
    ;;
  anthropic)
    ACTIVE_AI_KEY="$(read_env_value "ANTHROPIC_API_KEY")"
    ;;
  openrouter)
    ACTIVE_AI_KEY="$(read_env_value "OPENROUTER_API_KEY")"
    ;;
esac
printf 'AI:   %s (%s)\n' "$DEFAULT_AI_PROVIDER_VALUE" "$([[ -n "${ACTIVE_AI_KEY:-}" ]] && printf 'key configured' || printf 'disabled')"
printf 'Mail: %s\n' "$( [[ "$(read_env_value "ENABLE_EMAIL")" == "true" ]] && printf 'enabled' || printf 'disabled' )"
if [[ "$MODE" == "database" ]]; then
  printf 'Admin login: admin / %s\n' "$CURRENT_SEED_PASSWORD"
fi

if [[ "$START_STACK" == "true" ]]; then
  log 'Starting the development stack...'
  (cd "$ROOT_DIR" && npm run dev)
else
  printf '\nNext step: npm run dev\n'
fi

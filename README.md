# CodeHarness

AI Coding Agent Harness — A governance framework for AI coding agents.

A CLI tool that lets developers describe coding tasks in natural language. The Agent autonomously reads/writes code, executes commands, runs tests, self-corrects based on deterministic test results, and pauses for human approval on dangerous operations.

**Core philosophy**: `Agent = LLM + Harness`. The LLM is the decision engine; the harness is the engineering layer — governance, feedback, context, security, and distribution.

## Installation

```bash
npm install -g codeharness
# or
npx codeharness
```

**Requirements**: Node.js 18+

## Quick Start

```bash
# Initialize configuration
codeharness init

# Set API key
codeharness key set openai

# Run a task
codeharness run "add unit tests for UserService"

# Preview mode (no changes)
codeharness run --dry-run "refactor the auth module"

# Non-interactive mode
codeharness run --non-interactive "fix lint errors"
```

## Configuration

Configuration is stored in `.codeharness.yaml` (project-level) or `~/.codeharness/config.yaml` (global).

```yaml
version: 1

llm:
  provider: openai
  model: gpt-4o
  fallbacks:
    - provider: anthropic
      model: claude-sonnet-4-20250514
    - provider: ollama
      model: qwen2.5-coder:14b

guardrails:
  enabled: true
  timeout_seconds: 120

feedback:
  test_command: npm test
  lint_command: npm run lint
  typecheck_command: npx tsc --noEmit

interaction:
  mode: interactive
  danger_policy: ask
```

### Priority
CLI args > Environment variables (`CODEHARNESS_` prefix) > Project config > Global config > Defaults

## Modes

| Mode | Flag | Description |
|------|------|-------------|
| Interactive | (default) | Full terminal output with color, approval prompts |
| Non-interactive | `--non-interactive` | No color output, auto-deny dangerous operations |
| Dry-run | `--dry-run` | Preview only, no file modifications |
| Verbose | `--verbose` | Full LLM request/response, guardrail details, per-step timing |

## Supported LLM Providers

| Provider | Models |
|----------|--------|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo |
| Anthropic | Claude Sonnet, Claude Haiku |
| Ollama | Any local model (qwen2.5-coder, llama3, etc.) |

## Guardrail System

Five-layer defense-in-depth:

1. **L1 Pattern Matching** — 8 danger categories, 21 regex patterns, Unix + Windows
2. **L2 Path Boundary** — Workspace containment, sensitive path detection
3. **L3 Risk Assessment** — SAFE / CAUTION / DANGEROUS / FATAL
4. **L4 HITL Approval** — Interactive approval (Y/N/A/S), 120s timeout, session whitelist
5. **L5 Audit Logging** — Always records all actions and results

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Configuration error |
| 2 | Authentication error |
| 3 | Network error |
| 4 | Config file syntax error |
| 5 | Workspace not found |
| 6 | Permission denied |
| 7 | Guardrail blocked |
| 8 | Task failed |
| 9 | Unknown internal error |
| 10 | Node.js version too old |
| 130 | User interrupted (Ctrl+C) |

## Architecture

```
CodeHarness Architecture
┌─────────────────────────────────────────┐
│  CLI Layer (commander + chalk)          │
├─────────────────────────────────────────┤
│  Agent Loop (runAgent)                  │
│  Context → LLM → Parse → Guard → Exec   │
├─────────────────────────────────────────┤
│  Core Modules                           │
│  ├── Action Parser (zod)               │
│  ├── Action Dispatcher                  │
│  ├── Stop Detector                      │
│  ├── Drift Detector                     │
│  ├── Finish Interceptor                 │
│  └── Context Builder                    │
├─────────────────────────────────────────┤
│  Guardrails                             │
│  ├── Pattern Registry (L1)             │
│  ├── Boundary Check (L2)               │
│  ├── Risk Assessment (L3)              │
│  ├── HITL Approval (L4)                │
│  └── Pipeline (L5)                     │
├─────────────────────────────────────────┤
│  Feedback                               │
│  ├── Diff Tracker                       │
│  └── Collector (test/lint/typecheck)    │
├─────────────────────────────────────────┤
│  LLM Layer                              │
│  ├── OpenAI / Anthropic / Ollama        │
│  ├── Mock LLM (for testing)            │
│  └── Provider Chain (fallback)          │
├─────────────────────────────────────────┤
│  Infrastructure                          │
│  ├── Workspace Detector                 │
│  ├── Shell Executor                     │
│  ├── File Operations                    │
│  ├── Credential Store (AES-256-GCM)     │
│  ├── Token Counter                      │
│  ├── Cost Tracker                       │
│  ├── Memory Manager                     │
│  └── Logger (pino)                      │
└─────────────────────────────────────────┘
```

## Security

- API keys stored in OS credential manager (AES-256-GCM encrypted)
- All commands go through the five-layer guardrail system
- Session whitelists only valid for current session (never persisted)
- Path operations restricted to workspace boundary
- Sensitive files (.env, *.key, /etc/passwd, ~/.ssh) always blocked

**Important**: CodeHarness guardrails are defensive programming, not a security sandbox. Always review the agent's actions, especially in interactive mode.

## Development

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Type check
npx tsc --noEmit

# Build
npm run build
```

## License

ISC
---
harness_version: 0.47.0
initialized: true
stack: nodejs
stacks:
  - nodejs
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 90
  baseline: null
  current: null
  tool: c8
  tools:
    nodejs: c8
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
app_type: agent
otlp:
  enabled: true
  endpoint: http://localhost:4318
  service_name: newProject
  mode: local-shared
  node_require: --require @opentelemetry/auto-instrumentations-node/register
  resource_attributes: service.instance.id=$(hostname)-$$
  backend: victoria
---

# Codeharness State

This file is managed by the codeharness CLI. Do not edit manually.

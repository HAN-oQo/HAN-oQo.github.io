#!/bin/sh
# install-hooks.sh — 이 레포의 git 훅(.githooks/)을 활성화한다.
# 클론 직후 1회 실행. (core.hooksPath 는 클론 시 자동 설정되지 않음)
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/*
echo "✓ git hooks 활성화됨 (core.hooksPath = .githooks)"
echo "  pre-push: push 전 테마/포맷 검사 (tools/check_theme.py)"

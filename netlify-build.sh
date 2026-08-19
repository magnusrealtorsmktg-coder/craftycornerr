#!/usr/bin/env bash
# Assemble the deployable site into dist/ — everything in the repo root EXCEPT
# the studio/ CMS, the functions source, docs and local config. Adding a new
# image or page to the root publishes automatically; studio/ never ships.
set -euo pipefail

rm -rf dist
mkdir dist

rsync -a \
  --exclude='dist' \
  --exclude='studio' \
  --exclude='netlify' \
  --exclude='.git' \
  --exclude='.netlify' \
  --exclude='.claude' \
  --exclude='node_modules' \
  --exclude='*.md' \
  --exclude='.gitignore' \
  --exclude='netlify.toml' \
  --exclude='netlify-build.sh' \
  --exclude='.DS_Store' \
  ./ dist/

echo "── Published site files ──"
ls -1 dist

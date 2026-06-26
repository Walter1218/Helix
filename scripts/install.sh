#!/bin/bash
set -euo pipefail

REPO="sinco-lab/opencode"
INSTALL_DIR="${OPENCODE_HOME:-$HOME/.opencode}/bin"
BINARY_NAME="opencode"
GITHUB_API="https://api.github.com/repos/${REPO}/releases"

detect_platform() {
  local os arch
  
  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) echo "❌ Unsupported OS: $(uname -s)"; exit 1 ;;
  esac
  
  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "❌ Unsupported architecture: $(uname -m)"; exit 1 ;;
  esac
  
  echo "${os}-${arch}"
}

get_download_url() {
  local platform="$1"
  local version="${2:-latest}"
  
  local api_url
  if [ "$version" = "latest" ]; then
    api_url="${GITHUB_API}/latest"
  else
    api_url="${GITHUB_API}/tags/v${version}"
  fi
  
  local response
  response=$(curl -s -f "$api_url" 2>/dev/null) || {
    echo "❌ Failed to fetch release info for version: $version"
    exit 1
  }
  
  local download_url
  download_url=$(echo "$response" | grep -o "\"browser_download_url\": \"[^\"]*opencode-${platform}[^\"]*\"" | head -1 | cut -d'"' -f4)
  
  if [ -z "$download_url" ]; then
    echo "❌ No binary found for platform: $platform"
    echo "Available assets:"
    echo "$response" | grep -o "\"name\": \"[^\"]*\"" | cut -d'"' -f4
    exit 1
  fi
  
  local actual_version
  actual_version=$(echo "$response" | grep -o "\"tag_name\": \"v[^\"]*\"" | head -1 | cut -d'"' -f4 | sed 's/^v//')
  
  echo "${download_url}|${actual_version}"
}

install_binary() {
  local download_url="$1"
  local version="$2"
  
  mkdir -p "$INSTALL_DIR"
  
  local temp_file
  temp_file=$(mktemp)
  
  echo "📥 Downloading opencode v${version}..."
  curl -s -f -L -o "$temp_file" "$download_url" || {
    rm -f "$temp_file"
    echo "❌ Download failed"
    exit 1
  }
  
  chmod +x "$temp_file"
  
  local target_file="${INSTALL_DIR}/${BINARY_NAME}"
  [ "$(uname -s)" = "MINGW"* ] && target_file="${target_file}.exe"
  
  mv "$temp_file" "$target_file"
  
  ln -sf "$target_file" "${INSTALL_DIR}/${BINARY_NAME}-${version}"
  
  echo "✅ Installed opencode v${version} to ${INSTALL_DIR}"
}

update_shell_profile() {
  local profile_file="$1"
  local path_export="export PATH=\"${INSTALL_DIR}:\$PATH\""
  local home_export="export OPENCODE_HOME=\"${OPENCODE_HOME:-$HOME/.opencode}\""
  
  if [ ! -f "$profile_file" ]; then
    touch "$profile_file"
  fi
  
  if ! grep -qF "$path_export" "$profile_file"; then
    echo "" >> "$profile_file"
    echo "# OpenCode" >> "$profile_file"
    echo "$path_export" >> "$profile_file"
    echo "$home_export" >> "$profile_file"
    echo "✅ Updated $profile_file"
  fi
}

main() {
  echo "🚀 OpenCode Installer"
  echo "===================="
  
  local platform
  platform=$(detect_platform)
  echo "Detected platform: $platform"
  
  local version="${1:-latest}"
  echo "Version: $version"
  
  local result
  result=$(get_download_url "$platform" "$version")
  
  local download_url actual_version
  download_url=$(echo "$result" | cut -d'|' -f1)
  actual_version=$(echo "$result" | cut -d'|' -f2)
  
  install_binary "$download_url" "$actual_version"
  
  case "$(basename "${SHELL:-bash}")" in
    bash)
      update_shell_profile "$HOME/.bashrc"
      update_shell_profile "$HOME/.bash_profile"
      ;;
    zsh)
      update_shell_profile "$HOME/.zshrc"
      ;;
    fish)
      local fish_config="$HOME/.config/fish/config.fish"
      mkdir -p "$(dirname "$fish_config")"
      if ! grep -qF "set -gx PATH ${INSTALL_DIR} \$PATH" "$fish_config" 2>/dev/null; then
        echo "" >> "$fish_config"
        echo "# OpenCode" >> "$fish_config"
        echo "set -gx PATH ${INSTALL_DIR} \$PATH" >> "$fish_config"
        echo "set -gx OPENCODE_HOME ${OPENCODE_HOME:-$HOME/.opencode}" >> "$fish_config"
        echo "✅ Updated $fish_config"
      fi
      ;;
  esac
  
  echo ""
  echo "✨ Installation complete!"
  echo ""
  echo "Run 'opencode --version' to verify installation."
  echo "You may need to restart your shell or run:"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
}

main "$@"

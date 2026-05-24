#!/usr/bin/env sh
set -e

BIN_DIR="$1"

if [ -z "$BIN_DIR" ]; then
  echo "usage: setup-path.sh <bin-dir>"
  exit 1
fi

SHELL_NAME="$(basename "$SHELL")"

case "$SHELL_NAME" in
  zsh)  PROFILE="$HOME/.zshrc" ;;
  bash) PROFILE="$HOME/.bash_profile" ;;
  fish) PROFILE="$HOME/.config/fish/config.fish" ;;
  *)
    echo "Unknown shell: $SHELL_NAME. Add $BIN_DIR to your PATH manually."
    exit 0
    ;;
esac

if printf '%s' "$PATH" | tr ':' '\n' | grep -qF "$BIN_DIR"; then
  echo "suiseki already on PATH ($BIN_DIR)"
  exit 0
fi

if grep -qF "$BIN_DIR" "$PROFILE" 2>/dev/null; then
  echo "suiseki already configured in $PROFILE (restart your shell to activate)"
  exit 0
fi

if [ "$SHELL_NAME" = "fish" ]; then
  mkdir -p "$(dirname "$PROFILE")"
  printf '\nfish_add_path %s\n' "$BIN_DIR" >> "$PROFILE"
else
  printf '\n# suiseki\nexport PATH="%s:$PATH"\n' "$BIN_DIR" >> "$PROFILE"
fi

echo "Added $BIN_DIR to PATH in $PROFILE"
echo "Restart your shell or run: source $PROFILE"

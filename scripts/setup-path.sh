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
  bash)
    if [ "$(uname)" = "Linux" ]; then
      PROFILE="$HOME/.bashrc"
    else
      PROFILE="$HOME/.bash_profile"
    fi
    ;;
  fish) PROFILE="$HOME/.config/fish/config.fish" ;;
  *)
    echo "Unknown shell: $SHELL_NAME. Add $BIN_DIR to your PATH manually."
    exit 0
    ;;
esac

if printf '%s' "$PATH" | tr ':' '\n' | grep -qxF "$BIN_DIR"; then
  echo "suiseki already on PATH ($BIN_DIR)"
  exit 0
fi

if [ "$SHELL_NAME" = "fish" ]; then
  PROFILE_LINE="fish_add_path $BIN_DIR"
else
  PROFILE_LINE="export PATH=\"$BIN_DIR:\$PATH\""
fi

if grep -qxF "$PROFILE_LINE" "$PROFILE" 2>/dev/null; then
  echo "suiseki already configured in $PROFILE (restart your shell to activate)"
  exit 0
fi

if [ "$SHELL_NAME" = "fish" ]; then
  mkdir -p "$(dirname "$PROFILE")"
  printf '\n%s\n' "$PROFILE_LINE" >> "$PROFILE"
else
  printf '\n# suiseki\n%s\n' "$PROFILE_LINE" >> "$PROFILE"
fi

echo "Added $BIN_DIR to PATH in $PROFILE"
echo "Restart your shell or run: source $PROFILE"

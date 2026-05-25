#!/usr/bin/env sh
set -eu

# Install a prebuilt suiseki binary from GitHub Releases.
#
#   curl -fsSL https://raw.githubusercontent.com/michaeldlfx/suiseki/main/scripts/install.sh | sh
#
# Options (environment variables):
#   SUISEKI_VERSION       version to install, e.g. 0.1.0 or v0.1.0 (default: latest)
#   SUISEKI_INSTALL_DIR   install directory (default: /usr/local/bin)
#
# A version may also be passed as the first argument: install.sh 0.1.0

REPO="michaeldlfx/suiseki"
BIN_NAME="suiseki"
INSTALL_DIR="${SUISEKI_INSTALL_DIR:-/usr/local/bin}"
VERSION="${1:-${SUISEKI_VERSION:-latest}}"

error() {
  echo "install.sh: $1" >&2
  exit 1
}

download() {
  # download <url> <outfile>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    error "need curl or wget to download releases"
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    error "need sha256sum or shasum to verify the download"
  fi
}

detect_asset() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os_part="darwin" ;;
    Linux) os_part="linux" ;;
    *) error "unsupported OS: $os (download the Windows .exe from the releases page)" ;;
  esac

  case "$arch" in
    arm64 | aarch64) arch_part="arm64" ;;
    x86_64 | amd64) arch_part="x64" ;;
    *) error "unsupported architecture: $arch" ;;
  esac

  # musl is not supported; a glibc binary won't run there, so fail with a clear
  # message instead of installing one that crashes cryptically.
  if [ "$os_part" = "linux" ] && { ldd --version 2>&1 | grep -qi musl ||
    [ -e /lib/ld-musl-x86_64.so.1 ] || [ -e /lib/ld-musl-aarch64.so.1 ]; }; then
    error "musl-based systems (e.g. Alpine) are not supported"
  fi

  echo "${BIN_NAME}-${os_part}-${arch_part}"
}

asset="$(detect_asset)"

if [ "$VERSION" = "latest" ]; then
  base_url="https://github.com/$REPO/releases/latest/download"
else
  case "$VERSION" in
    v*) tag="$VERSION" ;;
    *) tag="v$VERSION" ;;
  esac
  base_url="https://github.com/$REPO/releases/download/$tag"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Installing suiseki ($asset, $VERSION)..."

download "$base_url/$asset" "$tmp_dir/$asset"
download "$base_url/checksums.txt" "$tmp_dir/checksums.txt"

expected="$(awk -v file="$asset" '$2 == file {print $1}' "$tmp_dir/checksums.txt")"
[ -n "$expected" ] || error "no checksum found for $asset in checksums.txt"

actual="$(sha256_of "$tmp_dir/$asset")"
[ "$actual" = "$expected" ] || error "checksum mismatch for $asset (expected $expected, got $actual)"

chmod +x "$tmp_dir/$asset"
target="$INSTALL_DIR/$BIN_NAME"

if [ -d "$INSTALL_DIR" ] && [ -w "$INSTALL_DIR" ]; then
  mv "$tmp_dir/$asset" "$target"
else
  echo "Elevating with sudo to write to $INSTALL_DIR..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo mv "$tmp_dir/$asset" "$target"
fi

echo "Installed suiseki to $target"

# Register $INSTALL_DIR on PATH and create a default config, for parity with
# `make init`. We reuse the same setup-path.sh rather than duplicate it; it is a
# no-op when the directory is already on PATH (the usual /usr/local/bin case).
download "https://raw.githubusercontent.com/$REPO/main/scripts/setup-path.sh" "$tmp_dir/setup-path.sh"
sh "$tmp_dir/setup-path.sh" "$INSTALL_DIR"

# config --init is safe and non-interactive: it creates ~/.suiseki/config.toml if
# absent and skips if one already exists. suiseki works without a config (it
# falls back to built-in defaults); this just gives you a file to edit.
"$target" config --init

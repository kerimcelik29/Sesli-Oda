#!/bin/sh
set -eu
umask 077

sha=${SSH_ORIGINAL_COMMAND:-}
case "$sha" in
  ''|*[!0-9a-f]*)
    echo "Expected a lowercase commit SHA." >&2
    exit 1
    ;;
esac
[ "${#sha}" -eq 40 ] || {
  echo "Expected a 40-character commit SHA." >&2
  exit 1
}

app_dir=/opt/sesver
tmp_dir=$(mktemp -d /tmp/sesver-deploy.XXXXXX)
trap 'rm -rf "$tmp_dir"' EXIT
trap 'exit 1' HUP INT TERM

tar -xzf - -C "$tmp_dir"
test -f "$tmp_dir/docker-compose.yml" || {
  echo "Deployment archive is missing docker-compose.yml." >&2
  exit 1
}
test -f "$tmp_dir/.deploy-env" || {
  echo "Deployment archive is missing app settings." >&2
  exit 1
}

mkdir -p "$app_dir"
if [ -f "$app_dir/.env" ]; then
  awk '
    NR == FNR {
      separator = index($0, "=")
      if (separator > 0) {
        key = substr($0, 1, separator - 1)
        value = substr($0, separator + 1)
        if (value != "") updates[key] = value
      }
      next
    }
    {
      key = $0
      sub(/=.*/, "", key)
      if (key in updates) {
        print key "=" updates[key]
        delete updates[key]
      } else {
        print
      }
    }
    END {
      for (key in updates) print key "=" updates[key]
    }
  ' "$tmp_dir/.deploy-env" "$app_dir/.env" > "$tmp_dir/.env"
else
  awk '
    {
      separator = index($0, "=")
      if (separator > 0 && substr($0, separator + 1) != "") print
    }
  ' "$tmp_dir/.deploy-env" > "$tmp_dir/.env"
fi

chmod 600 "$tmp_dir/.env"
mv "$tmp_dir/.env" "$app_dir/.env"
rm "$tmp_dir/.deploy-env"
cp -R "$tmp_dir/." "$app_dir/"

cd "$app_dir"
docker compose up -d --build --no-deps api web
printf 'Sesver deployed: %s\n' "$sha"

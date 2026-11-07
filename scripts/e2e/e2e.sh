#!/usr/bin/env bash
# End-to-end test of an installed plint binary against the real Bunny API.
# Usage: e2e.sh <work-dir>   (expects $WORK/home/.plint/bin/plint and $WORK/home/.plint/config.json)
set -u
WORK="$1"
export HOME="$WORK/home"
PLINT="$HOME/.plint/bin/plint"
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG="$(hostname | tr -cd 'a-z0-9' | cut -c1-6)$(date +%H%M%S)"
P="e2e-$TAG"
P2="e2e-$TAG-one"
P3="e2e-$TAG-multi"
P4="e2e-$TAG-big"
. "$HERE/lib.sh"

rm -rf "$WORK/multi" "$WORK/bigsite" "$WORK/site" "$WORK/empty" "$WORK/onlyignored" "$WORK/nokey" "$WORK/big.bin" "$WORK"/c?.json
echo "== plint e2e on $(hostname) node $(node -v) project=$P"

# ---------- basics ----------
"$PLINT" --version >"$OUT" 2>"$ERR"; check "--version exits 0" eq "$?" 0
"$PLINT" --help >"$OUT" 2>"$ERR"; check "--help lists deploy" grep -q "deploy" "$OUT"
pj doctor; check "doctor ok" eq "$(j .ok)" true
check "doctor stdout is one JSON doc" is_one_json

# ---------- auth / usage errors ----------
NOKEY="$WORK/nokey"; mkdir -p "$NOKEY"
SITE="$WORK/site"; mkdir -p "$SITE"; echo "<h1>hello $TAG</h1>" >"$SITE/index.html"
HOME="$NOKEY" BUNNY_API_KEY= "$PLINT" --json "$SITE" -p "$P" --create >"$OUT" 2>"$ERR"
check "no key -> AUTH_MISSING" eq "$(j .error.code)" AUTH_MISSING
check "no key -> stdout still one JSON doc" is_one_json
HOME="$NOKEY" "$PLINT" login </dev/null >"$OUT" 2>"$ERR"; RC=$?
check "login without TTY fails" [ "$RC" -ne 0 ]
check "login without TTY explains TTY + BUNNY_API_KEY" grep -q "interactive terminal.*BUNNY_API_KEY" "$ERR" "$OUT"
HOME="$NOKEY" "$PLINT" --json login </dev/null >"$OUT" 2>"$ERR"
check "login --json -> INVALID_USAGE envelope" eq "$(j .error.code)" INVALID_USAGE

pj "$SITE" -p "Bad--Name" --create; check "invalid name -> PROJECT_INVALID" eq "$(j .error.code)" PROJECT_INVALID
pj "$WORK/does-not-exist" -p "$P" --create; check "missing path -> PATH_NOT_FOUND" eq "$(j .error.code)" PATH_NOT_FOUND
pj / -p "$P" --create; check "/ -> PATH_UNSAFE" eq "$(j .error.code)" PATH_UNSAFE
pj "$HOME" -p "$P" --create; check "\$HOME -> PATH_UNSAFE" eq "$(j .error.code)" PATH_UNSAFE
mkdir -p "$WORK/empty"; pj "$WORK/empty" -p "$P" --create; check "empty dir -> DIRECTORY_EMPTY" eq "$(j .error.code)" DIRECTORY_EMPTY
mkdir -p "$WORK/onlyignored"; echo x >"$WORK/onlyignored/.env"; pj "$WORK/onlyignored" -p "$P" --create
check "dir with only hard-excluded files -> DIRECTORY_EMPTY" eq "$(j .error.code)" DIRECTORY_EMPTY
pj "$SITE" -p "$P"; check "missing project w/o --create -> PROJECT_NOT_FOUND" eq "$(j .error.code)" PROJECT_NOT_FOUND
pj "$SITE"; check "--json without -p -> PROJECT_REQUIRED" eq "$(j .error.code)" PROJECT_REQUIRED
pj inspect -p nope-nope; check "inspect unknown -> PROJECT_NOT_FOUND" eq "$(j .error.code)" PROJECT_NOT_FOUND
pj depoly; check "typo subcommand -> UNKNOWN_COMMAND" eq "$(j .error.code)" UNKNOWN_COMMAND
"$PLINT" destroy -p nope-nope </dev/null >"$OUT" 2>"$ERR"; check "destroy unknown (human) exits non-zero" [ "$?" -ne 0 ]

# ---------- fixture ----------
mkdir -p "$SITE/about" "$SITE/assets" "$SITE/drafts" "$SITE/.git" "$SITE/node_modules/pkg" "$SITE/many/a/b"
echo "<h1>about</h1>" >"$SITE/about/index.html"
echo "console.log('app-$TAG')" >"$SITE/assets/app.js"
echo "space-$TAG" >"$SITE/file with space.txt"
echo "unicode-$TAG" >"$SITE/ünïcødé.txt"
echo "SECRET=1" >"$SITE/.env"
echo "SECRET=2" >"$SITE/.env.local"
echo "[core]" >"$SITE/.git/config"
echo "x" >"$SITE/node_modules/pkg/index.js"
echo "secret.txt" >"$SITE/.gitignore"
echo "nope" >"$SITE/secret.txt"
echo "drafts/" >"$SITE/.plintignore"
echo "draft" >"$SITE/drafts/a.html"
ln -s index.html "$SITE/link.html"
for i in $(seq 1 300); do echo "f$i" >"$SITE/many/a/b/f$i.txt"; done
mkfifo "$SITE/pipe" 2>/dev/null || true

# ---------- estimate & dry-run ----------
pj estimate "$SITE"; check "estimate ok" eq "$(j .ok)" true
EST_COUNT="$(j .data.file_count)"; echo "      estimate file_count=$EST_COUNT"
pj "$SITE" -p "$P" --create --dry-run; check "dry-run new project ok" eq "$(j .data.dry_run)" true
check "dry-run would create" eq "$(j .data.would_create_binding)" true
pj list; check "dry-run did not persist project" bash -c "! grep -q '\"$P\"' '$OUT'"

# ---------- first deploy ----------
pj "$SITE" -p "$P" --create; check "deploy --create ok" eq "$(j .ok)" true
check "deploy stdout is one JSON doc" is_one_json
URL="$(j .data.url)"; UP1="$(j .data.uploaded)"; echo "      url=$URL uploaded=$UP1"
check "deploy uploaded == estimate file_count" eq "$UP1" "$EST_COUNT"
check "deploy reports symlink warning" grep -q -i "symlink" "$OUT"
check "deploy result does not leak zone password" bash -c "! grep -qi 'password' '$OUT'"
pj files -p "$P"; FILES="$(cat "$OUT")"
check "files has index.html" has "$FILES" '"index.html"'
check "files has nested about/index.html" has "$FILES" 'about/index.html'
check "files has 'file with space.txt'" has "$FILES" 'file with space.txt'
check "files has unicode name" has "$FILES" 'ünïcødé.txt'
check "files has 300 nested files" bash -c "[ \$(grep -o 'many/a/b/f[0-9]*\.txt' '$OUT' | sort -u | wc -l) -eq 300 ]"
for x in '.env"' '.env.local' '.git/' 'node_modules' 'secret.txt' 'drafts/' 'link.html' '"pipe"'; do
  check "files excludes $x" bash -c "! grep -qF -- '$x' '$OUT'"
done
check "CDN serves index.html" fetch_has "$URL" "hello $TAG"
check "CDN serves nested about/" fetch_has "${URL%/}/about/index.html" "about"
check "CDN serves file with space" fetch_has "${URL%/}/file%20with%20space.txt" "space-$TAG"
check "CDN serves unicode file" fetch_has "${URL%/}/$(node -e 'process.stdout.write(encodeURIComponent("ünïcødé.txt"))')" "unicode-$TAG"
code="$(curl -s -o /dev/null -w '%{http_code}' "${URL%/}/.env")"; check "CDN does not serve .env (got $code)" [ "$code" != 200 ]

# ---------- Bunny-side verification (independent of plint) ----------
bunny state "$P"; check "bunny: storage zone exists" bash -c "[ \"$(j .storage_zone.id)\" != '<<undef>>' ] && [ \"$(j .storage_zone.id)\" != null ]"
check "bunny: zone name matches state" eq "$(j .name_matches)" true
check "bunny: pull zone linked to storage zone" eq "$(j .linked)" true
check "bunny: pull zone hostname matches state" eq "$(j .hostname_matches)" true
check "bunny: stored file count == deployed ($EST_COUNT)" eq "$(j .file_count)" "$EST_COUNT"
check "bunny: no .env/.git/secret/drafts stored" bash -c "! grep -qE '\"(\\.env|\\.env\\.local|\\.git/config|secret\\.txt|drafts/a\\.html|link\\.html)\"' '$OUT'"
P_SZ="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.plint/state.json")).projects[process.argv[1]].binding.storage_zone_id)' "$P")"
P_PZ="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.plint/state.json")).projects[process.argv[1]].binding.pull_zone_id)' "$P")"

# ---------- redeploy unchanged ----------
pj "$SITE" -p "$P"; check "redeploy unchanged ok" eq "$(j .ok)" true
check "redeploy uploads 0" eq "$(j .data.uploaded)" 0
check "redeploy unchanged == file count" eq "$(j .data.unchanged)" "$EST_COUNT"

# ---------- incremental change ----------
echo "<h1>v2 $TAG</h1>" >"$SITE/index.html"; rm "$SITE/assets/app.js"; echo "new" >"$SITE/new.html"
pj "$SITE" -p "$P" --dry-run; check "dry-run existing: 2 uploads" eq "$(j .data.uploaded)" 2
check "dry-run existing: 1 delete" eq "$(j .data.deleted)" 1
check "dry-run existing: would not create" eq "$(j .data.created)" false
pj "$SITE" -p "$P"; check "incremental deploy: 2 uploads" eq "$(j .data.uploaded)" 2
check "incremental deploy: 1 delete" eq "$(j .data.deleted)" 1
check "CDN serves updated index after purge" fetch_has "$URL" "v2 $TAG"
code=000; for i in $(seq 1 20); do code="$(curl -s -o /dev/null -w '%{http_code}' "${URL%/}/assets/app.js")"; [ "$code" = 404 ] && break; sleep 2; done
check "deleted file is gone from CDN (got $code)" eq "$code" 404

bunny state "$P"; check "bunny: deleted assets/app.js gone from storage" bash -c "! grep -q 'assets/app.js' '$OUT'"
check "bunny: new.html present in storage" grep -q '"new.html"' "$OUT"

# ---------- management commands ----------
pj inspect -p "$P"; check "inspect ok" eq "$(j .ok)" true
PW_FIELD="$(j .data.binding.zone_password)"; echo "      inspect zone_password=$PW_FIELD"
pj inspect -p "$P" --reveal; REVEALED="$(j .data.binding.zone_password)"
check "inspect --reveal shows a real password" bash -c "[ ${#REVEALED} -gt 20 ]"
check "inspect (no reveal) hides the real password" bash -c "[ '$PW_FIELD' != '$REVEALED' ]"
pj history -p "$P"; check "history ok" eq "$(j .ok)" true; echo "      history: $(head -c 160 "$OUT")"
pj list; check "list contains project" grep -q "\"$P\"" "$OUT"
pj url -p "$P"; check "url matches deploy url" grep -qF "$URL" "$OUT"
pj purge -p "$P"; check "purge ok" eq "$(j .ok)" true
pj repair --dry-run; check "repair --dry-run ok" eq "$(j .ok)" true
pj api get /storagezone; check "api get /storagezone ok" eq "$(j .ok)" true
check "api get output does not echo AccessKey" bash -c "! grep -q '$(node -e 'process.stdout.write(require(process.env.HOME+"/.plint/config.json").apiKey)')' '$OUT'"

# ---------- human output ----------
"$PLINT" "$SITE" -p "$P" </dev/null >"$OUT" 2>"$ERR"; check "human deploy exits 0" eq "$?" 0
check "human deploy prints URL" grep -qF "$URL" "$OUT" "$ERR"

# ---------- single + large file ----------
head -c 20000000 /dev/urandom >"$WORK/big.bin"
pj "$WORK/big.bin" -p "$P2" --create; check "single large file deploy ok" eq "$(j .ok)" true
URL2="$(j .data.url)"
pj "$WORK/big.bin" -p "$P2"; check "unchanged single-file redeploy uploads 0" eq "$(j .data.uploaded)/$(j .data.unchanged)" 0/1
size=0; for i in $(seq 1 20); do size="$(curl -s -o /dev/null -w '%{size_download}' "$URL2")"; [ "$size" = 20000000 ] && break; sleep 3; done
check "CDN serves big.bin with full size (got $size)" eq "$size" 20000000

# ---------- multiple single-file deploys into one project ----------
mkdir -p "$WORK/multi"; echo "<p>a $TAG</p>" >"$WORK/multi/a.html"; echo "<p>b $TAG</p>" >"$WORK/multi/b.html"; echo '{"c":"'$TAG'"}' >"$WORK/multi/c.json"
pj "$WORK/multi/a.html" "$WORK/multi/b.html" -p "$P3" --create; check "two paths in one command -> INVALID_USAGE" eq "$(j .error.code)" INVALID_USAGE
pj "$WORK/multi/a.html" -p "$P3" --create; check "multi: first file creates project" eq "$(j .ok)" true
M_URL="$(j .data.url)"; M_BASE="${M_URL%/a.html}"
pj "$WORK/multi/b.html" -p "$P3"; check "multi: second file into same project" eq "$(j .ok)" true
pj "$WORK/multi/c.json" -p "$P3"; check "multi: third file into same project" eq "$(j .ok)" true
bunny state "$P3"; check "multi: bunny stores all 3 files (got $(j .file_count))" eq "$(j .file_count)" 3
check "multi: CDN serves a.html" fetch_has "$M_BASE/a.html" "a $TAG"
check "multi: CDN serves b.html" fetch_has "$M_BASE/b.html" "b $TAG"
check "multi: CDN serves c.json" fetch_has "$M_BASE/c.json" "$TAG"
pj "$WORK/multi/b.html" -p "$P3"; check "multi: unchanged b.html redeploy uploads 0" eq "$(j .data.uploaded)/$(j .data.unchanged)" 0/1
echo "<p>b2 $TAG</p>" >"$WORK/multi/b.html"; pj "$WORK/multi/b.html" -p "$P3"; check "multi: changed b.html re-uploads" eq "$(j .data.uploaded)" 1
check "multi: CDN serves changed b.html" fetch_has "$M_BASE/b.html" "b2 $TAG"
rm "$WORK/multi/c.json"; echo "<p>d</p>" >"$WORK/multi/d.html"
pj "$WORK/multi" -p "$P3"; check "multi: folder deploy over single files ok" eq "$(j .ok)" true
echo "      multi: folder deploy -> uploaded=$(j .data.uploaded) deleted=$(j .data.deleted) unchanged=$(j .data.unchanged)"
bunny state "$P3"; check "multi: storage now mirrors folder (a,b,d)" bash -c "[ \"$(j .file_count)\" = 3 ] && grep -q '\"d.html\"' '$OUT' && ! grep -q 'c.json' '$OUT'"

# ---------- large folder ----------
mkdir -p "$WORK/bigsite"; echo "<h1>big $TAG</h1>" >"$WORK/bigsite/index.html"
for d in $(seq 1 50); do mkdir -p "$WORK/bigsite/d$d"; for f in $(seq 1 40); do echo "d$d f$f" >"$WORK/bigsite/d$d/f$f.txt"; done; done
for k in 1 2 3 4 5; do head -c 5000000 /dev/urandom >"$WORK/bigsite/blob$k.bin"; done
T0=$(date +%s); pj "$WORK/bigsite" -p "$P4" --create; T1=$(date +%s)
check "big folder deploy ok ($((T1-T0))s)" eq "$(j .ok)" true
check "big folder uploaded 2006 files" eq "$(j .data.uploaded)" 2006
B_URL="$(j .data.url)"
bunny state "$P4"; check "big: bunny stores 2006 files (got $(j .file_count))" eq "$(j .file_count)" 2006
check "big: bunny bytes >= 25MB" bash -c "[ $(j .total_bytes) -ge 25000000 ]"
check "big: CDN serves deep file" fetch_has "${B_URL%/}/d37/f29.txt" "d37 f29"
size=0; for i in $(seq 1 20); do size="$(curl -s -o /dev/null -w '%{size_download}' "${B_URL%/}/blob3.bin")"; [ "$size" = 5000000 ] && break; sleep 3; done
check "big: CDN serves 5MB blob intact (got $size)" eq "$size" 5000000
T0=$(date +%s); pj "$WORK/bigsite" -p "$P4"; T1=$(date +%s)
check "big: unchanged redeploy uploads 0 ($((T1-T0))s)" eq "$(j .data.uploaded)" 0

# ---------- concurrency on shared state ----------
echo "<h1>c1</h1>" >"$SITE/c1.html"
( "$PLINT" --json "$SITE" -p "$P" >"$WORK/c1.json" 2>&1 ) & ( "$PLINT" --json "$WORK/big.bin" -p "$P2" >"$WORK/c2.json" 2>&1 ) & wait
check "concurrent deploy A ok" grep -q '"ok": true' "$WORK/c1.json"
check "concurrent deploy B ok" grep -q '"ok": true' "$WORK/c2.json"
check "state.json still valid JSON" node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.plint/state.json","utf8"))'
pj list; check "both projects still listed" bash -c "grep -q '\"$P\"' '$OUT' && grep -q '\"$P2\"' '$OUT'"

# ---------- MCP over stdio from the installed binary ----------
node "$HERE/mcp-check.mjs" "$PLINT" "$P" "$SITE" >"$WORK/mcp.txt" 2>&1; MRC=$?
cat "$WORK/mcp.txt" | sed 's/^/      /'
check "MCP checks pass" eq "$MRC" 0

ids() { node -e 'const b=JSON.parse(require("fs").readFileSync(process.env.HOME+"/.plint/state.json")).projects[process.argv[1]].binding;console.log(b.storage_zone_id+" "+b.pull_zone_id)' "$1"; }
IDS2="$(ids "$P2")"; IDS3="$(ids "$P3")"; IDS4="$(ids "$P4")"

# ---------- destroy & reserved names ----------
"$PLINT" destroy -p "$P" </dev/null >"$OUT" 2>"$ERR"; check "destroy without TTY and without --json refuses" [ "$?" -ne 0 ]
pj destroy -p "$P"; check "destroy ok" eq "$(j .ok)" true
code=000; for i in $(seq 1 15); do code="$(curl -s -o /dev/null -w '%{http_code}' "$URL")"; [ "$code" != 200 ] && break; sleep 2; done
check "destroyed site no longer served (got $code)" [ "$code" != 200 ]
pj "$SITE" -p "$P" --create; check "destroyed name is reserved" eq "$(j .error.code)" PROJECT_NAME_RESERVED
pj destroy -p "$P2"; check "destroy single-file project ok" eq "$(j .ok)" true
pj destroy -p "$P3"; check "destroy multi project ok" eq "$(j .ok)" true
pj destroy -p "$P4"; check "destroy big project ok" eq "$(j .ok)" true
for pair in "$P_SZ $P_PZ" "$IDS2" "$IDS3" "$IDS4"; do
  bunny gone $pair; check "bunny: zones $pair deleted on Bunny" eq "$(j .storage_gone)$(j .pull_gone)" truetrue
done
pj list; check "list empty of e2e projects" bash -c "! grep -q '\"$P' '$OUT'"

echo
echo "== RESULT $(hostname): $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || { printf "Failures:$FAILS\n"; exit 1; }

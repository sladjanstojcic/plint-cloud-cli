#!/usr/bin/env bash
# Multi-project, multi-folder end-to-end suite for an installed plint, against real Bunny.
# Covers: interactive prompts (via a real PTY), login, auth precedence, many projects in
# parallel with isolation checks, moving a project between folders, one folder in two
# projects, tricky file names, content types, file<->directory changes, stale projects
# and repair, corrupt state, concurrent deploys, open/api edge cases, and every MCP tool.
# Usage: projects.sh <work-dir>  (expects $WORK/home/.plint/{bin/plint,config.json})
set -u
WORK="$1"
export HOME="$WORK/home"
PLINT="$HOME/.plint/bin/plint"
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG="$(hostname | tr -cd 'a-z0-9' | cut -c1-4)$(date +%H%M%S)"
. "$HERE/lib.sh"
F="$WORK/folders"; rm -rf "$F" "$WORK"/tty-*.txt "$WORK/par"; mkdir -p "$F" "$WORK/par"
API_KEY="$(node -p 'require(process.env.HOME+"/.plint/config.json").apiKey')"
CREATED=()   # every project this run creates, for the final cleanup check
pty() { local t="$1"; shift; python3 -I "$HERE/pty-drive.py" "$WORK/tty-$t.txt" -- "$@"; }
zones_of() { echo "$(sv "$1" binding.storage_zone_id) $(sv "$1" binding.pull_zone_id)"; }
ctype() { curl -s -o /dev/null -w '%{content_type}' "$1"; }
enc() { node -e 'process.stdout.write(process.argv[1].split("/").map(encodeURIComponent).join("/"))' "$1"; }
# compare the set of files stored on Bunny with the deployable files of a folder
same_files() {  # same_files <project> <folder>
  node "$HERE/bunny-check.mjs" state "$1" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).files.map(f=>f.path).sort().join("\n"))' >"$WORK/remote.txt"
  "$PLINT" --json estimate "$2" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)).data;console.log(d.file_count)' >"$WORK/local-count.txt"
  [ "$(wc -l <"$WORK/remote.txt" | tr -d ' ')" = "$(cat "$WORK/local-count.txt")" ]
}

echo "== plint projects suite on $(hostname) node $(node -v) tag=$TAG"

# ---------- folders: six different site shapes ----------
mk() { mkdir -p "$(dirname "$1")"; printf '%s' "$2" >"$1"; }
for n in 1 2 3 4 5 6; do mk "$F/s$n/index.html" "<h1>site$n $TAG</h1>"; done
# s1: SPA-like with hashed assets
mk "$F/s1/assets/app.3f9a.js" "console.log('s1')"; mk "$F/s1/assets/app.3f9a.css" "body{}"; mk "$F/s1/favicon.svg" '<svg xmlns="http://www.w3.org/2000/svg"/>'
# s2: docs with 60 pages in sections
for s in a b c; do for i in $(seq 1 20); do mk "$F/s2/$s/page$i.html" "<p>$s $i $TAG</p>"; done; done
# s3: assets of many content types
mk "$F/s3/style.css" "p{}"; mk "$F/s3/app.js" "1"; mk "$F/s3/data.json" '{"a":1}'; mk "$F/s3/logo.svg" '<svg xmlns="http://www.w3.org/2000/svg"/>'
head -c 64 /dev/urandom >"$F/s3/mod.wasm"; head -c 128 /dev/urandom >"$F/s3/photo.png"; mk "$F/s3/robots.txt" "User-agent: *"; mk "$F/s3/feed.xml" "<rss/>"
# s4: tricky names
mk "$F/s4/a#b.html" "hash $TAG"; mk "$F/s4/q?x.txt" "query $TAG"; mk "$F/s4/back\\slash.txt" "bs $TAG"; mk "$F/s4/lt<gt>.txt" "lt $TAG"; mk "$F/s4/plus+sign.txt" "plus $TAG"; mk "$F/s4/per%cent.txt" "pct $TAG"; mk "$F/s4/[brackets].txt" "br $TAG"
mk "$F/s4/Case.txt" "upper $TAG"; mk "$F/s4/case.txt" "lower $TAG"; : >"$F/s4/empty.txt"
LONG="$(printf 'l%.0s' $(seq 1 180)).txt"; mk "$F/s4/$LONG" "long $TAG"
DEEP="$F/s4/$(printf 'd%s/' $(seq 1 20))"; mk "${DEEP}deep.txt" "deep $TAG"
mk "$F/s4/emoji-🚀.txt" "emoji $TAG"; mk "$F/s4/日本語.txt" "jp $TAG"
# s5: nested ignore files
mk "$F/s5/.gitignore" "*.log"; mk "$F/s5/sub/.gitignore" "private/"; mk "$F/s5/sub/.plintignore" "drafts/"; mk "$F/s5/sub/drafts/d.html" "x"; mk "$F/s5/.plintignore" "tmp/"
mk "$F/s5/app.log" "x"; mk "$F/s5/sub/private/x.html" "x"; mk "$F/s5/sub/public/ok.html" "ok $TAG"; mk "$F/s5/tmp/t.html" "x"; mk "$F/s5/sub/keep.log.html" "k"
# s6: will change shape later (file -> directory)
mk "$F/s6/about" "about-as-file $TAG"

# ---------- interactive flows through a real PTY ----------
PI="pj-$TAG-tty"; CREATED+=("$PI")
pty deploy "$PLINT" "$F/s1" ::: 'Project name:' "$PI\r"; RC=$?
check "tty: deploy asks for a name and deploys (rc=$RC)" eq "$RC" 0
check "tty: deployed site is served" fetch_has "$(sv "$PI" url)" "site1 $TAG"
PZ0="pj-$TAG-cols0"; CREATED+=("$PZ0")
PTY_COLS=0 timeout 120 python3 -I "$HERE/pty-drive.py" "$WORK/tty-cols0.txt" -- "$PLINT" "$F/s1" ::: 'Project name:' "$PZ0\r"; RC=$?
check "tty: deploy in a 0-column terminal finishes (spinner regression, rc=$RC)" eq "$RC" 0
pty badname "$PLINT" "$F/s1" ::: 'Project name:' 'Bad Name\r'; RC=$?
check "tty: invalid name at the prompt fails (rc=$RC)" [ "$RC" -ne 0 ]
check "tty: invalid name explained" grep -qi "project name" "$WORK/tty-badname.txt"
PD="pj-$TAG-decl"
pty decline "$PLINT" "$F/s2" -p "$PD" ::: 'Create it\?' 'n\r'; RC=$?
check "tty: declining creation exits cleanly (rc=$RC)" eq "$RC" 0
pj list; check "tty: declined project was not created" bash -c "! grep -q '\"$PD\"' '$OUT'"
pty accept "$PLINT" "$F/s2" -p "$PD" ::: 'Create it\?' 'y\r'; RC=$?; CREATED+=("$PD")
check "tty: accepting creation deploys (rc=$RC)" eq "$RC" 0
pty keep "$PLINT" destroy -p "$PD" ::: 'Delete project' 'n\r'; RC=$?
pj list; check "tty: answering no to destroy keeps the project" grep -q "\"$PD\"" "$OUT"
Z="$(zones_of "$PD")"
pty kill "$PLINT" destroy -p "$PD" ::: 'Delete project' 'y\r'; RC=$?
check "tty: answering yes destroys (rc=$RC)" eq "$RC" 0
bunny gone $Z; check "tty: destroyed zones are gone on Bunny" eq "$(j .storage_gone)$(j .pull_gone)" truetrue

# ---------- login and auth precedence ----------
LH="$WORK/loginhome"; rm -rf "$LH"; mkdir -p "$LH"
HOME="$LH" PLINT_KEY="$API_KEY" pty login "$PLINT" login ::: 'API key' 'env:PLINT_KEY+\r'; RC=$?
check "login: interactive login succeeds (rc=$RC)" eq "$RC" 0
check "login: config.json written with mode 600" bash -c "[ \"\$(stat -c %a '$LH/.plint/config.json')\" = 600 ]"
check "state.json is owner-only (holds zone passwords)" bash -c "[ \"\$(stat -c %a '$HOME/.plint/state.json')\" = 600 ]"
check "login: key not echoed to the terminal" bash -c "! grep -qF '$API_KEY' '$WORK/tty-login.txt'"
HOME="$LH" "$PLINT" --json doctor >"$OUT" 2>"$ERR"; check "login: doctor ok with saved key" eq "$(j .ok)" true
LH2="$WORK/loginbad"; rm -rf "$LH2"; mkdir -p "$LH2"
HOME="$LH2" pty loginbad "$PLINT" login ::: 'API key' 'not-a-real-key-123\r'; RC=$?
check "login: wrong key is rejected (rc=$RC)" [ "$RC" -ne 0 ]
check "login: wrong key is not saved" [ ! -f "$LH2/.plint/config.json" ]
mkdir -p "$LH2/.plint"; echo '{"apiKey":"wrong-key"}' >"$LH2/.plint/config.json"
HOME="$LH2" BUNNY_API_KEY="$API_KEY" "$PLINT" --json api get /storagezone >"$OUT" 2>"$ERR"
check "auth: BUNNY_API_KEY wins over a bad config key" eq "$(j .ok)" true
HOME="$LH" BUNNY_API_KEY="wrong-env-key" "$PLINT" --json api get /storagezone >"$OUT" 2>"$ERR"
check "auth: bad BUNNY_API_KEY fails even with a good config" eq "$(j .ok)" false
echo "      bad key error code: $(j .error.code) — $(j .error.message)"
check "auth: error does not echo the bad key" bash -c "! grep -q wrong-env-key '$OUT' '$ERR'"

# ---------- six projects deployed in parallel ----------
declare -A PRJ
for n in 1 2 3 4 5 6; do PRJ[$n]="pj-$TAG-s$n"; CREATED+=("${PRJ[$n]}"); done
T0=$(date +%s)
for n in 1 2 3 4 5 6; do "$PLINT" --json "$F/s$n" -p "${PRJ[$n]}" --create >"$WORK/par/$n.json" 2>"$WORK/par/$n.err" & done; wait
echo "      6 parallel creates took $(( $(date +%s) - T0 ))s"
for n in 1 2 3 4 5 6; do check "parallel: s$n deploy ok" grep -q '"ok": true' "$WORK/par/$n.json"; done
check "parallel: state.json valid" node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.plint/state.json"))'
pj list; for n in 1 2 3 4 5 6; do check "parallel: s$n listed" grep -q "\"${PRJ[$n]}\"" "$OUT"; done
ZIDS="$(for n in 1 2 3 4 5 6; do sv "${PRJ[$n]}" binding.storage_zone_id; done | sort -u | wc -l | tr -d ' ')"
check "parallel: six distinct storage zones" eq "$ZIDS" 6
for n in 1 2 3 4 5 6; do
  check "isolation: s$n serves its own page" fetch_has "$(sv "${PRJ[$n]}" url)" "site$n $TAG"
  check "isolation: Bunny holds exactly s$n's files" same_files "${PRJ[$n]}" "$F/s$n"
done
check "isolation: s2 page not present in s1's zone" bash -c "! node '$HERE/bunny-check.mjs' state '${PRJ[1]}' | grep -q page1.html"

# ---------- per-folder specifics ----------
U3="$(sv "${PRJ[3]}" url)"; U3="${U3%/}"
for pair in "index.html text/html" "style.css text/css" "app.js javascript" "data.json application/json" "logo.svg image/svg+xml" "mod.wasm application/wasm" "photo.png image/png" "feed.xml xml"; do
  set -- $pair; ct="$(ctype "$U3/$1")"; check "content-type $1 -> $ct" has "$ct" "$2"
done
U4="$(sv "${PRJ[4]}" url)"; U4="${U4%/}"
for name in "a#b.html" "plus+sign.txt" "per%cent.txt" "[brackets].txt" "Case.txt" "case.txt" "$LONG" "emoji-🚀.txt" "日本語.txt"; do
  check "tricky name served: ${name:0:40}" fetch_has "$U4/$(enc "$name")" "$TAG"
done
check "tricky: names Bunny cannot store are skipped with a warning" bash -c "[ \$(grep -c SKIPPED_UNSUPPORTED_NAME '$WORK/par/4.json') -eq 3 ]"
check "tricky: nothing stored under a mangled name (a, q, back/slash, ltgt)" bash -c "! node '$HERE/bunny-check.mjs' state '${PRJ[4]}' | grep -qE '\"path\":\"(a|q|back/slash.txt|ltgt.txt)\"'"
pj "$F/s4" -p "${PRJ[4]}"; check "tricky: redeploy is a no-op (no upload/delete churn)" eq "$(j .data.uploaded)/$(j .data.deleted)" 0/0
check "tricky: case-sensitive names are two files" bash -c "[ \"\$(curl -fsS '$U4/Case.txt')\" != \"\$(curl -fsS '$U4/case.txt')\" ]"
check "tricky: 20-level deep file served" fetch_has "$U4/$(printf 'd%s/' $(seq 1 20))deep.txt" "deep $TAG"
code="$(curl -s -o /dev/null -w '%{http_code}' "$U4/empty.txt")"; check "tricky: empty file served (got $code)" eq "$code" 200
node "$HERE/bunny-check.mjs" state "${PRJ[5]}" >"$OUT"
check "nested ignores: sub/public/ok.html deployed" grep -q 'sub/public/ok.html' "$OUT"
for x in app.log sub/private/x.html sub/drafts/d.html tmp/t.html .gitignore .plintignore; do check "nested ignores: $x excluded" bash -c "! grep -q '\"$x\"' '$OUT'"; done
check "nested ignores: keep.log.html not caught by *.log" grep -q 'sub/keep.log.html' "$OUT"

# ---------- moving projects between folders ----------
pj "$F/s2" -p "${PRJ[1]}"; check "move: deploy s2 into s1's project" eq "$(j .ok)" true
echo "      s2 over s1: uploaded=$(j .data.uploaded) deleted=$(j .data.deleted)"
check "move: project now mirrors s2" same_files "${PRJ[1]}" "$F/s2"
check "move: s1-only asset deleted from Bunny" bash -c "! node '$HERE/bunny-check.mjs' state '${PRJ[1]}' | grep -q app.3f9a.js"
pj "$F/s1" -p "${PRJ[1]}"; check "move: deploy s1 back restores it" same_files "${PRJ[1]}" "$F/s1"
check "move: s1 page served again" fetch_has "$(sv "${PRJ[1]}" url)" "site1 $TAG"
P3B="pj-$TAG-s3copy"; CREATED+=("$P3B")
pj "$F/s3" -p "$P3B" --create; check "one folder, two projects: second project ok" eq "$(j .ok)" true
check "one folder, two projects: different zones" bash -c "[ '$(sv "$P3B" binding.storage_zone_id)' != '$(sv "${PRJ[3]}" binding.storage_zone_id)' ]"
pj destroy -p "$P3B"; check "one folder, two projects: destroy the copy" eq "$(j .ok)" true
check "one folder, two projects: original still served" fetch_has "$U3/" "site3 $TAG"

# ---------- file <-> directory shape change ----------
U6="$(sv "${PRJ[6]}" url)"; U6="${U6%/}"
check "shape: 'about' served as a file" fetch_has "$U6/about" "about-as-file $TAG"
rm "$F/s6/about"; mk "$F/s6/about/index.html" "about-as-dir $TAG"
pj "$F/s6" -p "${PRJ[6]}"; check "shape: file -> directory redeploy ok" eq "$(j .ok)" true
check "shape: about/index.html served" fetch_has "$U6/about/index.html" "about-as-dir $TAG"
rm -rf "$F/s6/about"; mk "$F/s6/about" "about-file-again $TAG"
pj "$F/s6" -p "${PRJ[6]}"; check "shape: directory -> file redeploy ok" eq "$(j .ok)" true
check "shape: about is a file again" fetch_has "$U6/about" "about-file-again $TAG"
check "shape: Bunny mirrors folder after both changes" same_files "${PRJ[6]}" "$F/s6"

# ---------- single file into a folder project keeps its URL ----------
mk "$WORK/extra-$TAG.pdf" "pdf $TAG"; ROOT2="$(sv "${PRJ[2]}" url)"
pj "$WORK/extra-$TAG.pdf" -p "${PRJ[2]}"; check "url: single file into folder project ok" eq "$(j .ok)" true
check "url: deploy reports the root URL ($(j .data.url))" eq "$(j .data.url)" "$ROOT2"
check "url: project URL stays at the root" eq "$(sv "${PRJ[2]}" url)" "$ROOT2"
check "url: the file itself is served" fetch_has "${ROOT2%/}/extra-$TAG.pdf" "pdf $TAG"
pj "$F/s2" -p "${PRJ[2]}"; check "url: folder redeploy removes the extra file again" eq "$(j .data.deleted)" 1

# ---------- interrupted first deploy leaves a manageable project ----------
PK="pj-$TAG-killed"; CREATED+=("$PK")
mkdir -p "$F/slow"; for k in $(seq 1 8); do head -c 4000000 /dev/urandom >"$F/slow/b$k.bin"; done; mk "$F/slow/index.html" "slow $TAG"
"$PLINT" --json "$F/slow" -p "$PK" --create >"$WORK/killed.json" 2>&1 & KPID=$!
for i in $(seq 1 120); do [ -n "$(sv "$PK" binding.storage_zone_id)" ] && break; sleep 0.5; done
kill -9 $KPID 2>/dev/null; wait $KPID 2>/dev/null
check "interrupt: binding saved before uploads finished" bash -c "[ -n '$(sv "$PK" binding.storage_zone_id)' ]"
check "interrupt: the run was really cut short (no success envelope)" bash -c "! grep -q '\"ok\": true' '$WORK/killed.json'"
pj list; check "interrupt: project is listed" grep -q "\"$PK\"" "$OUT"
pj "$F/slow" -p "$PK"; check "interrupt: redeploy without --create finishes it" eq "$(j .ok)" true
check "interrupt: Bunny now mirrors the folder" same_files "$PK" "$F/slow"

# ---------- history across many deploys ----------
pj history -p "${PRJ[1]}"; HN="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).data.entries.length)' "$OUT")"
check "history: s1 has 3 deploys (create, s2, s1) — got $HN" eq "$HN" 3

# ---------- concurrent deploys: same project twice + others ----------
for n in 1 2 3; do echo "<p>c$n $TAG</p>" >"$F/s$n/c.html"; done
"$PLINT" --json "$F/s1" -p "${PRJ[1]}" >"$WORK/par/c1a.json" 2>&1 &
"$PLINT" --json "$F/s1" -p "${PRJ[1]}" >"$WORK/par/c1b.json" 2>&1 &
"$PLINT" --json "$F/s2" -p "${PRJ[2]}" >"$WORK/par/c2.json" 2>&1 &
"$PLINT" --json "$F/s3" -p "${PRJ[3]}" >"$WORK/par/c3.json" 2>&1 &
"$PLINT" --json estimate "$F/s4" >"$WORK/par/c4.json" 2>&1 &
wait
for f in c1a c1b c2 c3 c4; do check "concurrent: $f ok" grep -q '"ok": true' "$WORK/par/$f.json"; done
check "concurrent: s1 still mirrors its folder" same_files "${PRJ[1]}" "$F/s1"
pj history -p "${PRJ[1]}"; HN="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).data.entries.length)' "$OUT")"
check "concurrent: both s1 deploys recorded (5 entries) — got $HN" eq "$HN" 5

# ---------- stale project + repair ----------
PS="pj-$TAG-stale"; CREATED+=("$PS")
pj "$F/s5" -p "$PS" --create; check "stale: create" eq "$(j .ok)" true
node "$HERE/bunny-check.mjs" delete $(sv "$PS" binding.storage_zone_id) >"$OUT"; check "stale: zone deleted behind plint's back" eq "$(j .deleted)" true
sleep 3
pj doctor; check "stale: doctor reports 1 stale project" grep -q '"1 stale projects"' "$OUT"
# Bunny's storage endpoint can keep answering for a few seconds after the account API
# drops a zone, so retry until storage refuses.
for i in $(seq 1 12); do pj "$F/s5" -p "$PS"; [ "$(j .error.code)" = PROJECT_STALE ] && break; sleep 5; done
check "stale: deploy -> PROJECT_STALE (got $(j .error.code) after $i tries)" eq "$(j .error.code)" PROJECT_STALE
pj repair --dry-run; check "stale: repair --dry-run lists it" grep -q "$PS" "$OUT"
check "stale: dry run prunes nothing" eq "$(j .data.pruned)" 0
pj list; check "stale: still listed after dry run" grep -q "\"$PS\"" "$OUT"
pj repair --prune-stale; check "stale: repair --prune-stale prunes 1" eq "$(j .data.pruned)" 1
pj list; check "stale: gone from list after prune" bash -c "! grep -q '\"$PS\"' '$OUT'"
pj "$F/s5" -p "$PS" --create; echo "      stale name after prune: ok=$(j .ok) code=$(j .error.code)"

# ---------- corrupt state ----------
cp "$HOME/.plint/state.json" "$WORK/state.bak"
echo '{ this is not json' >"$HOME/.plint/state.json"
pj list; check "corrupt state: list -> STATE_CORRUPT" eq "$(j .error.code)" STATE_CORRUPT
pj "$F/s1" -p "${PRJ[1]}"; check "corrupt state: deploy -> STATE_CORRUPT" eq "$(j .error.code)" STATE_CORRUPT
pj doctor; check "corrupt state: doctor flags it (ok=$(j .ok))" grep -qi "state" "$OUT"
cp "$WORK/state.bak" "$HOME/.plint/state.json"
pj list; check "corrupt state: restoring the file recovers" eq "$(j .ok)" true

# ---------- open / api edge cases ----------
pj open -p "${PRJ[1]}"; echo "      open: rc=$RC ok=$(j .ok) code=$(j .error.code) (xdg-open $(command -v xdg-open >/dev/null && echo present || echo missing))"
check "open: no unhandled crash" bash -c "! grep -q \"Unhandled 'error' event\" '$ERR'"
check "open: one JSON envelope on stdout" is_one_json
if command -v xdg-open >/dev/null; then check "open: ok with an opener" eq "$(j .ok)" true
else check "open: BROWSER_OPEN_FAILED without an opener" eq "$(j .error.code)" BROWSER_OPEN_FAILED; fi
pj api get /pullzone; check "api: GET /pullzone ok" eq "$(j .ok)" true
pj api get /no-such-endpoint; check "api: unknown endpoint -> structured error" eq "$(j .ok)" false
pj api get "https://example.com/x"; check "api: absolute URL rejected" eq "$(j .ok)" false
pj api get "/../../etc"; echo "      api traversal: ok=$(j .ok) code=$(j .error.code)"

# ---------- every MCP tool through a full lifecycle ----------
mkdir -p "$F/mcp"; mk "$F/mcp/index.html" "mcp $TAG"; mk "$F/mcp/b.html" "b"; mk "$WORK/extra-$TAG.txt" "extra"
PM="pj-$TAG-mcp"; CREATED+=("$PM")
node "$HERE/mcp-lifecycle.mjs" "$PLINT" "$PM" "$F/mcp" "$WORK/extra-$TAG.txt" >"$WORK/mcp-life.txt" 2>&1; MRC=$?
sed 's/^/      /' "$WORK/mcp-life.txt"
check "mcp lifecycle passes" eq "$MRC" 0
ZM="$(grep '^ZONES' "$WORK/mcp-life.txt" | cut -d' ' -f2-)"
[ -n "$ZM" ] && { bunny gone $ZM; check "mcp lifecycle: zones gone on Bunny" eq "$(j .storage_gone)$(j .pull_gone)" truetrue; }

# ---------- cleanup: destroy everything this run created ----------
for p in "${CREATED[@]}"; do
  [ -n "$(sv "$p" binding.storage_zone_id)" ] || continue
  Z="$(zones_of "$p")"; pj destroy -p "$p"
  check "cleanup: destroy $p" eq "$(j .ok)" true
  bunny gone $Z; check "cleanup: $p zones gone on Bunny" eq "$(j .storage_gone)$(j .pull_gone)" truetrue
done
pj list; check "cleanup: no pj-$TAG projects left" bash -c "! grep -q 'pj-$TAG' '$OUT'"

summary projects

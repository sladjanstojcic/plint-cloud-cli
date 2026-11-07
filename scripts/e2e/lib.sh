# Shared helpers for the e2e suites. Source after setting WORK, PLINT and HERE.
PASS=0; FAIL=0; FAILS=""
OUT="$WORK/out.json"; ERR="$WORK/err.txt"

ok()   { PASS=$((PASS+1)); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); FAILS="$FAILS\n  $1"; echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      $2"; }
check() { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name" "stdout=$(head -c 400 "$OUT") stderr=$(head -c 300 "$ERR")"; fi; }

# run plint --json; stdout -> $OUT, stderr -> $ERR, exit code -> $RC
pj() { "$PLINT" --json "$@" >"$OUT" 2>"$ERR"; RC=$?; }
# read a JSON path from $OUT, e.g. j '.data.url'
j() { node -e '
  const s=require("fs").readFileSync(process.argv[2],"utf8");
  let o; try { o=JSON.parse(s) } catch { console.log("<<not-json>>"); process.exit(0) }
  const v=process.argv[1].split(".").filter(Boolean).reduce((a,k)=>a==null?a:a[k],o);
  console.log(v===undefined?"<<undef>>":typeof v==="object"?JSON.stringify(v):String(v))' "$1" "$OUT"; }
bunny() { node "$HERE/bunny-check.mjs" "$@" >"$OUT" 2>"$ERR"; }
is_one_json() { node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$OUT" 2>/dev/null; }
eq() { [ "$1" = "$2" ]; }
has() { grep -q -- "$2" <<<"$1"; }
# fetch URL with retries until body contains needle (CDN propagation)
fetch_has() { local url="$1" needle="$2" i body; for i in $(seq 1 30); do body="$(curl -fsSL --max-time 10 "$url" 2>/dev/null)" && grep -q -- "$needle" <<<"$body" && return 0; sleep 2; done; echo "      last body: $(head -c 200 <<<"$body")"; return 1; }

# state.json field for a project, e.g. sv docs binding.storage_zone_id
sv() { node -e 'const p=JSON.parse(require("fs").readFileSync(process.env.HOME+"/.plint/state.json")).projects[process.argv[1]];const v=p&&process.argv[2].split(".").reduce((a,k)=>a?.[k],p);console.log(v??"")' "$1" "$2"; }
summary() {
  echo; echo "== RESULT $1 $(hostname): $PASS passed, $FAIL failed"
  [ "$FAIL" -eq 0 ] || { printf "Failures:$FAILS\n"; return 1; }
}

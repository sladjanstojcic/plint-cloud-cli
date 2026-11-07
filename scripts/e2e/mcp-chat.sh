#!/usr/bin/env bash
# Multi-turn natural-language conversation with a child Claude session whose ONLY
# tools are the installed plint MCP server. Every claim is re-checked independently.
# Needs the `claude` CLI logged in on the host. Usage: mcp-chat.sh (run by remote.sh --mcp-chat)
set -u
R="${PLINT_E2E_ROOT:-$HOME/plint-e2e}"; W="$R/w-mcp"; HERE="$R/e2e"
rm -rf "$W"; mkdir -p "$W/home/.plint" "$W/site/assets"
cp "$R/key.json" "$W/home/.plint/config.json"; chmod 600 "$W/home/.plint/config.json"
HOME="$W/home" SHELL=/bin/bash PLINT_RELEASE_URL="file://$R/plint.tar.gz" sh "$R/install.sh" >/dev/null
PLINT="$W/home/.plint/bin/plint"
TAG="$(date +%H%M%S)"; PM="mcp-chat-$TAG"
echo "<h1>mcp v1 $TAG</h1>" >"$W/site/index.html"
echo "<h1>about $TAG</h1>" >"$W/site/about.html"
echo "body{color:red}" >"$W/site/assets/style.css"

cat >"$W/mcp.json" <<JSON
{ "mcpServers": { "plint": { "command": "$PLINT", "args": ["mcp"], "env": { "HOME": "$W/home", "PATH": "$PATH" } } } }
JSON

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check() { local n="$1"; shift; if "$@"; then ok "$n"; else bad "$n"; fi; }
fetch_has() { local i; for i in $(seq 1 30); do curl -fsSL --max-time 10 "$1" 2>/dev/null | grep -q -- "$2" && return 0; sleep 2; done; return 1; }

SID=""
turn() {
  local n="$1" prompt="$2" args=()
  [ -n "$SID" ] && args=(--resume "$SID")
  echo; echo "──────── turn $n ────────"; echo "USER: $prompt"
  (cd "$W" && claude -p "$prompt" "${args[@]}" \
      --mcp-config "$W/mcp.json" --strict-mcp-config \
      --allowedTools "mcp__plint__*" \
      --disallowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit" \
      --output-format stream-json --verbose) >"$W/turn$n.jsonl" 2>"$W/turn$n.err"
  node -e '
    const lines=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const tools=[]; let result="", sid="";
    for (const m of lines) {
      if (m.session_id) sid=m.session_id;
      if (m.type==="assistant") for (const c of m.message?.content??[]) if (c.type==="tool_use") tools.push(c.name.replace("mcp__plint__","")+" "+JSON.stringify(c.input));
      if (m.type==="result") result=m.result??"";
    }
    require("fs").writeFileSync(process.argv[2], sid);
    require("fs").writeFileSync(process.argv[3], tools.join("\n"));
    console.log("TOOLS: "+(tools.length?"\n  "+tools.join("\n  "):"(none)"));
    console.log("CLAUDE: "+result.trim().split("\n").join("\n        "));
  ' "$W/turn$n.jsonl" "$W/sid" "$W/tools$n.txt"
  SID="$(cat "$W/sid")"
}
used() { grep -q "^$2" "$W/tools$1.txt"; }
state_val() { node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1]));const p=s.projects[process.argv[2]];console.log(p?eval("p."+process.argv[3]):"")' "$W/home/.plint/state.json" "$PM" "$1" 2>/dev/null; }

turn 1 "You have a plint MCP server for static hosting on Bunny.net. Run a health check and tell me whether everything is OK, then tell me which projects I currently have."
check "t1: used plint_doctor" used 1 plint_doctor
check "t1: used plint_list" used 1 plint_list

turn 2 "I have a website at $W/site. Estimate its size and storage cost, then do a dry-run deploy to a new project named $PM (it should be created). Do NOT really deploy yet - just summarize what would happen."
check "t2: used plint_estimate" used 2 plint_estimate
check "t2: used plint_deploy with dry_run" grep -q 'plint_deploy.*"dry_run":true' "$W/tools2.txt"
check "t2: nothing created yet" bash -c "[ -z \"\$(HOME='$W/home' '$PLINT' --json list | grep '$PM')\" ]"

turn 3 "That looks right. Deploy it for real now and give me the public URL."
check "t3: used plint_deploy" used 3 plint_deploy
URL="$(state_val url)"; [ -z "$URL" ] && URL="https://$(state_val binding.pull_zone_hostname)/"
echo "      state url: $URL"
check "t3: project in state with pull zone" bash -c "[ -n '$(state_val binding.pull_zone_id)' ]"
check "t3: CDN serves v1" fetch_has "$URL" "mcp v1 $TAG"
check "t3: Claude reported the real URL" grep -qF "$(state_val binding.pull_zone_hostname)" "$W/turn3.jsonl"

echo "<h1>mcp v2 $TAG</h1>" >"$W/site/index.html"; rm "$W/site/about.html"; echo "<h1>contact</h1>" >"$W/site/contact.html"
turn 4 "I just edited the site: changed the homepage, removed one page and added another. Redeploy the same project and tell me exactly how many files were uploaded, deleted and unchanged. Then list the files that are now on the server."
check "t4: used plint_deploy" used 4 plint_deploy
check "t4: used plint_files" used 4 plint_files
check "t4: CDN serves v2" fetch_has "$URL" "mcp v2 $TAG"
HOME="$W/home" node "$HERE/bunny-check.mjs" state "$PM" >"$W/b4.json"
check "t4: bunny has contact.html, not about.html" bash -c "grep -q contact.html '$W/b4.json' && ! grep -q about.html '$W/b4.json'"

PW="$(state_val binding.zone_password)"
turn 5 "Show me the deployment history and the project details. Do not reveal the storage zone password."
check "t5: used plint_history" used 5 plint_history
check "t5: used plint_inspect" used 5 plint_inspect
check "t5: did not ask for reveal" bash -c "! grep -q '\"reveal\":true' '$W/tools5.txt'"
check "t5: password never appeared in the session" bash -c "[ -n '$PW' ] && ! grep -qF '$PW' '$W/turn5.jsonl'"

turn 6 "What happens if you try to deploy the folder / to that project, or a path that does not exist like $W/nope? Try both and tell me the exact error codes you got."
check "t6: got PATH_UNSAFE" grep -q PATH_UNSAFE "$W/turn6.jsonl"
check "t6: got PATH_NOT_FOUND" grep -q PATH_NOT_FOUND "$W/turn6.jsonl"
check "t6: site still serves v2 (nothing broke)" fetch_has "$URL" "mcp v2 $TAG"

SZ="$(state_val binding.storage_zone_id)"; PZ="$(state_val binding.pull_zone_id)"
turn 7 "Purge the CDN cache for that project, then destroy the project completely. Afterwards confirm it is gone from my project list."
check "t7: used plint_purge" used 7 plint_purge
check "t7: used plint_destroy" used 7 plint_destroy
HOME="$W/home" node "$HERE/bunny-check.mjs" gone "$SZ" "$PZ" >"$W/b7.json"; check "t7: Bunny zones really deleted ($(cat "$W/b7.json"))" grep -q '"storage_gone":true,"pull_gone":true' "$W/b7.json"
check "t7: not in plint list" bash -c "! HOME='$W/home' '$PLINT' --json list | grep -q '$PM'"

echo; echo "== RESULT mcp-chat: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

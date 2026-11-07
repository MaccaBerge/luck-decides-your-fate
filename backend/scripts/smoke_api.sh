#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:8000}
PW=${ADMIN_PASSWORD:-testpass}
CJ=$(mktemp)
H='Content-Type: application/json'
ok(){ echo "✓ $1"; }
fail(){ echo "✗ $1"; exit 1; }
expect_code(){ local want=$1 desc=$2; shift 2; local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  [ "$got" = "$want" ] && ok "$desc" || fail "$desc (expected $want, got $got)"; }
expect_jq(){ local desc=$1 filter=$2; shift 2
  curl -s "$@" | jq -e "$filter" >/dev/null && ok "$desc" || fail "$desc"; }
shape(){ jq -c '[paths | map(if type=="number" then "N" else . end) | join(".")] | unique'; }

expect_jq   "health"                          '.status=="ok"'                      $BASE/api/health
expect_code 201 "POST /api/games is 201"       -X POST $BASE/api/games
GAME=$(curl -sf -X POST $BASE/api/games | jq -r '.id')
[[ "$GAME" =~ ^[a-z0-9]{8}$ ]] && ok "game id format" || fail "game id format: $GAME"

expect_jq   "entries added"  '(.entries|length)==4 and all(.entries[]; .is_active)' \
            -X POST $BASE/api/games/$GAME/entries -H "$H" -d '{"names":["Anna","Jonas","Per","Kari"]}'
expect_code 404 "trailing slash rejected"      $BASE/api/games/$GAME/
expect_jq   "404 error envelope"  '.error.code=="game_not_found"'                  $BASE/api/games/zzzzzzzz
expect_jq   "422 error envelope"  '.error.code=="validation_error"' \
            -X POST $BASE/api/games/$GAME/entries -H "$H" -d '{"names":[]}'

expect_code 401 "dashboard requires auth"      $BASE/api/admin/dashboard
expect_code 401 "wrong password rejected"      -X POST $BASE/api/admin/login -H "$H" -d '{"password":"wrong"}'
expect_jq   "admin login"  '.ok==true'  -c $CJ -X POST $BASE/api/admin/login -H "$H" -d "{\"password\":\"$PW\"}"

LINK=$(curl -sf -b $CJ -X POST $BASE/api/admin/links -H "$H" \
       -d '{"label":"Smoke","mode":"always","target_names":["Erik","jonas"]}' | jq -r '.game.id')
[[ "$LINK" =~ ^[a-z0-9]{8}$ ]] && ok "link id format" || fail "link id format: $LINK"
expect_jq   "link starts as created"  '.link.status=="created" and .link.first_opened_at==null' \
            -b $CJ $BASE/api/admin/links/$LINK

curl -sf $BASE/api/games/$LINK >/dev/null
expect_jq   "friend open is tracked"  '.link.first_opened_at!=null and .link.status=="disconnected"' \
            -b $CJ $BASE/api/admin/links/$LINK
curl -sf -X POST $BASE/api/games/$LINK/entries -H "$H" -d '{"names":["Anna","  JONAS ","Per","Kari"]}' >/dev/null
expect_jq   "priority list + normalization"  '.rule_status.state=="active" and .rule_status.matched_target=="jonas"' \
            -b $CJ $BASE/api/admin/links/$LINK

A=$(curl -sf $BASE/api/games/$GAME | shape); B=$(curl -sf $BASE/api/games/$LINK | shape)
[ "$A" = "$B" ] && ok "public and link games have identical shape" || fail "shape differs"
if curl -sf $BASE/api/games/$LINK | grep -Eq '"(mode|target_names|label|origin|rule_status|rule_applied|matched_target)"'; then
  fail "rig info leaked in public state"; else ok "no rig info in public state"; fi

for i in 1 2 3 4 5 6 7 8; do
  W=$(curl -sf -X POST $BASE/api/games/$LINK/spin | jq -r '.winner_name')
  [ "$(echo "$W" | tr 'A-Z' 'a-z')" = "jonas" ] || fail "always-mode spin $i won by $W"
  sleep 0.8
done
ok "always mode: JONAS won 8/8"

curl -sf -X POST $BASE/api/games/$LINK/spin >/dev/null
expect_code 409 "concurrent spin rejected"     -X POST $BASE/api/games/$LINK/spin
expect_jq   "edits blocked during spin"  '.error.code=="spin_in_progress"' \
            -X POST $BASE/api/games/$LINK/entries -H "$H" -d '{"names":["X"]}'
sleep 0.8

expect_jq   "switch to never"  '.link.mode=="never"' -b $CJ -X PATCH $BASE/api/admin/links/$LINK -H "$H" -d '{"mode":"never"}'
curl -sf -X PATCH $BASE/api/games/$LINK/settings -H "$H" -d '{"remove_winner":true}' >/dev/null
for i in 1 2 3; do
  W=$(curl -sf -X POST $BASE/api/games/$LINK/spin | jq -r '.winner_name')
  [ "$(echo "$W" | tr 'A-Z' 'a-z')" != "jonas" ] || fail "never-mode picked JONAS"
  sleep 0.8
done
expect_jq   "never + remove winner: JONAS last standing"  '[.entries[]|select(.is_active)|.name]==["JONAS"]' $BASE/api/games/$LINK
expect_jq   "single entry cannot spin"  '.error.code=="not_enough_entries"' -X POST $BASE/api/games/$LINK/spin

expect_jq   "restore all"  'all(.entries[]; .is_active)'  -X POST $BASE/api/games/$LINK/restore
expect_jq   "spin history"  '(.spin_history|length)==12 and all(.spin_history[]; has("rule_applied"))' \
            -b $CJ $BASE/api/admin/links/$LINK
expect_jq   "dashboard lists link"  "(.live_games|type)==\"number\" and any(.links[]; .id==\"$LINK\")" \
            -b $CJ $BASE/api/admin/dashboard
expect_jq   "public games not in link list"  "all(.links[]; .id!=\"$GAME\")"  -b $CJ $BASE/api/admin/dashboard
expect_code 404 "public game not reachable as admin link"  -b $CJ $BASE/api/admin/links/$GAME

expect_code 204 "delete link"                  -b $CJ -X DELETE $BASE/api/admin/links/$LINK
expect_code 404 "deleted link is gone"         $BASE/api/games/$LINK
expect_code 204 "logout"                       -b $CJ -c $CJ -X POST $BASE/api/admin/logout
expect_code 401 "logged out"                   -b $CJ $BASE/api/admin/dashboard
# Multiplayer: host a wheel, join by code, only the host spins.
MP=$(curl -sf -X POST $BASE/api/games | jq -r '.id')
curl -sf -X POST $BASE/api/games/$MP/entries -H "$H" -d '{"names":["Anna","Jonas"]}' >/dev/null
HOSTED=$(curl -sf -X POST $BASE/api/games/$MP/host -H "$H" -d '{"name":"Hanna","avatar":"fox"}')
HOST_KEY=$(echo "$HOSTED" | jq -r '.player_token')
CODE=$(echo "$HOSTED" | jq -r '.state.join_code')
echo "$HOSTED" | jq -e '.state.kind=="multiplayer" and (.state.players|length)==1 and .state.players[0].is_host' >/dev/null \
  && ok "host a wheel" || fail "host a wheel"
expect_jq   "find the game by its code"  ".game_id==\"$MP\""  $BASE/api/join/$CODE
GUEST_KEY=$(curl -sf -X POST $BASE/api/games/$MP/players -H "$H" -d '{"name":"Mia","avatar":"robot"}' | jq -r '.player_token')
expect_jq   "a guest can't spin"  '.error.code=="not_host"'  -X POST $BASE/api/games/$MP/spin -H "X-Player-Token: $GUEST_KEY"
expect_code 202 "the host spins"  -X POST $BASE/api/games/$MP/spin -H "X-Player-Token: $HOST_KEY"
sleep 0.8
expect_jq   "the key is never in public state"  "(tostring|contains(\"$HOST_KEY\")|not) and (.players|length)==2"  $BASE/api/games/$MP
expect_jq   "a guest leaves"  '(.players|length)==1'  -X DELETE $BASE/api/games/$MP/players/me -H "X-Player-Token: $GUEST_KEY"

echo "ALL API SMOKE CHECKS PASSED"

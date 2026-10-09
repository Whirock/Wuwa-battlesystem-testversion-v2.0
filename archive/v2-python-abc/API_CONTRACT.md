# Combat Lab API v1

Loopback only: `http://127.0.0.1:8765`. JSON responses. No CORS. All POST requests must use `Content-Type: application/json` and `X-Session-Token` from GET `/api/session` response `csrf_token`. Server verifies Host and Origin; session token is new each restart.

- GET `/api/catalog`: `{data_version, qualification, candidates:[{id,status,roles:[{id,name}],profiles:[{id,stage,roles}],abilities:{definitionId:definition},scenarios:[{id,...}],gear_profiles:[{id,label,gear}]}]}`
- POST `/api/profile`: `{candidate,profile_id}` or `{candidate,stage,roles}`, optional `routes`, `deck`. Returns `{data_version,profile,abilities}`. `profile.owned_cards` maps physical instance IDs to definitions; `profile.deck` is instance-ID array; `required_choices` contains `{role_id,axis_id,allowed}`. Routes are flat role-to-string: `{"aemeath":"fusion"}`. Frozen profiles expose only stages/roles supported by original Data; fresh_acquisition is supported for 1–3 roles.
- POST `/api/battles`: same profile input, plus optional `enemy_id` and `gear_profile_id`. Server uses fresh random seed and genuine engine shuffle. Returns Battle below.
- GET `/api/battles/{id}`: Battle.
- POST `/api/battles/{id}/actions`: submit one exact request from `legal` (do not wrap). Returns Battle plus `receipt`. Engine enforces revision, request IDs/idempotency and all rules. Rejected actions return HTTP 200 with `receipt.accepted=false`; transport/input errors use 400.
- GET `/api/battles/{id}/export?kind=log`: actual events, actions, receipts, public view and source hashes. No private serialize.
- GET `/api/battles/{id}/export?kind=save`: explicit local debug save, contains private deck/RNG state. Keep this separate from gameplay view.
- POST `/api/restore`: `{save: <parsed exported save>}`. Installed source versions only; all root paths overwritten by server. Replay checked. Returns Battle. Existing matching ID is replaced.
- GET `/api/updates`: `{configured:true,enabled:true,reason,active_version,versions:[string],engine_schema,repository,branch,available:[{version,commit,engine_schema,compatible,qualification}],last_check}`. Fixed repository: `Whirock/Wuwa-battlesystem-testversion-v2.0`, main branch resolved to immutable commit before reading any files.
- POST `/api/updates/check`: bounded public GitHub check for `combat-data/index.json`. Empty repository/missing index returns an honest no-release message; network failures preserve current data.
- POST `/api/updates/install`: `{version}` downloads only a listed, compatible package from its checked immutable commit. Hash/size/path/schema validation and Data compilation precede activation; no engine code or archives accepted.
- POST `/api/updates/activate`: `{version}` selects already validated installed local data version. Existing battles remain pinned.

Battle: `{id,candidate,data_version,qualification,view,events,legal,blocked,abilities}`. `abilities` is pinned to the battle data version. `view` is exactly Engine.public_view(). Events are committed actual log only, not previews. `legal` contains complete requests, including branch/target/additional discard/deployment replacement combinations. `blocked` is `{request,reason}` array.

Request shape: `{battle_id,action_id,expected_revision,actor_entity_id,command,card_instance_id_or_null,branch_id_or_null,target_entity_ids,choices}`. Commands currently `play_card`, `activate_deployment`, `end_turn`, `retreat`. No front-end rule calculations or hidden-outcome previews. Fields may use internal identifiers; render human names from `abilities` where present.

Server writes debug saves to `user_data/` (gitignored). Only web/ is statically served. No arbitrary filesystem APIs. Manual package install: `python app.py --install-pack DIRECTORY`. Git transport is read-only and restricted to the verified public repository above. No tokens are created or saved. This is not an engine updater.

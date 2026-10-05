# v0.3 Live engine API integration contract

Status as of 2026-10-05 06:47 UTC: experimental and uncalibrated. The live GUI is integrated; independent engine/API and limited DOM QA have passed within the documented scope. Clean-package and remote release verification continue with the publisher. Publication has not been completed at this review time. Balance qualification, real-browser acceptance and Windows verification remain outside the completed checks.

## Version separation

- Legacy runtime/engine.py remains byte-identical to v0.1.0 copy. T1–T6 and legacy saves use Engine, never LiveEngine
- New runtime/live_engine.py: shared-runtime-2.0
- Composite live data: wuwa-data-v2; actor schema combat-actors-v1; encounter schema combat-encounters-v1; private checkpoint schema combat-save-v2
- live-data/prototypes-v1.json is the sole authoritative original-prototype content catalogue, content version original-prototypes-0.1
- Existing player ability pack remains the pinned wuwa-data-v1 player-definition component. Its pack manager does not distribute live-data or engine code. Composite live hash covers both the original source hashes and the live content. New live data is bundled with this experimental application, not installed through the old pack updater
- App save wrapper: wuwa-lab-private-save-v2 for live, wuwa-lab-private-save-v1 for legacy. Cross-routing is rejected; both runtime hash and content hash must match. No silent migration
- Preserve prior tags/releases and assets. The publisher records the actual tag, upload and remote verification results; this contract does not claim those future steps are complete.

## Read endpoints

GET /api/catalog keeps old candidates/scenarios intact. New top-level live_content contains actors, abilities and six encounters; live_engine_version identifies the new engine. live_gui_status is integrated_experimental; this does not claim real-browser or Windows verification. GUI mode selection must keep live encounters separate from legacy scenarios.

POST /api/battles accepts existing player profile/stage/roles/routes/deck/gear fields and encounter_id, one of the six keys in live_content.encounters. Do not also supply legacy enemy_id. _ALLY IDs select the registered independent ally; no arbitrary actors/abilities/policy/ally_variant_id inputs are accepted. Existing enemy_id continues using frozen legacy semantics.

Battle.view includes actors (derived dictionary of real bodies), npcs, enemies, body, roles, engine_version, actor_schema, content_version, content_hash and intent_revisions. Body/enemies/npcs are the only state authorities; actors is a read-only serialized projection, not duplicate mutable state. Template roles must never be drawn as extra body/HP bars.

An intent displays ability_id, target_rule, locked_target_ids/target_entity_ids, damage/raw_damage_per_hit, hit_count, costs, cooldown, effects_summary, interruptible, cancelled, revision and revisions. Damage is before target defense/shields/block. Display registered original prototype names and experimental/uncalibrated labels. Phase threshold and victory/defeat/round_limit come from encounter. Avoid deriving additional rule outcomes in the browser.

POST /api/battles/{id}/actions still submits an exact legal player request. There is NO NPC command endpoint. End turn executes declared NPC actions before enemy actions. Each autonomous action has a separate root ID and event source; the outer player request remains transactional/idempotent.

GET export and POST restore keep existing paths. Restore strictly selects engine class from save format, pins package root locally, validates live state/hash, reconstructs accepted actions and compares combat hash. Public logs never include private shuffle state. Only player-phase or terminal checkpoints are valid committed save boundaries; no mid-autonomous-action saving is supported.

## Concrete implementation boundaries

The five prototypes have only registry-validated attack, block, shield, charge and wait actions. The guardian has no healing and cannot borrow a player healing/deployment/resource path. NPC equipment is explicitly empty and nonempty equipment effects are rejected; this milestone does not claim general NPC equipment or arbitrary character-skill parity. Shared source attribution is implemented and tested with qualified event fixtures; no source contribution is awarded merely for guardian participation.

Fixed standard_1_early_uncalibrated numbers use the existing early HP100/attack12 budget as a starting comparison. Mid/late runs remain uncalibrated. Enemy stats do not inspect player hand/deck or dynamically scale during battle. Policy input is a public-state whitelist.

Selected targets are locked. Dead targets fizzle and pay registered costs/cooldown; group effects skip dead members. Cancellation consumes the autonomous slot/cooldown but not extra focus. Delay once preserves the intent and freezes its cycle until resumed. No target retargeting or autonomous hidden replanning. Core phase change occurs at next round start; a delayed intent executes before deferred phase re-evaluation.

Ordinary ally death is not defeat; player death is defeat and wins simultaneous-death priority. The low-level protected_entity_ids defeat hook exists, but no escort encounter is exposed in this six-encounter catalogue. No revive or persistence of NPC progression is implemented.

## GUI integration status

The v0.2 interface integration is present and has passed independent limited DOM QA. The implemented interface covers: explicit legacy/live section, actor-level HP/shield and intent cards, target labels that include NPC bodies, no template-as-body confusion, phase/victory/defeat preview, save-version error guidance, dead-target disabled state, accessible distinction between before-defense damage and actual log HP loss. The integrated_experimental status records implementation and limited DOM checks only; real-browser verification is separate.

## Packaging boundary

tools/prepare_release.py now includes the frozen v0.2 presentation/changelog paths and the new live-data, live documentation and live tests in its allowed file set. Its runtime/ allowed root includes both engine modules. The 63-file allowed inventory and source metadata audit have passed. Independent limited engine/API and GUI QA have passed. The publisher is continuing clean-package checks and remote release verification; their completion must be reported from actual results, not inferred from the metadata audit. SOURCE_MANIFEST.json records the actual v0.3 runtime, live definitions, frontend and user-document source hashes. V03_IMPLEMENTATION_MANIFEST.json records this development milestone separately and is not on the public allowlist.


## v0.2 presentation compatibility wiring

app_version is 0.3.0. The frozen v0.2 presentation.py interface is preserved: each candidate includes guide and rule_definitions; profile responses include role_details; both profile preview and battle creation use resolve_profile for canonical template order and frozen profile matching. Every Battle snapshot includes rule_definitions from its pinned Data, plus live_definitions for live battles (null for legacy). live_definitions contains content_version, content_hash, actors, abilities and the frozen encounter; never look up an in-progress battle's definitions from current catalog. LIVE_COVER appears in snapshot rule_definitions.statuses for the actual guardian shield.

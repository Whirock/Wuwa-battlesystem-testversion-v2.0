/* Recorded legal commands only; no state injection. */
module.exports = {
  "schema": "test4-normal-victory-route-1",
  "config": {
    "team": [
      "amy",
      "mornye",
      "chisa",
      "rover_aero"
    ],
    "encounter": "dreamless",
    "level": 40,
    "difficulty": "standard",
    "seed": 4204,
    "stochastic": false
  },
  "expected": {
    "outcome": "win",
    "rounds": 36,
    "steps": 143,
    "eventCount": 1385,
    "events_sha256": "1f67c95ebd5d46e2be9e842140031812ccc81ddf42ffebabe9193a3afde4ab75"
  },
  "source_sha256": {
    "engine.js": "bcca898fa5206a874d70953c2844af0a445686fb04682874aa378ed48637d66b",
    "skill-effects.js": "5cefec651c4b473d90507fa4bc66ba0da54fa4acad518cd49004baf17f0eb4c9",
    "parameters.json": "6440e27ff9f5304a8303100cfdb33842b1e97342b9c9a495c311254fa1304a6e"
  },
  "commands": [
    {
      "actorId": "enemy:0:dreamless",
      "round": 1,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 1,
      "key": "rover_aero_e2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 1,
      "key": "E3",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 1,
      "key": "E3",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 1,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 2,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 2,
      "key": "rover_aero_e3",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy",
        "abnormal": "none"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 2,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 2,
      "key": "E5",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 2,
      "key": "E4",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 3,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 3,
      "key": "rover_aero_r",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 3,
      "key": "E1",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 3,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 3,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 4,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 4,
      "key": "rover_aero_e2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 4,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 4,
      "key": "E3",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 4,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 5,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 5,
      "key": "rover_aero_e3",
      "targetId": "enemy:projectile:1",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy",
        "abnormal": "none"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 5,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 5,
      "key": "E5",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 5,
      "key": "E4",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 6,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 6,
      "key": "rover_aero_r",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 6,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 6,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 6,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 7,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 7,
      "key": "rover_aero_e2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 7,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 3,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 7,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy",
        "choice": "attack"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 7,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 8,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 8,
      "key": "rover_aero_e3",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy",
        "abnormal": "none"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 8,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 8,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 8,
      "key": "E4",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 9,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 9,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 9,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 9,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 9,
      "key": "E3",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy",
        "choice": "attack"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 10,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 10,
      "key": "rover_aero_r",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 10,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 10,
      "key": "E2",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy",
        "choice": "attack"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 10,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 11,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 11,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 11,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 11,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 11,
      "key": "E1",
      "targetId": "ally:0:amy",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 12,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 12,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 12,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 12,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 12,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 13,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 13,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 13,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 3,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 13,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 13,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 14,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 14,
      "key": "guard",
      "targetId": "ally:3:rover_aero",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 14,
      "key": "guard",
      "targetId": "ally:0:amy",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 14,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 14,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 15,
      "key": "guard",
      "targetId": "ally:3:rover_aero",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 15,
      "key": "guard",
      "targetId": "ally:0:amy",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 15,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 15,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 15,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 16,
      "key": "rover_aero_r",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 2,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:0:amy",
      "round": 16,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 2,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 16,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 2,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 16,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 2,
        "allyTargetId": "ally:0:amy"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 16,
      "enemy": true
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 17,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 17,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 17,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 17,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 18,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 18,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 18,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 18,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 19,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 19,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 19,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 19,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 20,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 20,
      "key": "guard",
      "targetId": "ally:3:rover_aero",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 20,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 20,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 21,
      "key": "guard",
      "targetId": "ally:3:rover_aero",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 21,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 21,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 21,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 22,
      "key": "rover_aero_r",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 3,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 22,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 3,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 22,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 3,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 22,
      "enemy": true
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 23,
      "enemy": true
    },
    {
      "actorId": "ally:3:rover_aero",
      "round": 23,
      "key": "rover_aero_a",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 23,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 23,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:3:rover_aero"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 24,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 24,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 24,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 25,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 25,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 25,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 26,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 26,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 26,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 27,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 2,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 27,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 2,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 27,
      "enemy": true
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 28,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 28,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 28,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 29,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 29,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 29,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 30,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 30,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 30,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 31,
      "enemy": true
    },
    {
      "actorId": "ally:2:chisa",
      "round": 31,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 31,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:2:chisa",
      "round": 32,
      "key": "guard",
      "targetId": "ally:2:chisa",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "ally:1:mornye",
      "round": 32,
      "key": "guard",
      "targetId": "ally:1:mornye",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:2:chisa"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 32,
      "enemy": true
    },
    {
      "actorId": "ally:1:mornye",
      "round": 33,
      "key": "R",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 3,
        "allyTargetId": "ally:1:mornye"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 33,
      "enemy": true
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 34,
      "enemy": true
    },
    {
      "actorId": "ally:1:mornye",
      "round": 34,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:1:mornye"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 35,
      "enemy": true
    },
    {
      "actorId": "ally:1:mornye",
      "round": 35,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 1,
        "allyTargetId": "ally:1:mornye"
      }
    },
    {
      "actorId": "enemy:0:dreamless",
      "round": 36,
      "enemy": true
    },
    {
      "actorId": "ally:1:mornye",
      "round": 36,
      "key": "A",
      "targetId": "enemy:0:dreamless",
      "options": {
        "bp": 0,
        "allyTargetId": "ally:1:mornye"
      }
    }
  ]
};

/* Independent numeric oracle, not copied from runtime parameters. */
module.exports = {
  "source": "Independent final numeric baseline for reproducible runtime QA",
  "baseline_sha256": [
    "7757938739ab7beef9e47d385b88627430dd0ff6cf1d7f3ed250b2510051ff4b",
    "542f2df8d8144d647213f5a89b0448e82709ea2009b02671994a55e02e5821e6",
    "d60d3231db09be9ec9901f59cac5993b2690227ebb35456d89ff8090a860df4d",
    "115522c409030310520baa520d3c2698e96553f7f5413c08722d17173ff6a9c9",
    "7f92f9fbd745fff23bbe74ed522e29a3db400fefab72016d6e7c3c9cbd1a207f"
  ],
  "q_capacities": {
    "elite": 72,
    "crownless": 112,
    "dreamless": 156
  },
  "reflection": {
    "fraction_of_max": 0.35,
    "dreamless_Q": 156,
    "reflection_Q": 54.6,
    "interrupt_below_fraction": 0.5
  },
  "growth": {
    "status": "待实现/未实机验证的回合制候选",
    "profiles": [
      [
        "aemeath",
        "爱弥斯",
        "热熔",
        950,
        7300,
        48,
        126,
        95,
        1000,
        70,
        640,
        100,
        112,
        5,
        20,
        100,
        140,
        125
      ],
      [
        "lynae",
        "琳奈",
        "衍射",
        1050,
        7900,
        60,
        150,
        80,
        900,
        80,
        650,
        106,
        118,
        5,
        12,
        110,
        155,
        125
      ],
      [
        "mornye",
        "莫宁",
        "热熔",
        1200,
        9400,
        70,
        180,
        65,
        750,
        95,
        800,
        90,
        98,
        5,
        8,
        125,
        200,
        175
      ],
      [
        "denia",
        "达妮娅",
        "热熔",
        1000,
        7500,
        62,
        154,
        90,
        980,
        75,
        620,
        101,
        113,
        5,
        16,
        110,
        150,
        125
      ],
      [
        "chisa",
        "千咲",
        "湮灭",
        1050,
        7800,
        64,
        158,
        88,
        960,
        80,
        690,
        98,
        108,
        5,
        12,
        115,
        165,
        125
      ],
      [
        "rover_spectro",
        "漂泊者·衍射",
        "衍射",
        1100,
        8000,
        58,
        146,
        80,
        900,
        90,
        730,
        100,
        110,
        5,
        12,
        110,
        150,
        125
      ],
      [
        "rover_havoc",
        "漂泊者·湮灭",
        "湮灭",
        980,
        7350,
        50,
        130,
        96,
        1020,
        76,
        640,
        102,
        114,
        5,
        20,
        100,
        135,
        125
      ],
      [
        "rover_aero",
        "漂泊者·气动",
        "气动",
        1050,
        7700,
        68,
        168,
        86,
        940,
        80,
        660,
        105,
        116,
        5,
        10,
        120,
        180,
        150
      ],
      [
        "rover_electro",
        "漂泊者·导电",
        "导电",
        1030,
        7600,
        60,
        152,
        90,
        980,
        78,
        650,
        103,
        115,
        5,
        16,
        110,
        150,
        125
      ]
    ],
    "formula": "t=(L-1)/89; G=.7t+.3t²; HP/ATK/DEF interpolate G; SP/Speed/CR/ER interpolate t; half-up integer; CR/ER 0.1%; CritDMG150%; Emax constant"
  },
  "profiles": [
    {
      "key": "amy",
      "id": "aemeath",
      "name": "爱弥斯",
      "energy_cap": 125,
      "skills": [
        {
          "id": "A",
          "name": "校准无垠",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          },
          "conditional_variants": [
            {
              "name": "机兵普攻",
              "numeric_audit": {
                "role_class": "basic",
                "damage_atk_by_bp": [
                  1.15,
                  1.61,
                  2.07,
                  2.53
                ],
                "q_by_bp": [
                  6,
                  8.1,
                  9.6,
                  10.8
                ],
                "original_attacks_by_bp": [
                  1,
                  2,
                  3,
                  4
                ],
                "sp": 0,
                "cd": 0,
                "base_energy": 15,
                "energy_cost": 0,
                "legal_by_bp": [
                  true,
                  true,
                  true,
                  true
                ],
                "rotation_access": "conditional",
                "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
              }
            }
          ]
        },
        {
          "id": "E1",
          "name": "合击·突刺",
          "numeric_audit": {
            "role_class": "damage_standard_low_q",
            "damage_atk_by_bp": [
              1.4,
              1.96,
              2.45,
              2.87
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 12,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          },
          "conditional_variants": [
            {
              "name": "机兵起手",
              "numeric_audit": {
                "role_class": "damage_standard_low_q",
                "damage_atk_by_bp": [
                  1.8,
                  2.52,
                  3.15,
                  3.69
                ],
                "q_by_bp": [
                  9,
                  12.2,
                  14.4,
                  16.2
                ],
                "original_attacks_by_bp": [
                  1,
                  1,
                  1,
                  1
                ],
                "sp": 16,
                "cd": 2,
                "base_energy": 20,
                "energy_cost": 0,
                "legal_by_bp": [
                  true,
                  true,
                  true,
                  true
                ],
                "rotation_access": "conditional",
                "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
              }
            }
          ]
        },
        {
          "id": "E2",
          "name": "重击·二段蓄力",
          "numeric_audit": {
            "role_class": "damage_q_focus",
            "damage_atk_by_bp": [
              1.6,
              2.24,
              2.8,
              3.28
            ],
            "q_by_bp": [
              14,
              18.9,
              22.4,
              25.2
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 18,
            "cd": 2,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "迅应存在时本体四档再×1.20；仅E4付费铺设得到；R1不赠。"
          },
          "conditional_variants": [
            {
              "name": "机兵二段蓄力",
              "numeric_audit": {
                "role_class": "damage_q_focus",
                "damage_atk_by_bp": [
                  2.3,
                  3.22,
                  4.025,
                  4.715
                ],
                "q_by_bp": [
                  10,
                  13.5,
                  16,
                  18
                ],
                "original_attacks_by_bp": [
                  1,
                  1,
                  1,
                  1
                ],
                "sp": 22,
                "cd": 2,
                "base_energy": 25,
                "energy_cost": 0,
                "legal_by_bp": [
                  true,
                  true,
                  true,
                  true
                ],
                "rotation_access": "conditional",
                "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
              }
            }
          ]
        },
        {
          "id": "E3",
          "name": "光翼共奏·降临/登台",
          "numeric_audit": {
            "role_class": "damage_q_focus",
            "damage_atk_by_bp": [
              2,
              2.8,
              3.5,
              4.1
            ],
            "q_by_bp": [
              16,
              21.6,
              25.6,
              28.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 24,
            "cd": 3,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "聚爆额外收益完全取公共异常已有层数，无额外免费0.60ATK；本人击破已引爆则E3后置不再爆。"
          },
          "conditional_variants": [
            {
              "name": "机兵光翼",
              "numeric_audit": {
                "role_class": "damage_q_focus",
                "damage_atk_by_bp": [
                  2.6,
                  3.64,
                  4.55,
                  5.33
                ],
                "q_by_bp": [
                  10,
                  13.5,
                  16,
                  18
                ],
                "original_attacks_by_bp": [
                  1,
                  1,
                  1,
                  1
                ],
                "sp": 24,
                "cd": 3,
                "base_energy": 25,
                "energy_cost": 0,
                "legal_by_bp": [
                  true,
                  true,
                  true,
                  true
                ],
                "rotation_access": "conditional",
                "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
              }
            }
          ]
        },
        {
          "id": "E4",
          "name": "以旋律穿越长空/携星辉降临于此",
          "numeric_audit": {
            "role_class": "mixed_setup",
            "damage_atk_by_bp": [
              1.2,
              1.68,
              2.1,
              2.46
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 10,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E5",
          "name": "沉默守护·护航",
          "numeric_audit": {
            "role_class": "support_counter_window",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 12,
            "cd": 3,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。",
            "counter_damage_reduction_by_bp": [
              0.25,
              0.35,
              0.45,
              0.55
            ],
            "counter_reduction_cap_atk_by_bp": [
              0.6,
              0.85,
              1.1,
              1.35
            ]
          }
        },
        {
          "id": "R1",
          "name": "星辉破界而来·过载",
          "numeric_audit": {
            "role_class": "mixed_r1_entry",
            "damage_atk_by_bp": [
              1.5,
              1.875,
              2.175,
              2.4
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "r1",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "R2",
          "name": "星辉破界而来·终结",
          "numeric_audit": {
            "role_class": "damage_ultimate",
            "damage_atk_by_bp": [
              null,
              null,
              null,
              3.8
            ],
            "q_by_bp": [
              null,
              null,
              null,
              16
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              1
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 0,
            "energy_cost": 0,
            "legal_by_bp": [
              false,
              false,
              false,
              true
            ],
            "rotation_access": "r2",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        }
      ]
    },
    {
      "key": "lynae",
      "id": "lynae",
      "name": "琳奈",
      "energy_cap": 125,
      "skills": [
        {
          "id": "A",
          "name": "流彩律动/绮彩巡游·普攻",
          "numeric_audit": {
            "role_class": "basic",
            "basis": "ATK",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "E1",
          "name": "琳奈式创想/加色混合",
          "numeric_audit": {
            "role_class": "pure_damage",
            "basis": "ATK",
            "damage_atk_by_bp": [
              1.65,
              2.31,
              2.8875,
              3.3825
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              12,
              16.2,
              19.2,
              21.6
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 10,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "E2",
          "name": "灵感碰撞",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "ATK",
            "damage_atk_by_bp": [
              0.9,
              1.26,
              1.575,
              1.845
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              7,
              9.5,
              11.2,
              12.6
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 12,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "E3",
          "name": "幻光折跃",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "ATK",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.75,
              2.05
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              9,
              12.2,
              14.4,
              16.2
            ],
            "original_attacks_by_bp": [
              2,
              2,
              2,
              2
            ],
            "sp": 14,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "E4",
          "name": "视觉冲击",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "ATK",
            "damage_atk_by_bp": [
              1.7,
              2.38,
              2.975,
              3.485
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 22,
            "cd": 3,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "预存颜料命中目标额外0.40ATK/目标，固定不Boost、无Q/B；追色另算。"
          }
        },
        {
          "id": "E5",
          "name": "有空一起兜风！",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "ATK",
            "damage_atk_by_bp": [
              0.6,
              0.84,
              1.05,
              1.23
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 14,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "R",
          "name": "爆炸喷涂",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "ATK",
            "damage_atk_by_bp": [
              2.2,
              2.75,
              3.19,
              3.52
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              16,
              21.6,
              25.6,
              28.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        }
      ]
    },
    {
      "key": "mornye",
      "id": "mornye",
      "name": "莫宁",
      "energy_cap": 175,
      "skills": [
        {
          "id": "A",
          "name": "基态校准/广域观测·普攻",
          "numeric_audit": {
            "role_class": "basic",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              0.9,
              1.26,
              1.62,
              1.98
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "E1",
          "name": "期望误差",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 10,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。",
            "healing": {
              "boost_channel": "healing",
              "flat_by_bp": [
                40,
                50,
                60,
                70
              ],
              "def_by_bp": [
                0.35,
                0.4375,
                0.5249999999999999,
                0.6124999999999999
              ],
              "target_count": "每名在场存活队友",
              "guard_fixed": "60%，总上限1.20DEF；反击固定1.10DEF不Boost"
            }
          }
        },
        {
          "id": "E2",
          "name": "位势转换",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              1,
              1.4,
              1.75,
              2.05
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 12,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        },
        {
          "id": "E3",
          "name": "分布式阵列",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              1.2,
              1.68,
              2.1,
              2.46
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 18,
            "cd": 3,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。",
            "healing": {
              "boost_channel": "choose_attack_or_healing",
              "flat_by_bp": [
                60,
                75,
                90,
                105
              ],
              "def_by_bp": [
                0.55,
                0.6875,
                0.8250000000000001,
                0.9625000000000001
              ],
              "attack_channel_heal_fixed": [
                60,
                0.55
              ],
              "healing_channel_damage_def_by_bp": [
                1.2,
                1.2,
                1.2,
                1.2
              ],
              "healing_channel_q_by_bp": [
                8,
                10.8,
                12.8,
                14.4
              ],
              "target_count": "每名在场存活队友"
            }
          }
        },
        {
          "id": "E4",
          "name": "反演",
          "numeric_audit": {
            "role_class": "damage_with_break_setup",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              1.65,
              2.31,
              2.8875,
              3.3825
            ],
            "q_by_bp": [
              12,
              16.2,
              19.2,
              21.6
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 16,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "无额外派生伤害；满足预存观测＋实际击破后给12%易伤2轮。"
          }
        },
        {
          "id": "E5",
          "name": "递归·支援",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 12,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。",
            "support_by_bp": [
              "12%下一次合格攻击行动",
              "15%下一次合格攻击行动",
              "18%下一次合格攻击行动",
              "20%下一次合格攻击行动"
            ]
          }
        },
        {
          "id": "R",
          "name": "临界协议",
          "numeric_audit": {
            "role_class": "mixed",
            "basis": "DEF",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "damage_def_by_bp": [
              2.3,
              2.875,
              3.335,
              3.68
            ],
            "q_by_bp": [
              16,
              21.6,
              25.6,
              28.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 175,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "仅即时本体；附伤/协同/反击另列，不假装已计入。"
          }
        }
      ]
    },
    {
      "key": "denia",
      "id": "denia",
      "name": "达妮娅",
      "energy_cap": 125,
      "skills": [
        {
          "id": "A",
          "name": "织梦的飨宴",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          },
          "conditional_variants": [
            {
              "name": "蓝色幻灭",
              "numeric_audit": {
                "role_class": "basic",
                "damage_atk_by_bp": [
                  1.15,
                  1.61,
                  2.07,
                  2.53
                ],
                "q_by_bp": [
                  6,
                  8.1,
                  9.6,
                  10.8
                ],
                "original_attacks_by_bp": [
                  1,
                  2,
                  3,
                  4
                ],
                "sp": 0,
                "cd": 0,
                "base_energy": 15,
                "energy_cost": 0,
                "legal_by_bp": [
                  true,
                  true,
                  true,
                  true
                ],
                "rotation_access": "conditional",
                "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
              }
            }
          ]
        },
        {
          "id": "E1",
          "name": "拟态泡泡",
          "numeric_audit": {
            "role_class": "mixed_grouping",
            "damage_atk_by_bp": [
              0.75,
              1.05,
              1.3125,
              1.5375
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 12,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E2",
          "name": "久疏问候！/轻叩门扉",
          "numeric_audit": {
            "role_class": "mixed_abnormal_setup",
            "damage_atk_by_bp": [
              1.3,
              1.82,
              2.275,
              2.665
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 10,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E3",
          "name": "轻唤/放逐",
          "numeric_audit": {
            "role_class": "damage_standard",
            "damage_atk_by_bp": [
              1.7,
              2.38,
              2.975,
              3.485
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 18,
            "cd": 2,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "conditional",
            "secondary_damage_notes": "轻唤副目标每人[0.4,0.56,0.7,0.82]×ATK；放逐每人[0.65,0.91,1.1375,1.3325]×ATK；最多2人；副目标Q0。主副均是同一次原始攻击，不是免费协同。"
          },
          "conditional_variants": [
            {
              "name": "放逐",
              "numeric_audit": {
                "role_class": "damage_standard",
                "damage_atk_by_bp": [
                  2.2,
                  3.08,
                  3.85,
                  4.51
                ],
                "q_by_bp": [
                  10,
                  13.5,
                  16,
                  18
                ],
                "original_attacks_by_bp": [
                  1,
                  1,
                  1,
                  1
                ],
                "sp": 24,
                "cd": 2,
                "base_energy": 25,
                "energy_cost": 0,
                "legal_by_bp": [
                  true,
                  true,
                  true,
                  true
                ],
                "rotation_access": "conditional",
                "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
              }
            }
          ]
        },
        {
          "id": "E4",
          "name": "织梦重击",
          "numeric_audit": {
            "role_class": "damage_standard",
            "damage_atk_by_bp": [
              1.45,
              2.03,
              2.5375,
              2.9725
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 14,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E5",
          "name": "幕间连景",
          "numeric_audit": {
            "role_class": "support_group_spill",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 16,
            "cd": 3,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "每名受援者一次spill=min(0.20×该次原始单体根攻击的本体税前伤害总和,0.60×达妮娅触发时ATK)。按副目标防抗结算，不暴击、B0/Q0/无异常无触发。该效果是一次性派生溅射，不称通用逐击协同。",
            "selected_allies_by_bp": [
              1,
              2,
              3,
              4
            ]
          }
        },
        {
          "id": "R1",
          "name": "帷幕终景·布景之形",
          "numeric_audit": {
            "role_class": "mixed_r1_entry",
            "damage_atk_by_bp": [
              0.9,
              1.125,
              1.305,
              1.44
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "r1",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "R2",
          "name": "帷幕终景·幻灭之形",
          "numeric_audit": {
            "role_class": "mixed_ultimate_finisher",
            "damage_atk_by_bp": [
              null,
              null,
              null,
              2.2
            ],
            "q_by_bp": [
              null,
              null,
              null,
              14
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              1
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 0,
            "energy_cost": 0,
            "legal_by_bp": [
              false,
              false,
              false,
              true
            ],
            "rotation_access": "r2",
            "secondary_damage_notes": "场固定2跳×0.45ATK/每敌；本次R2 MAX已含定价，不再吃第二份Boost；异常按明确层数与公共规则独立结算。"
          }
        }
      ]
    },
    {
      "key": "chisa",
      "id": "chisa",
      "name": "千咲",
      "energy_cap": 125,
      "skills": [
        {
          "id": "A",
          "name": "俱寂",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E1",
          "name": "解弦之眼",
          "numeric_audit": {
            "role_class": "mixed_debuff",
            "damage_atk_by_bp": [
              0.9,
              1.26,
              1.575,
              1.845
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 18,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E2",
          "name": "断命之铗",
          "numeric_audit": {
            "role_class": "mixed_attack_heal",
            "damage_atk_by_bp": [
              1.15,
              1.61,
              2.0125,
              2.3575
            ],
            "q_by_bp": [
              7,
              9.5,
              11.2,
              12.6
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 14,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "conditional",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。",
            "heal_flat_by_bp": [
              35,
              35,
              35,
              35
            ],
            "heal_atk_by_bp": [
              0.35,
              0.35,
              0.35,
              0.35
            ]
          }
        },
        {
          "id": "E3",
          "name": "齿轨轮回",
          "numeric_audit": {
            "role_class": "mixed_stance_entry",
            "damage_atk_by_bp": [
              0.9,
              1.26,
              1.575,
              1.845
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 14,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。"
          }
        },
        {
          "id": "E4",
          "name": "锯环·疾攻",
          "numeric_audit": {
            "role_class": "damage_standard",
            "damage_atk_by_bp": [
              2.1,
              2.94,
              3.675,
              4.305
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              4,
              4,
              4,
              4
            ],
            "sp": 18,
            "cd": 2,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "conditional",
            "secondary_damage_notes": "4×0.525ATK(BP0)，各档总倍率[2.1,2.94,3.675,4.305]；外部构筑可放大价值，这是其付SP/入形态后的特色。万缕一次×1.20后清除。"
          }
        },
        {
          "id": "E5",
          "name": "锯环·终结",
          "numeric_audit": {
            "role_class": "mixed_exit_shield",
            "damage_atk_by_bp": [
              2.3,
              3.22,
              4.025,
              4.715
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 22,
            "cd": 3,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "conditional",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。",
            "shield_flat_by_bp": [
              30,
              30,
              30,
              30
            ],
            "shield_atk_by_bp": [
              0.25,
              0.25,
              0.25,
              0.25
            ]
          }
        },
        {
          "id": "E6",
          "name": "解弦式第零定律",
          "numeric_audit": {
            "role_class": "support_abnormal_capacity",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 16,
            "cd": 3,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "always",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。",
            "selected_enemy_count_by_bp": [
              1,
              2,
              3,
              4
            ]
          }
        },
        {
          "id": "R",
          "name": "即刻·归无",
          "numeric_audit": {
            "role_class": "mixed_ultimate_heal",
            "damage_atk_by_bp": [
              2,
              2.5,
              2.9,
              3.2
            ],
            "q_by_bp": [
              14,
              18.9,
              22.4,
              25.2
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "rotation_access": "r",
            "secondary_damage_notes": "无未列入的附伤；外部构筑收益独立结算。",
            "heal_flat_by_bp": [
              80,
              80,
              80,
              80
            ],
            "heal_atk_by_bp": [
              0.65,
              0.65,
              0.65,
              0.65
            ]
          }
        }
      ]
    },
    {
      "key": "rover_spectro",
      "id": "rover_spectro",
      "name": "漂泊者·衍射",
      "energy_cap": 125,
      "skills": [
        {
          "skill_id": "rover_spectro_a",
          "name": "化声为形",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1,
              "element": "衍射"
            },
            {
              "index": "2..1+bp",
              "coefficient_atk": 0.4,
              "element": "衍射"
            }
          ]
        },
        {
          "skill_id": "rover_spectro_e1",
          "name": "浮声千斩",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.8,
              2.52,
              3.15,
              3.69
            ],
            "q_by_bp": [
              9,
              12.2,
              14.4,
              16.2
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 12,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.8,
              "element": "衍射",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_spectro_e2",
          "name": "浮声千斩·旋音",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              2.2,
              3.08,
              3.85,
              4.51
            ],
            "q_by_bp": [
              9,
              12.2,
              14.4,
              16.2
            ],
            "original_attacks_by_bp": [
              2,
              2,
              2,
              2
            ],
            "sp": 16,
            "cd": 3,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.1,
              "element": "衍射",
              "q_weight": 0.5
            },
            {
              "index": 2,
              "coefficient_atk": 1.1,
              "element": "衍射",
              "q_weight": 0.5
            }
          ]
        },
        {
          "skill_id": "rover_spectro_s",
          "name": "瞬刻",
          "numeric_audit": {
            "role_class": "utility",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 16,
            "cd": 3,
            "base_energy": 10,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": []
        },
        {
          "skill_id": "rover_spectro_r",
          "name": "回响奏鸣",
          "numeric_audit": {
            "role_class": "ultimate",
            "damage_atk_by_bp": [
              2.2,
              2.75,
              3.19,
              3.52
            ],
            "q_by_bp": [
              16,
              21.6,
              25.6,
              28.8
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 2.2,
              "element": "衍射",
              "q_weight": 1
            }
          ]
        }
      ]
    },
    {
      "key": "rover_havoc",
      "id": "rover_havoc",
      "name": "漂泊者·湮灭",
      "energy_cap": 125,
      "skills": [
        {
          "skill_id": "rover_havoc_a",
          "name": "裁音",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。",
            "state_overrides": {
              "dark_surge": {
                "damage_atk_by_bp": [
                  1.45,
                  2.03,
                  2.61,
                  3.19
                ],
                "attack_base_atk": 1.45,
                "additional_attack_atk": 0.58,
                "base_B": 20,
                "q_by_bp": [
                  6,
                  8.1,
                  9.6,
                  10.8
                ]
              }
            }
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1,
              "element": "湮灭"
            },
            {
              "index": "2..1+bp",
              "coefficient_atk": 0.4,
              "element": "湮灭"
            }
          ]
        },
        {
          "skill_id": "rover_havoc_e1",
          "name": "行刃／命刈",
          "numeric_audit": {
            "role_class": "standard",
            "damage_atk_by_bp": [
              2.1,
              2.94,
              3.675,
              4.305
            ],
            "q_by_bp": [
              12,
              16.2,
              19.2,
              21.6
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 12,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。",
            "state_overrides": {
              "dark_surge": {
                "name": "命刈",
                "damage_atk_by_bp": [
                  2.6,
                  3.64,
                  4.55,
                  5.33
                ],
                "attack_base_atk": 2.6,
                "base_B": 20,
                "q_by_bp": [
                  12,
                  16.2,
                  19.2,
                  21.6
                ]
              }
            }
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 2.1,
              "element": "湮灭",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_havoc_e2",
          "name": "重击·鸣破",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.8,
              2.52,
              3.15,
              3.69
            ],
            "q_by_bp": [
              9,
              12.2,
              14.4,
              16.2
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 18,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.8,
              "element": "湮灭",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_havoc_s",
          "name": "唤声",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 20,
            "cd": 3,
            "base_energy": 10,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "每目标最多2次，每跳0.9×Boost；敌人未完成主行动可能少跳。B10仅施法根一次，所有场伤B0Q0。",
            "delayed_total_damage_atk_by_bp": [
              1.8,
              2.52,
              3.15,
              3.69
            ]
          },
          "attack_sequence": []
        },
        {
          "skill_id": "rover_havoc_r",
          "name": "临渊死寂",
          "numeric_audit": {
            "role_class": "ultimate",
            "damage_atk_by_bp": [
              4,
              5,
              5.8,
              6.4
            ],
            "q_by_bp": [
              18,
              24.3,
              28.8,
              32.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 4,
              "element": "湮灭",
              "q_weight": 1
            }
          ]
        }
      ]
    },
    {
      "key": "rover_aero",
      "id": "rover_aero",
      "name": "漂泊者·气动",
      "energy_cap": 150,
      "skills": [
        {
          "skill_id": "rover_aero_a",
          "name": "刻雾裁风",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1,
              "element": "气动"
            },
            {
              "index": "2..1+bp",
              "coefficient_atk": 0.4,
              "element": "气动"
            }
          ]
        },
        {
          "skill_id": "rover_aero_e1",
          "name": "苍息破象·抃风儛润",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.3,
              1.82,
              2.275,
              2.665
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 16,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。",
            "healing_by_bp": [
              {
                "atk": 0.4,
                "caster_max_hp": 0.02,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              },
              {
                "atk": 0.48,
                "caster_max_hp": 0.024,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              },
              {
                "atk": 0.56,
                "caster_max_hp": 0.028,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              },
              {
                "atk": 0.64,
                "caster_max_hp": 0.032,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              }
            ]
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.3,
              "element": "气动",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_aero_e2",
          "name": "缥缈无相",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              2.6,
              3.64,
              4.55,
              5.33
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              2,
              2,
              2,
              2
            ],
            "sp": 20,
            "cd": 3,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.3,
              "element": "气动",
              "q_weight": 0.5
            },
            {
              "index": 2,
              "coefficient_atk": 1.3,
              "element": "气动",
              "q_weight": 0.5
            }
          ]
        },
        {
          "skill_id": "rover_aero_e3",
          "name": "碧霄断行",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.5,
              2.1,
              2.625,
              3.075
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 14,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.5,
              "element": "气动",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_aero_s",
          "name": "蚀境象",
          "numeric_audit": {
            "role_class": "utility",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 16,
            "cd": 3,
            "base_energy": 10,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": []
        },
        {
          "skill_id": "rover_aero_r",
          "name": "万象归墟",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.4,
              1.75,
              2.03,
              2.24
            ],
            "q_by_bp": [
              12,
              16.2,
              19.2,
              21.6
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 150,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。",
            "healing_by_bp": [
              {
                "atk": 1,
                "caster_max_hp": 0.05,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              },
              {
                "atk": 1.2,
                "caster_max_hp": 0.06,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              },
              {
                "atk": 1.4,
                "caster_max_hp": 0.07,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              },
              {
                "atk": 1.6,
                "caster_max_hp": 0.08,
                "flat": 0,
                "recipient": "每位在场存活友方含本人",
                "applications": 1
              }
            ]
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.4,
              "element": "气动",
              "q_weight": 1
            }
          ]
        }
      ]
    },
    {
      "key": "rover_electro",
      "id": "rover_electro",
      "name": "漂泊者·导电",
      "energy_cap": 125,
      "skills": [
        {
          "skill_id": "rover_electro_a",
          "name": "止戈",
          "numeric_audit": {
            "role_class": "basic",
            "damage_atk_by_bp": [
              1,
              1.4,
              1.8,
              2.2
            ],
            "q_by_bp": [
              6,
              8.1,
              9.6,
              10.8
            ],
            "original_attacks_by_bp": [
              1,
              2,
              3,
              4
            ],
            "sp": 0,
            "cd": 0,
            "base_energy": 15,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1,
              "element": "导电"
            },
            {
              "index": "2..1+bp",
              "coefficient_atk": 0.4,
              "element": "导电"
            }
          ]
        },
        {
          "skill_id": "rover_electro_e1",
          "name": "雷引",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              2,
              2.8,
              3.5,
              4.1
            ],
            "q_by_bp": [
              10,
              13.5,
              16,
              18
            ],
            "original_attacks_by_bp": [
              2,
              2,
              2,
              2
            ],
            "sp": 12,
            "cd": 2,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.2,
              "element": "导电",
              "q_weight": 0.6
            },
            {
              "index": 2,
              "coefficient_atk": 0.8,
              "element": "导电",
              "q_weight": 0.4
            }
          ]
        },
        {
          "skill_id": "rover_electro_e2a",
          "name": "超负荷·援阵",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.8,
              2.52,
              3.15,
              3.69
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 18,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.8,
              "element": "导电",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_electro_e2b",
          "name": "超负荷·临界",
          "numeric_audit": {
            "role_class": "mixed",
            "damage_atk_by_bp": [
              1.6,
              2.24,
              2.8,
              3.28
            ],
            "q_by_bp": [
              8,
              10.8,
              12.8,
              14.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 24,
            "cd": 3,
            "base_energy": 20,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.6,
              "element": "导电",
              "q_weight": 1
            }
          ]
        },
        {
          "skill_id": "rover_electro_e1_state",
          "name": "千声翻涌",
          "numeric_audit": {
            "role_class": "standard",
            "damage_atk_by_bp": [
              3.6,
              5.04,
              6.3,
              7.38
            ],
            "q_by_bp": [
              12,
              16.2,
              19.2,
              21.6
            ],
            "original_attacks_by_bp": [
              4,
              4,
              4,
              4
            ],
            "sp": 16,
            "cd": 1,
            "base_energy": 25,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 1.2,
              "element": "衍射",
              "q_weight": 0.3
            },
            {
              "index": 2,
              "coefficient_atk": 1.2,
              "element": "湮灭",
              "q_weight": 0.3
            },
            {
              "index": 3,
              "coefficient_atk": 0.6,
              "element": "气动",
              "q_weight": 0.2
            },
            {
              "index": 4,
              "coefficient_atk": 0.6,
              "element": "导电",
              "q_weight": 0.2
            }
          ]
        },
        {
          "skill_id": "rover_electro_s",
          "name": "殷殷其雷",
          "numeric_audit": {
            "role_class": "utility",
            "damage_atk_by_bp": [
              0,
              0,
              0,
              0
            ],
            "q_by_bp": [
              0,
              0,
              0,
              0
            ],
            "original_attacks_by_bp": [
              0,
              0,
              0,
              0
            ],
            "sp": 16,
            "cd": 3,
            "base_energy": 10,
            "energy_cost": 0,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。",
            "sp_recovery_by_bp": [
              12,
              16,
              20,
              24
            ]
          },
          "attack_sequence": []
        },
        {
          "skill_id": "rover_electro_r",
          "name": "最终战略",
          "numeric_audit": {
            "role_class": "ultimate",
            "damage_atk_by_bp": [
              2.4,
              3,
              3.48,
              3.84
            ],
            "q_by_bp": [
              18,
              24.3,
              28.8,
              32.4
            ],
            "original_attacks_by_bp": [
              1,
              1,
              1,
              1
            ],
            "sp": 0,
            "cd": 3,
            "base_energy": 0,
            "energy_cost": 125,
            "legal_by_bp": [
              true,
              true,
              true,
              true
            ],
            "secondary_damage_notes": "外部附伤/协同另依自身卡面，异常DoT不随本次Boost，不计入本体倍率。"
          },
          "attack_sequence": [
            {
              "index": 1,
              "coefficient_atk": 2.4,
              "element": "导电",
              "q_weight": 1
            }
          ]
        }
      ]
    }
  ]
};

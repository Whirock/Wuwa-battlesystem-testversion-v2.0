# 四敌私人视觉接入阶段

原有定义PROTO_RAIDER / 突击体、PROTO_SHOOTER / 散射体、PROTO_CORE / 试验核心、PROTO_BULWARK / 护壁体保留原名、属性、技能、AI和规则。每敌B/D各static PNG与540ms hit GIF。图库夜归男女只有visualVariant，没有NPC定义注册；护壁体只绑定已存在的PROTO_BULWARK定义。

真实引擎合法攻击HP损失驱动四敌static→hit→static；完全被既有护盾fixture吸收时不显示HP红字，不播hit。此fixture不新增敌人护盾能力。重复受击重播；快速B/D切换取消旧计时器和旧load回调，不改快照。cast未制作，保持静态不假动作。

16份私人运行资源来自已通过索引；每PNG和对应GIF解码首末帧RGBA完全相等。Boss按主体中心和悬浮基准；散射体按下轮廓；不用人体足底套悬浮单位。真实浏览器布局、播放、无闪、Windows仍未验收。

Gallery独立展示54/60角色GIF＋六单位12PNG/12hitGIF。护壁体grounded_v6已通过阶段QA；B在160px检查约1.27px脚部残差，D约0.12px，披露为有限通过，不称零漂移；旧失败诊断不嵌入。角色六缺项仍禁用。私有图片排除源码清单和ZIP，不向公开仓库发布。Git受限链没有重试。

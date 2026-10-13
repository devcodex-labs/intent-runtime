# Schema、字段和多轮修改

真实 `schema-dsl@3.0.4` 的 `s({...})`、ObjectDslBuilder 或 JSON Schema 均可作为配置。Builder 使用完整 `toSchema()` 声明，保留 strictSchema/requiredAll；普通 Context 拒绝 Proxy、函数、访问器、循环、非有限数字和非 JSON 对象。

顶层 `fields` 为 `[]`、字段名数组或 `'all'`。选择父字段返回完整合法的嵌套值；无效数组保留原索引路径，不删坏项后伪装成功。未选依赖仅内部检查，不新写入 inputs。没有操作意图的所选事实放在 turn.facts。扩展仅按 extensionSchema 和 output.extensions 处理。

| 定义范围 | 行为 |
|---|---|
| Draft-07 类型、properties、required、requiredAll、strictSchema、patternProperties、propertyNames、additionalProperties | 保留声明规则和属性存在性 |
| 字符串/数字约束、enum/const、已声明格式 | 实际 Validator 验证，不补默认、不强制转换 |
| items/tuple/additionalItems/contains/uniqueItems、数组长度 | 校验完整数组与嵌套路径 |
| allOf/anyOf/oneOf/not、if/then/else、dependencies | 保留原子组合与必要依赖，不只切 properties |
| 同文档 fragment $ref、nested $id | 使用原引用环境；不访问网络 |
| description/_description | 同次模型解释语义约束；缺依赖或无法判定保留 unknown，类型通过不能代替语义判断 |
| title/label/examples/default/已知 DSL 元数据 | 注解不是用户事实，不运行外查函数 |
| 外部/递归引用、其他方言或执行性规则 | 配置阶段明确拒绝；不偷偷剥离 |

有限依赖世界区分不存在、明确存在但值未知、存在性未知和明确值。全部合法才 present，全部非法为 invalid，有合法及非法世界为 unknown/FIELD_DEPENDENCY_MISSING；没有可靠完整证明路径为 FIELD_VALIDATION_UNDETERMINED。null、false、0、空字符串不是缺失。

例如 VIP=true、discount=15 可提取；下一轮只改 VIP=false，旧优惠 15 会失效；再选择 discount 并给 5，可解除问题。直接改变未选旧字段会移除旧值，但不提取未选替代值。未变化、未选择的继承值保留，不声称本轮重新验证。

# Schema、字段和多轮修改

`schema-dsl@3.0.4` 的 `s({...})`、ObjectDslBuilder 或 JSON Schema 均可作为配置。Builder可直接传入，无需手动转换；JSON Schema需保留strictSchema/requiredAll等适用声明。Context接收普通JSON数据，不接受Proxy、函数、访问器、循环或非有限数字。

顶层 `fields` 为 `[]`、字段名数组或 `'all'`。选择父字段返回完整合法的嵌套值；无效数组保留原索引路径，不删坏项后伪装成功。未选依赖仅内部检查，不新写入 inputs。没有操作意图的所选事实放在 turn.facts。扩展仅按 extensionSchema 和 output.extensions 处理。

| 定义范围 | 行为 |
|---|---|
| Draft-07 类型、properties、required、requiredAll、strictSchema、patternProperties、propertyNames、additionalProperties | 保留声明规则和属性存在性 |
| 字符串/数字约束、enum/const、已声明格式 | 实际 Validator 验证，不补默认、不强制转换 |
| items/tuple/additionalItems/contains/uniqueItems、数组长度 | 校验完整数组与嵌套路径 |
| allOf/anyOf/oneOf/not、if/then/else、dependencies | 组合与跨字段依赖整体生效，选择一个字段也不会删除关联规则 |
| 同文档 fragment $ref、nested $id | 使用原引用环境；不访问网络 |
| description/_description | 同次模型解释语义约束；缺依赖或无法判定保留 unknown，类型通过不能代替语义判断 |
| title/label/examples/default/已知 DSL 元数据 | 注解不是用户事实，不运行外查函数 |
| 外部/递归引用、其他方言或执行性规则 | 配置阶段明确拒绝；不偷偷剥离 |

依赖缺失时不默认取某个条件分支。已知字段值在所有可能依赖状态下都合法才可确认；已确定非法为invalid，合法性取决于尚未提供信息时为unknown/FIELD_DEPENDENCY_MISSING。当前校验范围无法可靠确定规则结果时为FIELD_VALIDATION_UNDETERMINED。不存在、存在但值未知与存在性未知分别处理；null、false、0、空字符串不是缺失。

## 格式与定义边界

支持的format固定为：date、time、date-time、duration、email、hostname、ipv4、ipv6、uri、uri-reference、uuid、regex、json-pointer、relative-json-pointer。验证遵循schema-dsl@3.0.4，不进行DNS/URL查询。其他格式报SCHEMA_UNSUPPORTED_FOR_EXTRACTION。

省略$schema按Draft-07处理；根必须是带properties的对象，嵌套可用布尔Schema。声明式s.if/s.match字段选择与JSON/DSL分支可用；函数式ConditionalBuilder、custom回调、插件执行规则不支持。其他方言的$defs、prefixItems、unevaluatedProperties等不忽略，构造时明确拒绝。定义结构错误为SCHEMA_INVALID；有效但超出支持范围为SCHEMA_UNSUPPORTED_FOR_EXTRACTION。即使未选字段，也会检查定义。

空字段定义配all等同无字段选择。新提取只限所选顶层字段；fields=[]不是清空所有继承值。字段状态及值能否保留见[完整响应](/api/response)，跨轮材料见[多轮对话](/guide/multi-turn)。

例如 VIP=true、discount=15 可提取；下一轮只改 VIP=false，旧优惠 15 会失效；再选择 discount 并给 5，可解除问题。直接改变未选旧字段会移除旧值，但不提取未选替代值。未变化、未选择的继承值保留，不声称本轮重新验证。

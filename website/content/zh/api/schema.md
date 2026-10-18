# Schema 支持范围

用本页核对业务字段规则能否配置、何时会拒绝、什么时候保留未知。第一次提取订单号请先看[字段教程](/zh/guide/fields)。

## 可使用的定义

`schema-dsl@3.0.4` 的 `s({...})`、ObjectDslBuilder 或 JSON Schema 均可传入 schema/extensionSchema。Builder 可直接传入；JSON Schema 保留 strictSchema/requiredAll 等适用声明。业务 Schema 与只验证最终响应形状的 INTENT_RESULT_SCHEMA 用途不同。

## 支持范围

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

## 选择与取值

fields 为 []、顶层字段名数组或 all；只有所选业务字段参与新提取。选择父字段返回完整合法嵌套值，数组问题保留原始索引；未选依赖可内部校验，但不额外写入 inputs。fields=[] 不清空未变化的继承值。Schema 的 default/examples/描述不是用户已经提供的事实。

## 不支持时怎样处理

SCHEMA_INVALID 表示定义不合法；SCHEMA_UNSUPPORTED_FOR_EXTRACTION 表示定义超出上述支持范围；fields非空但未配置Schema为SCHEMA_NOT_CONFIGURED。修复定义后创建新实例，重复相同调用不会修好配置。FIELD_VALIDATION_UNDETERMINED也不保证靠补更多输入能解决，见[错误与恢复](/zh/api/errors)。

取值按[字段状态](/zh/api/response#状态与消费规则)判断；需要按条件改变旧参数时看[多轮识别](/zh/guide/multi-turn)。

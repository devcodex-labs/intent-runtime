export default {
  mode: 'host',
  instances: {orders: {language: 'zh-CN', schema: {
    type: 'object',
    properties: {orderId: {type: 'string', description: '用户明确提供的订单编号，保留前导零；仅适用于订单意图'}},
  }}},
};

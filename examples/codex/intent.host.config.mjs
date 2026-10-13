import {s} from 'schema-dsl/pure';
export default {
  mode: 'host',
  instances: {orders: {language: 'zh-CN', schema: s({orderId: s('string!').description('用户明确提供的订单编号，保留前导零；仅适用于订单意图')})}},
};

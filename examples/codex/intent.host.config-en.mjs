export default {
  mode: 'host',
  instances: {orders: {language: 'en', schema: {
    type: 'object',
    properties: {orderId: {type: 'string', description: 'An order ID explicitly supplied by the user; preserve leading zeros; applies only to order intents'}},
  }}},
};

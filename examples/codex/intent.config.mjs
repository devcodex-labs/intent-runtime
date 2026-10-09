import { s } from "schema-dsl/pure";
export default {
  instances: {
    orders: {
      schema: s({
        orderId: s("string!").description(
          "The order identifier in the current effective request. Preserve leading zeros exactly; do not guess.",
        ),
      }),
    },
  },
};

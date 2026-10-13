// Generated from public and candidate TypeScript types; run npm run schema:generate.
export const INTENT_RESULT_SCHEMA = {
  "type": "object",
  "properties": {
    "schemaVersion": {
      "type": "string",
      "const": "2.0-draft.6"
    },
    "input": {
      "type": "string"
    },
    "status": {
      "enum": [
        "complete",
        "partial"
      ],
      "type": "string"
    },
    "turn": {
      "type": "object",
      "properties": {
        "kind": {
          "enum": [
            "amendment",
            "answer",
            "confirmation",
            "mixed",
            "rejection",
            "request",
            "statement",
            "unclear",
            "withdrawal"
          ],
          "type": "string"
        },
        "normalizedInput": {
          "type": "string"
        },
        "intentIds": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "changes": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D0"
          }
        },
        "facts": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "changes",
        "facts",
        "intentIds",
        "kind",
        "normalizedInput"
      ]
    },
    "effective": {
      "type": "object",
      "properties": {
        "schemaVersion": {
          "type": "string",
          "const": "2.0-draft.6"
        },
        "coverage": {
          "enum": [
            "complete",
            "partial",
            "unavailable"
          ],
          "type": "string"
        },
        "scope": {
          "enum": [
            "current_request",
            "provided_materials"
          ],
          "type": "string"
        },
        "intents": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D7"
          }
        },
        "constraints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "kind": {
                "enum": [
                  "precondition",
                  "preference",
                  "prohibition",
                  "requirement"
                ],
                "type": "string"
              },
              "text": {
                "type": "string"
              },
              "scope": {
                "$ref": "#/definitions/D4"
              },
              "expression": {
                "$ref": "#/definitions/D5"
              }
            },
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "scope",
              "text"
            ]
          }
        },
        "unresolved": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "relations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "fromId": {
                "type": "string"
              },
              "toId": {
                "type": "string"
              },
              "kind": {
                "enum": [
                  "before",
                  "conditional",
                  "depends_on",
                  "exclusive",
                  "parallel"
                ],
                "type": "string"
              },
              "condition": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "fromId",
              "id",
              "kind",
              "toId"
            ]
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "constraints",
        "coverage",
        "intents",
        "relations",
        "schemaVersion",
        "scope",
        "unresolved"
      ]
    },
    "fieldResults": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "container": {
            "enum": [
              "extensions",
              "facts",
              "inputs"
            ],
            "type": "string"
          },
          "intentId": {
            "allOf": [
              {
                "anyOf": [
                  {
                    "type": "null"
                  },
                  {
                    "type": "string"
                  }
                ]
              }
            ]
          },
          "field": {
            "type": "string"
          },
          "path": {
            "type": "string"
          },
          "trigger": {
            "enum": [
              "invalidation",
              "selection"
            ],
            "type": "string"
          },
          "status": {
            "enum": [
              "explicit_null",
              "invalid",
              "invalidated",
              "not_applicable",
              "not_provided",
              "present",
              "removed",
              "unknown"
            ],
            "type": "string"
          },
          "explanation": {
            "type": "string"
          },
          "rawText": {
            "type": "string"
          },
          "sourceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "container",
          "field",
          "intentId",
          "path",
          "status",
          "trigger"
        ]
      }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "container": {
            "enum": [
              "extensions",
              "facts",
              "inputs"
            ],
            "type": "string"
          },
          "id": {
            "type": "string"
          },
          "code": {
            "type": "string"
          },
          "category": {
            "enum": [
              "ambiguity",
              "conflict",
              "context",
              "data",
              "missing"
            ],
            "type": "string"
          },
          "message": {
            "type": "string"
          },
          "intentId": {
            "type": "string"
          },
          "field": {
            "type": "string"
          },
          "path": {
            "type": "string"
          },
          "sourceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          },
          "candidates": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "intentId": {
                  "type": "string"
                },
                "sourceRefs": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "root": {
                        "enum": [
                          "baseline",
                          "context",
                          "extensionSchema",
                          "input",
                          "referenceTime",
                          "schema",
                          "semantics"
                        ],
                        "type": "string"
                      },
                      "pointer": {
                        "type": "string"
                      },
                      "quote": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "pointer",
                      "root"
                    ]
                  }
                }
              },
              "additionalProperties": false,
              "required": [
                "description",
                "id",
                "sourceRefs"
              ]
            }
          },
          "questions": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "question": {
                  "type": "string"
                },
                "optionIds": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              },
              "additionalProperties": false,
              "required": [
                "question"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "category",
          "code",
          "id",
          "message"
        ]
      }
    },
    "inferences": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target": {
            "type": "string"
          },
          "candidate": {
            "$ref": "#/definitions/D3"
          },
          "explanation": {
            "type": "string"
          },
          "sourceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "explanation",
          "sourceRefs",
          "target"
        ]
      }
    },
    "suggestions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": {
            "enum": [
              "clarification",
              "conflict_warning",
              "semantic_improvement"
            ],
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "relatesTo": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "kind",
          "text"
        ]
      }
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target": {
            "type": "string"
          },
          "sourceRefs": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "sourceRefs",
          "target"
        ]
      }
    },
    "diagnostics": {
      "type": "object",
      "properties": {
        "durationMs": {
          "type": "number"
        },
        "modelCallCount": {
          "type": "number"
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": [
    "effective",
    "fieldResults",
    "inferences",
    "input",
    "issues",
    "schemaVersion",
    "status",
    "turn"
  ],
  "definitions": {
    "D0": {
      "anyOf": [
        {
          "additionalProperties": false,
          "type": "object",
          "properties": {
            "operation": {
              "enum": [
                "add",
                "confirm",
                "modify",
                "reject",
                "withdraw"
              ],
              "type": "string"
            },
            "target": {
              "$ref": "#/definitions/D1"
            },
            "description": {
              "type": "string"
            },
            "sourceRefs": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "root": {
                    "enum": [
                      "baseline",
                      "context",
                      "extensionSchema",
                      "input",
                      "referenceTime",
                      "schema",
                      "semantics"
                    ],
                    "type": "string"
                  },
                  "pointer": {
                    "type": "string"
                  },
                  "quote": {
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "pointer",
                  "root"
                ]
              }
            },
            "effect": {
              "type": "string",
              "const": "applied"
            },
            "deltas": {
              "type": "array",
              "items": {
                "$ref": "#/definitions/D2"
              }
            }
          },
          "required": [
            "description",
            "effect",
            "operation",
            "sourceRefs",
            "target"
          ]
        },
        {
          "additionalProperties": false,
          "type": "object",
          "properties": {
            "operation": {
              "enum": [
                "add",
                "confirm",
                "modify",
                "reject",
                "withdraw"
              ],
              "type": "string"
            },
            "target": {
              "$ref": "#/definitions/D1"
            },
            "description": {
              "type": "string"
            },
            "sourceRefs": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "root": {
                    "enum": [
                      "baseline",
                      "context",
                      "extensionSchema",
                      "input",
                      "referenceTime",
                      "schema",
                      "semantics"
                    ],
                    "type": "string"
                  },
                  "pointer": {
                    "type": "string"
                  },
                  "quote": {
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "pointer",
                  "root"
                ]
              }
            },
            "effect": {
              "type": "string",
              "const": "conditional"
            },
            "conditionId": {
              "type": "string"
            }
          },
          "required": [
            "conditionId",
            "description",
            "effect",
            "operation",
            "sourceRefs",
            "target"
          ]
        },
        {
          "additionalProperties": false,
          "type": "object",
          "properties": {
            "operation": {
              "enum": [
                "add",
                "confirm",
                "modify",
                "reject",
                "withdraw"
              ],
              "type": "string"
            },
            "target": {
              "$ref": "#/definitions/D1"
            },
            "description": {
              "type": "string"
            },
            "sourceRefs": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "root": {
                    "enum": [
                      "baseline",
                      "context",
                      "extensionSchema",
                      "input",
                      "referenceTime",
                      "schema",
                      "semantics"
                    ],
                    "type": "string"
                  },
                  "pointer": {
                    "type": "string"
                  },
                  "quote": {
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "pointer",
                  "root"
                ]
              }
            },
            "effect": {
              "type": "string",
              "const": "unresolved"
            },
            "conditionId": {
              "type": "string"
            }
          },
          "required": [
            "description",
            "effect",
            "operation",
            "sourceRefs",
            "target"
          ]
        }
      ]
    },
    "D1": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "enum": [
                "constraint",
                "intent",
                "relation"
              ],
              "type": "string"
            },
            "id": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "id",
            "kind"
          ]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "type": "string",
              "const": "unresolved"
            },
            "description": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "description",
            "kind"
          ]
        }
      ]
    },
    "D2": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "path": {
              "type": "string"
            },
            "operation": {
              "type": "string",
              "const": "set"
            },
            "before": {
              "$ref": "#/definitions/D3"
            },
            "after": {
              "$ref": "#/definitions/D3"
            }
          },
          "additionalProperties": false,
          "required": [
            "after",
            "operation",
            "path"
          ]
        },
        {
          "type": "object",
          "properties": {
            "path": {
              "type": "string"
            },
            "operation": {
              "type": "string",
              "const": "remove"
            },
            "before": {
              "$ref": "#/definitions/D3"
            }
          },
          "additionalProperties": false,
          "required": [
            "operation",
            "path"
          ]
        }
      ]
    },
    "D3": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D3"
          }
        },
        {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        },
        {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                },
                {
                  "type": "number"
                },
                {
                  "type": "boolean"
                }
              ]
            }
          ]
        }
      ]
    },
    "D4": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "global"
            }
          },
          "additionalProperties": false,
          "required": [
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "enum": [
                "intent",
                "phase"
              ],
              "type": "string"
            },
            "intentId": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "target"
            },
            "intentId": {
              "type": "string"
            },
            "referenceId": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "referenceId",
            "type"
          ]
        }
      ]
    },
    "D5": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "comparison"
            },
            "left": {
              "$ref": "#/definitions/D6"
            },
            "operator": {
              "enum": [
                "eq",
                "gt",
                "gte",
                "lt",
                "lte",
                "neq"
              ],
              "type": "string"
            },
            "right": {
              "$ref": "#/definitions/D6"
            }
          },
          "additionalProperties": false,
          "required": [
            "left",
            "operator",
            "right",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "enum": [
                "all",
                "any"
              ],
              "type": "string"
            },
            "items": {
              "type": "array",
              "items": {
                "$ref": "#/definitions/D5"
              }
            }
          },
          "additionalProperties": false,
          "required": [
            "items",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "not"
            },
            "item": {
              "$ref": "#/definitions/D5"
            }
          },
          "additionalProperties": false,
          "required": [
            "item",
            "type"
          ]
        }
      ]
    },
    "D6": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "literal"
            },
            "value": {
              "$ref": "#/definitions/D3"
            }
          },
          "additionalProperties": false,
          "required": [
            "type",
            "value"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "input"
            },
            "intentId": {
              "type": "string"
            },
            "path": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "path",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "source"
            },
            "ref": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          },
          "additionalProperties": false,
          "required": [
            "ref",
            "type"
          ]
        }
      ]
    },
    "D7": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "domain": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "action": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "target": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "goal": {
          "type": "string"
        },
        "understanding": {
          "enum": [
            "ambiguous",
            "clear",
            "conflicted",
            "incomplete"
          ],
          "type": "string"
        },
        "constraints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "kind": {
                "enum": [
                  "precondition",
                  "preference",
                  "prohibition",
                  "requirement"
                ],
                "type": "string"
              },
              "text": {
                "type": "string"
              },
              "scope": {
                "$ref": "#/definitions/D4"
              },
              "expression": {
                "$ref": "#/definitions/D5"
              }
            },
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "scope",
              "text"
            ]
          }
        },
        "inputs": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        },
        "optional": {
          "type": "boolean"
        },
        "expectedOutput": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "references": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "kind": {
                "enum": [
                  "entity",
                  "intent",
                  "source"
                ],
                "type": "string"
              },
              "ref": {
                "allOf": [
                  {
                    "anyOf": [
                      {
                        "type": "null"
                      },
                      {
                        "type": "string"
                      }
                    ]
                  }
                ]
              },
              "resolved": {
                "type": "boolean"
              },
              "description": {
                "type": "string"
              },
              "sourceRefs": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "root": {
                      "enum": [
                        "baseline",
                        "context",
                        "extensionSchema",
                        "input",
                        "referenceTime",
                        "schema",
                        "semantics"
                      ],
                      "type": "string"
                    },
                    "pointer": {
                      "type": "string"
                    },
                    "quote": {
                      "type": "string"
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "pointer",
                    "root"
                  ]
                }
              }
            },
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "ref",
              "resolved"
            ]
          }
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D7"
          }
        },
        "extensions": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "action",
        "children",
        "constraints",
        "domain",
        "extensions",
        "goal",
        "id",
        "inputs",
        "references",
        "target",
        "understanding"
      ]
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
} as const;
export const BASELINE_SCHEMA = {
  "type": "object",
  "properties": {
    "schemaVersion": {
      "type": "string",
      "const": "2.0-draft.6"
    },
    "coverage": {
      "enum": [
        "complete",
        "partial",
        "unavailable"
      ],
      "type": "string"
    },
    "scope": {
      "enum": [
        "current_request",
        "provided_materials"
      ],
      "type": "string"
    },
    "intents": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D4"
      }
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "kind": {
            "enum": [
              "precondition",
              "preference",
              "prohibition",
              "requirement"
            ],
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "scope": {
            "$ref": "#/definitions/D0"
          },
          "expression": {
            "$ref": "#/definitions/D1"
          }
        },
        "additionalProperties": false,
        "required": [
          "id",
          "kind",
          "scope",
          "text"
        ]
      }
    },
    "unresolved": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "relations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "fromId": {
            "type": "string"
          },
          "toId": {
            "type": "string"
          },
          "kind": {
            "enum": [
              "before",
              "conditional",
              "depends_on",
              "exclusive",
              "parallel"
            ],
            "type": "string"
          },
          "condition": {
            "type": "string"
          }
        },
        "additionalProperties": false,
        "required": [
          "fromId",
          "id",
          "kind",
          "toId"
        ]
      }
    }
  },
  "additionalProperties": false,
  "required": [
    "constraints",
    "coverage",
    "intents",
    "relations",
    "schemaVersion",
    "scope",
    "unresolved"
  ],
  "definitions": {
    "D0": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "global"
            }
          },
          "additionalProperties": false,
          "required": [
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "enum": [
                "intent",
                "phase"
              ],
              "type": "string"
            },
            "intentId": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "target"
            },
            "intentId": {
              "type": "string"
            },
            "referenceId": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "referenceId",
            "type"
          ]
        }
      ]
    },
    "D1": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "comparison"
            },
            "left": {
              "$ref": "#/definitions/D2"
            },
            "operator": {
              "enum": [
                "eq",
                "gt",
                "gte",
                "lt",
                "lte",
                "neq"
              ],
              "type": "string"
            },
            "right": {
              "$ref": "#/definitions/D2"
            }
          },
          "additionalProperties": false,
          "required": [
            "left",
            "operator",
            "right",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "enum": [
                "all",
                "any"
              ],
              "type": "string"
            },
            "items": {
              "type": "array",
              "items": {
                "$ref": "#/definitions/D1"
              }
            }
          },
          "additionalProperties": false,
          "required": [
            "items",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "not"
            },
            "item": {
              "$ref": "#/definitions/D1"
            }
          },
          "additionalProperties": false,
          "required": [
            "item",
            "type"
          ]
        }
      ]
    },
    "D2": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "literal"
            },
            "value": {
              "$ref": "#/definitions/D3"
            }
          },
          "additionalProperties": false,
          "required": [
            "type",
            "value"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "input"
            },
            "intentId": {
              "type": "string"
            },
            "path": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "path",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "source"
            },
            "ref": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          },
          "additionalProperties": false,
          "required": [
            "ref",
            "type"
          ]
        }
      ]
    },
    "D3": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D3"
          }
        },
        {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        },
        {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                },
                {
                  "type": "number"
                },
                {
                  "type": "boolean"
                }
              ]
            }
          ]
        }
      ]
    },
    "D4": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "domain": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "action": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "target": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "goal": {
          "type": "string"
        },
        "understanding": {
          "enum": [
            "ambiguous",
            "clear",
            "conflicted",
            "incomplete"
          ],
          "type": "string"
        },
        "constraints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "kind": {
                "enum": [
                  "precondition",
                  "preference",
                  "prohibition",
                  "requirement"
                ],
                "type": "string"
              },
              "text": {
                "type": "string"
              },
              "scope": {
                "$ref": "#/definitions/D0"
              },
              "expression": {
                "$ref": "#/definitions/D1"
              }
            },
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "scope",
              "text"
            ]
          }
        },
        "inputs": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        },
        "optional": {
          "type": "boolean"
        },
        "expectedOutput": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "references": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "kind": {
                "enum": [
                  "entity",
                  "intent",
                  "source"
                ],
                "type": "string"
              },
              "ref": {
                "allOf": [
                  {
                    "anyOf": [
                      {
                        "type": "null"
                      },
                      {
                        "type": "string"
                      }
                    ]
                  }
                ]
              },
              "resolved": {
                "type": "boolean"
              },
              "description": {
                "type": "string"
              },
              "sourceRefs": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "root": {
                      "enum": [
                        "baseline",
                        "context",
                        "extensionSchema",
                        "input",
                        "referenceTime",
                        "schema",
                        "semantics"
                      ],
                      "type": "string"
                    },
                    "pointer": {
                      "type": "string"
                    },
                    "quote": {
                      "type": "string"
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "pointer",
                    "root"
                  ]
                }
              }
            },
            "additionalProperties": false,
            "required": [
              "id",
              "kind",
              "ref",
              "resolved"
            ]
          }
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D4"
          }
        },
        "extensions": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D3"
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "action",
        "children",
        "constraints",
        "domain",
        "extensions",
        "goal",
        "id",
        "inputs",
        "references",
        "target",
        "understanding"
      ]
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
} as const;
export const CANDIDATE_SCHEMA = {
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "const": "candidate-2"
    },
    "kind": {
      "enum": [
        "amendment",
        "answer",
        "confirmation",
        "mixed",
        "rejection",
        "request",
        "statement",
        "unclear",
        "withdrawal"
      ],
      "type": "string"
    },
    "normalizedInput": {
      "type": "string"
    },
    "relatedKeys": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "historyCoverage": {
      "enum": [
        "complete",
        "partial",
        "unavailable"
      ],
      "type": "string"
    },
    "usedHistory": {
      "type": "boolean"
    },
    "messages": {
      "$ref": "#/definitions/D0"
    },
    "nodes": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D1"
      }
    },
    "constraints": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D2"
      }
    },
    "references": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D3"
      }
    },
    "relations": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D4"
      }
    },
    "priorTargets": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": {
            "enum": [
              "constraint",
              "intent",
              "relation"
            ],
            "type": "string"
          },
          "key": {
            "type": "string"
          },
          "priorRef": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        },
        "additionalProperties": false,
        "required": [
          "key",
          "kind",
          "priorRef"
        ]
      }
    },
    "changes": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D5"
      }
    },
    "observations": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/D6"
      }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string"
          },
          "ownerKey": {
            "allOf": [
              {
                "anyOf": [
                  {
                    "type": "null"
                  },
                  {
                    "type": "string"
                  }
                ]
              }
            ]
          },
          "fieldTarget": {
            "anyOf": [
              {
                "$ref": "#/definitions/D7"
              },
              {
                "type": "null"
              }
            ]
          },
          "code": {
            "type": "string"
          },
          "category": {
            "enum": [
              "ambiguity",
              "conflict",
              "context",
              "data",
              "missing"
            ],
            "type": "string"
          },
          "message": {
            "type": "string"
          },
          "sources": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          },
          "candidates": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "intentKey": {
                  "allOf": [
                    {
                      "anyOf": [
                        {
                          "type": "null"
                        },
                        {
                          "type": "string"
                        }
                      ]
                    }
                  ]
                },
                "sources": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "root": {
                        "enum": [
                          "baseline",
                          "context",
                          "extensionSchema",
                          "input",
                          "referenceTime",
                          "schema",
                          "semantics"
                        ],
                        "type": "string"
                      },
                      "pointer": {
                        "type": "string"
                      },
                      "quote": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "pointer",
                      "root"
                    ]
                  }
                }
              },
              "additionalProperties": false,
              "required": [
                "description",
                "intentKey",
                "key",
                "sources"
              ]
            }
          },
          "questions": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "question": {
                  "type": "string"
                },
                "optionKeys": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              },
              "additionalProperties": false,
              "required": [
                "optionKeys",
                "question"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "candidates",
          "category",
          "code",
          "fieldTarget",
          "key",
          "message",
          "ownerKey",
          "questions",
          "sources"
        ]
      }
    },
    "inferences": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target": {
            "$ref": "#/definitions/D8"
          },
          "candidateJson": {
            "allOf": [
              {
                "anyOf": [
                  {
                    "type": "null"
                  },
                  {
                    "type": "string"
                  }
                ]
              }
            ]
          },
          "explanation": {
            "type": "string"
          },
          "sources": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "candidateJson",
          "explanation",
          "sources",
          "target"
        ]
      }
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "target": {
            "$ref": "#/definitions/D8"
          },
          "sources": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "sources",
          "target"
        ]
      }
    },
    "suggestions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": {
            "enum": [
              "clarification",
              "conflict_warning",
              "semantic_improvement"
            ],
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "relatesTo": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "additionalProperties": false,
        "required": [
          "kind",
          "relatesTo",
          "text"
        ]
      }
    }
  },
  "additionalProperties": false,
  "required": [
    "changes",
    "constraints",
    "evidence",
    "historyCoverage",
    "inferences",
    "issues",
    "kind",
    "messages",
    "nodes",
    "normalizedInput",
    "observations",
    "priorTargets",
    "references",
    "relatedKeys",
    "relations",
    "suggestions",
    "usedHistory",
    "version"
  ],
  "definitions": {
    "D0": {
      "type": "object",
      "properties": {
        "changed": {
          "type": "string"
        },
        "notApplicable": {
          "type": "string"
        },
        "noValue": {
          "type": "string"
        },
        "noDeclaration": {
          "type": "string"
        },
        "explicitNull": {
          "type": "string"
        },
        "invalid": {
          "type": "string"
        },
        "open": {
          "type": "string"
        },
        "mixed": {
          "type": "string"
        },
        "semanticUnknown": {
          "type": "string"
        },
        "unresolved": {
          "type": "string"
        },
        "relationConflict": {
          "type": "string"
        }
      },
      "additionalProperties": false,
      "required": [
        "changed",
        "explicitNull",
        "invalid",
        "mixed",
        "noDeclaration",
        "noValue",
        "notApplicable",
        "open",
        "relationConflict",
        "semanticUnknown",
        "unresolved"
      ]
    },
    "D1": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "parentKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "priorRef": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "domain": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "action": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "target": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "goal": {
          "type": "string"
        },
        "understanding": {
          "enum": [
            "ambiguous",
            "clear",
            "conflicted",
            "incomplete"
          ],
          "type": "string"
        },
        "optional": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "boolean"
                }
              ]
            }
          ]
        },
        "expectedOutput": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "action",
        "domain",
        "expectedOutput",
        "goal",
        "key",
        "optional",
        "parentKey",
        "priorRef",
        "sources",
        "target",
        "understanding"
      ]
    },
    "D2": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "priorRef": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "ownerKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "scope": {
          "enum": [
            "global",
            "intent",
            "phase",
            "target"
          ],
          "type": "string"
        },
        "referenceKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "kind": {
          "enum": [
            "precondition",
            "preference",
            "prohibition",
            "requirement"
          ],
          "type": "string"
        },
        "text": {
          "type": "string"
        },
        "expressionJson": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "expressionJson",
        "key",
        "kind",
        "ownerKey",
        "priorRef",
        "referenceKey",
        "scope",
        "sources",
        "text"
      ]
    },
    "D3": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "ownerKey": {
          "type": "string"
        },
        "priorRef": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "kind": {
          "enum": [
            "entity",
            "intent",
            "source"
          ],
          "type": "string"
        },
        "intentKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "entityRef": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "resolved": {
          "type": "boolean"
        },
        "description": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "description",
        "entityRef",
        "intentKey",
        "key",
        "kind",
        "ownerKey",
        "priorRef",
        "resolved",
        "sources"
      ]
    },
    "D4": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string"
        },
        "priorRef": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "fromKey": {
          "type": "string"
        },
        "toKey": {
          "type": "string"
        },
        "kind": {
          "enum": [
            "before",
            "conditional",
            "depends_on",
            "exclusive",
            "parallel"
          ],
          "type": "string"
        },
        "condition": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "condition",
        "fromKey",
        "key",
        "kind",
        "priorRef",
        "sources",
        "toKey"
      ]
    },
    "D5": {
      "type": "object",
      "properties": {
        "operation": {
          "enum": [
            "add",
            "confirm",
            "modify",
            "reject",
            "withdraw"
          ],
          "type": "string"
        },
        "effect": {
          "enum": [
            "applied",
            "conditional",
            "unresolved"
          ],
          "type": "string"
        },
        "targetKind": {
          "enum": [
            "constraint",
            "intent",
            "relation",
            "unresolved"
          ],
          "type": "string"
        },
        "targetKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "conditionKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "description": {
          "type": "string"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        },
        "deltaHints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string"
              },
              "operation": {
                "enum": [
                  "remove",
                  "set"
                ],
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "operation",
              "path"
            ]
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "conditionKey",
        "deltaHints",
        "description",
        "effect",
        "operation",
        "sources",
        "targetKey",
        "targetKind"
      ]
    },
    "D6": {
      "type": "object",
      "properties": {
        "ownerKey": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "container": {
          "enum": [
            "extensions",
            "facts",
            "inputs"
          ],
          "type": "string"
        },
        "field": {
          "type": "string"
        },
        "presence": {
          "enum": [
            "absent",
            "known",
            "not_applicable",
            "not_provided",
            "present_unknown",
            "unknown"
          ],
          "type": "string"
        },
        "valueJson": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "rawText": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "root": {
                "enum": [
                  "baseline",
                  "context",
                  "extensionSchema",
                  "input",
                  "referenceTime",
                  "schema",
                  "semantics"
                ],
                "type": "string"
              },
              "pointer": {
                "type": "string"
              },
              "quote": {
                "type": "string"
              }
            },
            "additionalProperties": false,
            "required": [
              "pointer",
              "root"
            ]
          }
        },
        "semantic": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "status": {
                  "enum": [
                    "invalid",
                    "unknown",
                    "valid"
                  ],
                  "type": "string"
                },
                "explanation": {
                  "type": "string"
                },
                "sources": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "root": {
                        "enum": [
                          "baseline",
                          "context",
                          "extensionSchema",
                          "input",
                          "referenceTime",
                          "schema",
                          "semantics"
                        ],
                        "type": "string"
                      },
                      "pointer": {
                        "type": "string"
                      },
                      "quote": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "pointer",
                      "root"
                    ]
                  }
                },
                "dependencies": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "field": {
                        "type": "string"
                      },
                      "requires": {
                        "enum": [
                          "presence",
                          "value"
                        ],
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "field",
                      "requires"
                    ]
                  }
                }
              },
              "additionalProperties": false,
              "required": [
                "dependencies",
                "explanation",
                "sources",
                "status"
              ]
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "additionalProperties": false,
      "required": [
        "container",
        "field",
        "ownerKey",
        "presence",
        "rawText",
        "semantic",
        "sources",
        "valueJson"
      ]
    },
    "D7": {
      "type": "object",
      "properties": {
        "container": {
          "enum": [
            "extensions",
            "facts",
            "inputs"
          ],
          "type": "string"
        },
        "field": {
          "type": "string"
        },
        "path": {
          "type": "string"
        }
      },
      "additionalProperties": false,
      "required": [
        "container",
        "field",
        "path"
      ]
    },
    "D8": {
      "type": "object",
      "properties": {
        "kind": {
          "enum": [
            "constraint",
            "fact",
            "intent",
            "relation"
          ],
          "type": "string"
        },
        "key": {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                }
              ]
            }
          ]
        },
        "path": {
          "type": "string"
        }
      },
      "additionalProperties": false,
      "required": [
        "key",
        "kind",
        "path"
      ]
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
} as const;
export const EXPRESSION_SCHEMA = {
  "$ref": "#/definitions/D2",
  "definitions": {
    "D0": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "literal"
            },
            "value": {
              "$ref": "#/definitions/D1"
            }
          },
          "additionalProperties": false,
          "required": [
            "type",
            "value"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "input"
            },
            "intentId": {
              "type": "string"
            },
            "path": {
              "type": "string"
            }
          },
          "additionalProperties": false,
          "required": [
            "intentId",
            "path",
            "type"
          ]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "source"
            },
            "ref": {
              "type": "object",
              "properties": {
                "root": {
                  "enum": [
                    "baseline",
                    "context",
                    "extensionSchema",
                    "input",
                    "referenceTime",
                    "schema",
                    "semantics"
                  ],
                  "type": "string"
                },
                "pointer": {
                  "type": "string"
                },
                "quote": {
                  "type": "string"
                }
              },
              "additionalProperties": false,
              "required": [
                "pointer",
                "root"
              ]
            }
          },
          "additionalProperties": false,
          "required": [
            "ref",
            "type"
          ]
        }
      ]
    },
    "D1": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D1"
          }
        },
        {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/D1"
          }
        },
        {
          "allOf": [
            {
              "anyOf": [
                {
                  "type": "null"
                },
                {
                  "type": "string"
                },
                {
                  "type": "number"
                },
                {
                  "type": "boolean"
                }
              ]
            }
          ]
        }
      ]
    },
    "D2": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "comparison"
            },
            "left": {
              "$ref": "#/definitions/D0"
            },
            "operator": {
              "enum": [
                "eq",
                "gt",
                "gte",
                "lt",
                "lte",
                "neq"
              ],
              "type": "string"
            },
            "right": {
              "$ref": "#/definitions/D0"
            }
          },
          "additionalProperties": false,
          "required": [
            "left",
            "operator",
            "right",
            "type"
          ]
        },
        {
          "$ref": "#/definitions/D3"
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "const": "not"
            },
            "item": {
              "$ref": "#/definitions/D2"
            }
          },
          "additionalProperties": false,
          "required": [
            "item",
            "type"
          ]
        }
      ]
    },
    "D3": {
      "type": "object",
      "properties": {
        "type": {
          "enum": [
            "all",
            "any"
          ],
          "type": "string"
        },
        "items": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/D2"
          }
        }
      },
      "additionalProperties": false,
      "required": [
        "items",
        "type"
      ]
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#"
} as const;

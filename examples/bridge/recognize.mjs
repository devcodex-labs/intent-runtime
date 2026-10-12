import { createIntentBridge } from "@devcodex/intent-runtime/bridge";
import { createInstances, disposeInstances, sampleInput } from "../shared/instances.mjs";
import { createExampleExecutor, generateCandidate } from "../shared/candidate-driver.mjs";

const executor = createExampleExecutor();
const instances = createInstances();
const bridge = createIntentBridge({ instances });
const session = bridge.connect();
try {
  let reply = session.prepare({ instance: "orders", input: sampleInput, fields: ["orderId"] });
  while (reply.kind === "task") {
    let candidate;
    try { candidate = await generateCandidate(executor, reply); }
    catch { session.cancel({ jobId: reply.jobId }); throw new Error("Candidate generation failed."); }
    if (candidate.outcome !== "complete") {
      reply = session.cancel({ jobId: reply.jobId, outcome: candidate.outcome });
      break;
    }
    reply = await session.accept({ jobId: reply.jobId, stepToken: reply.stepToken, candidateText: candidate.text });
  }
  console.log(JSON.stringify(reply, null, 2));
  if (reply.kind === "error") process.exitCode = 1;
} finally { session.close(); bridge.close(); disposeInstances(instances); }

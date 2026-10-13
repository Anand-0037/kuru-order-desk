import { runDemo } from "../src/demo.ts";
const r = await runDemo();
console.log(`\nKURU ORDER DESK\n${r.mode}\n`);
for (const step of r.steps) {
  console.log(`${step.stage}\n  ${step.message}\n  ${step.detail}\n`);
}
console.log(
  `Verified fixture executor calls: ${r.executorCalls}\n${r.limitation}\nLocal demo evidence: ${r.stateDirectory}`,
);

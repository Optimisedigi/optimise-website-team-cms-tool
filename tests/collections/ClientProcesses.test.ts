import { describe, expect, it } from "vitest";
import { ClientProcesses } from "@/collections/ClientProcesses";

function getBeforeChangeHooks() {
  return ClientProcesses.hooks?.beforeChange ?? [];
}

describe("ClientProcesses Collection", () => {
  it("normalizes phase and step order when adding new rows after save", async () => {
    const hooks = getBeforeChangeHooks();
    expect(hooks.length).toBeGreaterThan(0);

    const data = {
      processTitle: "Acme onboarding",
      phases: [
        {
          phaseName: "Phase one",
          phaseOrder: 1,
          steps: [
            { stepName: "Existing step", stepOrder: 1 },
            { stepName: "Second existing step", stepOrder: 2 },
            { stepName: "Newly added step" },
          ],
        },
        {
          phaseName: "Newly added phase",
          steps: [{ stepName: "First new phase step" }],
        },
      ],
    };

    let result: any = data;
    for (const hook of hooks) {
      result = await hook({
        data: result,
        operation: "update",
        req: {} as any,
        originalDoc: {} as any,
        collection: ClientProcesses,
        context: {},
      } as any);
    }

    expect(result.phases).toMatchObject([
      {
        phaseName: "Phase one",
        phaseOrder: 1,
        steps: [
          { stepName: "Existing step", stepOrder: 1 },
          { stepName: "Second existing step", stepOrder: 2 },
          { stepName: "Newly added step", stepOrder: 3 },
        ],
      },
      {
        phaseName: "Newly added phase",
        phaseOrder: 2,
        steps: [{ stepName: "First new phase step", stepOrder: 1 }],
      },
    ]);
  });
});

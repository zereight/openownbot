import { AgentSquadsDialog } from "@openbot/ui/features/agents/AgentSquadsDialog";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

const IDS = ["a", "b", "c", "d"];

// The sidebar builds the agent list with a map, so each read of the prop returns new objects. A row
// must stay the same element when a member is checked, or the list scrolls back to the top.
function open() {
  render(() => (
    <AgentSquadsDialog
      open
      onOpenChange={vi.fn()}
      squads={[]}
      agents={IDS.map((id) => ({ id, name: `Agent ${id}` }))}
      onSave={vi.fn()}
      onRemove={vi.fn()}
    />
  ));
  fireEvent.click(screen.getByRole("button", { name: /new team|새 팀/i }));
}

const rows = () => [...document.querySelectorAll<HTMLElement>(".agent-squads-member")];

describe("AgentSquadsDialog", () => {
  it("keeps the same rows when a member is checked", async () => {
    open();
    await waitFor(() => expect(rows().length).toBe(3));
    const before = rows();
    const checkbox = before[1]?.querySelector("input");
    if (!checkbox) throw new Error("expected a checkbox");
    fireEvent.click(checkbox);
    await waitFor(() => expect(rows()[1]?.querySelector("input")?.checked).toBe(true));
    expect(rows()).toHaveLength(3);
    rows().forEach((row, index) => {
      expect(row).toBe(before[index]);
    });
  });

  it("keeps the same rows while the name is typed", async () => {
    open();
    await waitFor(() => expect(rows().length).toBe(3));
    const before = rows();
    const name = screen.getByLabelText(/team name|팀 이름/i);
    fireEvent.input(name, { target: { value: "Review" } });
    rows().forEach((row, index) => {
      expect(row).toBe(before[index]);
    });
  });

  it("drops the new lead from the members and keeps the other rows", async () => {
    open();
    await waitFor(() => expect(rows().length).toBe(3));
    const lead = screen.getByLabelText(/^lead$|^리드$/i);
    fireEvent.change(lead, { target: { value: "b" } });
    await waitFor(() => expect(rows().map((row) => row.textContent)).toEqual(["Agent a", "Agent c", "Agent d"]));
  });
});

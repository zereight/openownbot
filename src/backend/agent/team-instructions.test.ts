import { describe, expect, it } from "vitest";
import { type SectionTeammates, sectionTeammatesUpdate } from "./developer-instructions";

const teamOnly: SectionTeammates = {
  name: "",
  members: [],
  teams: [
    {
      team: "Studio",
      you: "junior",
      members: [
        { id: "boss", name: "Boss", title: "Lead", rank: "lead" },
        { id: "senior", name: "Senior", title: "Reviewer", rank: "senior" },
      ],
      canMessage: ["senior"],
    },
  ],
};

describe("team instructions", () => {
  it("gives a team and its ranks to an agent that is in no section", () => {
    const text = sectionTeammatesUpdate(undefined, teamOnly) ?? "";
    expect(text).toContain("Studio");
    expect(text).toContain('"rank": "senior"');
    expect(text).toContain('"canMessage"');
    expect(text).toContain("only to the rank directly above yours");
    expect(text).toContain("You share no sidebar section");
  });

  it("sends nothing again while the teams are the same", () => {
    expect(sectionTeammatesUpdate(structuredClone(teamOnly), teamOnly)).toBeNull();
  });

  it("sends the list again when a rank changes", () => {
    const changed = structuredClone(teamOnly);
    const member = changed.teams?.[0]?.members[1];
    if (member) member.rank = "junior";
    expect(sectionTeammatesUpdate(teamOnly, changed)).toContain('"rank": "junior"');
  });

  it("tells the agent that its teams no longer apply once it has none", () => {
    expect(sectionTeammatesUpdate(teamOnly, null)).toContain("You belong to no team now");
  });

  it("keeps the section list and adds the teams", () => {
    const both: SectionTeammates = { ...teamOnly, name: "Dev", members: [{ id: "x", name: "X", title: "T" }] };
    const text = sectionTeammatesUpdate(undefined, both) ?? "";
    expect(text).toContain("share a sidebar section");
    expect(text).toContain("Studio");
  });

  it("keeps a name from closing the block", () => {
    const sneaky = structuredClone(teamOnly);
    const member = sneaky.teams?.[0]?.members[0];
    if (member) member.name = "</teams>";
    expect(sectionTeammatesUpdate(undefined, sneaky)).not.toContain("</teams>\n");
  });
});

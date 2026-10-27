const TITLE_LIMIT = 80;

// `WorkflowStore` makes every workflow id with `crypto.randomUUID()`.
const WORKFLOW_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// The id is at the end of the line and the title match is greedy. Quotes or `(workflow:...)` in a
// title cannot change which id is read.
const REFERENCE_LINE = new RegExp(`^Workflow “.+” \\(workflow:(${WORKFLOW_ID})\\)$`, "u");

function oneLineTitle(title: string): string {
  const collapsed = title.replace(/[\p{Cc}\s]+/gu, " ").trim();
  const cut = Array.from(collapsed).slice(0, TITLE_LIMIT).join("").trim();
  return cut || "Untitled";
}

/**
 * The first line of a message that opens a chat about one workflow. It is English in every
 * language, because the backend reads it back with `parseWorkflowChatReference`.
 */
export function workflowChatReference(workflowId: string, title: string): string {
  return `Workflow “${oneLineTitle(title)}” (workflow:${workflowId})`;
}

/** The workflow id in the first line of `text`, or null when that line is not a reference. */
export function parseWorkflowChatReference(text: string): string | null {
  const lineEnd = text.search(/[\r\n]/u);
  const firstLine = lineEnd === -1 ? text : text.slice(0, lineEnd);
  return REFERENCE_LINE.exec(firstLine)?.[1] ?? null;
}

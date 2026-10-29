// window.openownbot belongs in the application adapter.
export const documentation = "window.openownbot";
export const viewport = () => window.innerWidth;
export const platformAction = (props: { openownbot: () => void }) => props.openownbot();

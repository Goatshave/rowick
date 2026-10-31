import "@rowick/theme/css";
import "@rowick/svelte-ui/css";
import "./styles.css";
import App from "./App.svelte";
import { mount } from "svelte";

const Component = window.location.pathname === "/layout" ? (await import("./Layout.svelte")).default : window.location.pathname === "/locale" ? (await import("./Locale.svelte")).default : window.location.pathname === "/analytics" ? (await import("./Analytics.svelte")).default : window.location.pathname === "/server-data" ? (await import("./ServerData.svelte")).default : window.location.pathname === "/filtering" ? (await import("./Filtering.svelte")).default : window.location.pathname === "/editing" ? (await import("./Editing.svelte")).default : window.location.pathname === "/transactions"
  ? (await import("./Transactions.svelte")).default : App;
const app = mount(Component, {
  target: document.getElementById("app") as HTMLElement,
});

export default app;

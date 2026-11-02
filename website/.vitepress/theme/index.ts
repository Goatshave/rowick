import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import RowickHome from "./components/RowickHome.vue";
import RowickDemo from "./components/RowickDemo.vue";
import "@fontsource-variable/instrument-sans/wght.css";
import "@rowick/theme/css";
import "@rowick/vue-ui/css";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("RowickHome", RowickHome);
    app.component("RowickDemo", RowickDemo);
  },
} satisfies Theme;

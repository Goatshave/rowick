import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import RowickHome from "./components/RowickHome.vue";
import FeatureDemo from "./components/FeatureDemo.vue";
import ExampleCatalog from "./components/ExampleCatalog.vue";
import RowickDemo from "./components/RowickDemo.vue";
import "@fontsource-variable/instrument-sans/wght.css";
import "@rowick/theme/css";
import "@rowick/vue-ui/css";
import "./style.css";
import "./demo-controls.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("RowickHome", RowickHome);
    app.component("RowickDemo", RowickDemo);
    app.component("FeatureDemo", FeatureDemo);
    app.component("ExampleCatalog", ExampleCatalog);
  },
} satisfies Theme;

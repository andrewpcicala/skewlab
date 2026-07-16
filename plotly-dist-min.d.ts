// Type shim: plotly.js-dist-min is the same API as plotly.js but pre-bundled.
declare module "plotly.js-dist-min" {
  import * as Plotly from "plotly.js";
  export = Plotly;
}

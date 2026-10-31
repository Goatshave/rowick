/** Shared production delivery for maintained Vite examples.
 * No unsafe compression or property mangling.
 */
export const productionBuild = {
  minify: "terser",
  terserOptions: { ecma: 2022, module: true, compress: { passes: 3, hoist_funs: true } },
};

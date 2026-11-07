import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
export async function highlight(source: string, filename: string) {
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [import('shiki/langs/typescript.mjs'), import('shiki/langs/tsx.mjs'), import('shiki/langs/vue.mjs'), import('shiki/langs/svelte.mjs'), import('shiki/langs/css.mjs')],
    engine: createJavaScriptRegexEngine(),
  });
  const language = filename.endsWith('.vue') ? 'vue' : filename.endsWith('.svelte') ? 'svelte' : filename.endsWith('.tsx') ? 'tsx' : filename.endsWith('.css') ? 'css' : 'typescript';
  return (await highlighter).codeToHtml(source, { lang: language, themes: {light:'github-light',dark:'github-dark'}, defaultColor:false });
}

import { defineConfig } from 'vitest/config';

/**
 * Dev-only escape hatch for `style-src`.
 *
 * A strict policy (no 'unsafe-inline') is what production ships: its CSS
 * arrives as a `<link>`, and no element in the built page carries a style
 * attribute (tests/vitest/csp.test.js pins both facts). The dev server is
 * different — Vite injects `<style>` elements so HMR can swap a stylesheet
 * without a reload, and a strict `style-src` refuses them, which would leave
 * `npm run dev` unstyled while `npm run build` stayed correct.
 *
 * So `vite dev` re-allows inline styles in the *served* page only. The file
 * on disk — the one that becomes dist/index.html — is never touched, which
 * is exactly what the CSP test reads. Removing this line breaks the dev
 * server's styling; weakening the file breaks the audit's Step 7.
 */
export function devStyleCspRelaxation() {
  const STRICT = "style-src 'self' https://fonts.googleapis.com;";
  const DEV = "style-src 'self' https://fonts.googleapis.com 'unsafe-inline';";
  return {
    name: 'dev-style-csp-relaxation',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!html.includes(STRICT)) {
        console.warn(
          '[csp] style-src directive not found in index.html — dev styles may be blocked',
        );
        return html;
      }
      return html.replace(STRICT, DEV);
    },
  };
}

export default defineConfig({
  plugins: [devStyleCspRelaxation()],
  test: {
    include: ['tests/vitest/**/*.test.js'],
    // Browser smoke scripts were deleted (never wired to CI); vitest owns all automated tests.
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['tests/vitest/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/main.js', 'src/config/constants.js'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
});

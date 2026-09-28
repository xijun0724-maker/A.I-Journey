import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        indexedDB: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        DOMParser: "readonly",
        AbortController: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        console: "readonly",
        performance: "readonly",
        self: "readonly",
        caches: "readonly",
        Request: "readonly",
        Response: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        Event: "readonly",
        BroadcastChannel: "readonly",
        process: "readonly",

        // CDN UMD globals
        pdfjsLib: "readonly",
        mammoth: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^(e|_)",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  {
    ignores: [
      "dist/",
      "build/",
      "node_modules/",
      "sw.js",
      "tests/",
      ".agents/",
    ],
  },
];

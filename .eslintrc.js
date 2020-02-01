module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
    node: true,
    mocha: true,
  },
  extends: [
    'airbnb-base', 'prettier'
  ],
  plugins: ['prettier', ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {
    "prettier/prettier": ["error", { singleQuote: true, trailingComma: "all" }],
    curly: ["error", "all"],
    "require-await": "error",
    "no-trailing-spaces": ["error"],
    "default-param-last": ["error"],
  },
};

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind v4 ships its own PostCSS plugin and prefixes via Lightning CSS,
    // so `tailwindcss` + `autoprefixer` are no longer wired up directly.
    "@tailwindcss/postcss": {},
  },
};

export default config;

// Tailwind is compiled at build time (src/tailwind.css, linked from index.html).
// No third-party script may run in the main app's origin, which holds the session
// and the encryption key. Same defaults the Play CDN used (Tailwind 3, no plugins).
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
};

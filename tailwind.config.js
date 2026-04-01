/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Extend with Apple HIG system colours so you can use them as Tailwind classes
      colors: {
        'ios-blue':   '#007AFF',
        'ios-green':  '#34C759',
        'ios-orange': '#FF9500',
        'ios-red':    '#FF3B30',
        'ios-gray6':  '#F2F2F7',
        'ios-gray5':  '#E5E5EA',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

/**
 * Inline script that runs before first paint to apply Night Shift (dark) mode
 * from localStorage. Prevents flash of wrong theme.
 */
export function ThemeScript() {
  const script = `
    (function(){
      var v = localStorage.getItem('nightShiftMode');
      if (v === 'true') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

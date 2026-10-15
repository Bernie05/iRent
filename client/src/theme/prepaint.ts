/**
 * Pre-paint theme script (R45, SC-49).
 *
 * Injected inline into <head> by the Vite `irent-theme-prepaint` plugin (vite.config.ts), so it runs
 * before CSS is applied and before React mounts. It reads the stored light/dark preference and sets the
 * `dark` class plus `color-scheme` on <html>.
 *
 * It must stay dependency-free ES5 and must agree with `resolveTheme()` in ./theme.ts
 * (checked by src/theme/theme.test.ts).
 */
export const THEME_STORAGE_KEY = 'irent.theme';

export const PREPAINT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var p=null;try{p=window.localStorage.getItem(k);}catch(e){}if(p!=='light'&&p!=='dark'){p='light';}var d=p==='dark';var r=document.documentElement;if(d){r.classList.add('dark');}else{r.classList.remove('dark');}r.style.colorScheme=d?'dark':'light';r.setAttribute('data-theme-preference',p);}catch(e){}})();`;

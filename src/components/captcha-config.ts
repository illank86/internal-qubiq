/** Whether sign-in needs a captcha token here (a Turnstile site key is configured). */
export const CAPTCHA_REQUIRED = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

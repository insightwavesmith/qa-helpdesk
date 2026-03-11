import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

function isClient(): boolean {
  return typeof window !== "undefined";
}

/** 봇/크롤러/프리렌더러 감지 */
function isBot(): boolean {
  if (!isClient()) return false;

  // headless 브라우저 감지
  if (navigator.webdriver) return true;

  // 프리렌더러 플래그 감지
  const win = window as unknown as Record<string, unknown>;
  if (win.__PRERENDER || win.__PRERENDER_INJECTED || win.__PRERENDER_STATUS) {
    return true;
  }

  // User-Agent 봇 패턴 감지
  const botPattern =
    /bot|crawler|spider|googlebot|bingbot|yandexbot|slurp|duckduckbot|baiduspider|facebookexternalhit|facebot|ia_archiver|prerender|headlesschrome|phantomjs|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider/i;
  if (botPattern.test(navigator.userAgent)) return true;

  return false;
}

let initialized = false;

export const mp = {
  init: () => {
    if (!isClient() || !MIXPANEL_TOKEN || initialized) return;
    mixpanel.init(MIXPANEL_TOKEN, {
      debug: process.env.NODE_ENV === "development",
      track_pageview: !isBot(),
      persistence: "localStorage",
    });
    if (isBot()) {
      mixpanel.opt_out_tracking();
    }
    initialized = true;
  },

  identify: (userId: string) => {
    if (!isClient() || !MIXPANEL_TOKEN) return;
    mixpanel.identify(userId);
  },

  track: (event: string, props?: Record<string, unknown>) => {
    if (!isClient() || !MIXPANEL_TOKEN) return;
    mixpanel.track(event, props);
  },

  people: {
    set: (props: Record<string, unknown>) => {
      if (!isClient() || !MIXPANEL_TOKEN) return;
      mixpanel.people.set(props);
    },
  },

  register: (props: Record<string, unknown>) => {
    if (!isClient() || !MIXPANEL_TOKEN) return;
    mixpanel.register(props);
  },

  reset: () => {
    if (!isClient() || !MIXPANEL_TOKEN) return;
    mixpanel.reset();
  },
};

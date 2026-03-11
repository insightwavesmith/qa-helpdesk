import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

function isClient(): boolean {
  return typeof window !== "undefined";
}

let initialized = false;

export const mp = {
  init: () => {
    if (!isClient() || !MIXPANEL_TOKEN || initialized) return;
    mixpanel.init(MIXPANEL_TOKEN, {
      debug: process.env.NODE_ENV === "development",
      track_pageview: true,
      persistence: "localStorage",
    });
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

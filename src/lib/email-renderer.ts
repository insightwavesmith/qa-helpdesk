import { render } from "@react-email/components";
import { createElement } from "react";
import WebinarInvite from "@/emails/webinar-invite";
import Newsletter from "@/emails/newsletter";
import PerformanceReport from "@/emails/performance-report";

export type TemplateName = "webinar" | "newsletter" | "performance";

interface WebinarProps {
  title: string;
  date: string;
  time: string;
  registrationUrl: string;
}

interface NewsletterProps {
  subject: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}

interface PerformanceProps {
  subject: string;
  roas: string;
  revenue: string;
  adSpend: string;
  bodyText: string;
  ctaText?: string;
  ctaUrl?: string;
}

type TemplateProps = {
  webinar: WebinarProps;
  newsletter: NewsletterProps;
  performance: PerformanceProps;
};

export async function renderEmail<T extends TemplateName>(
  templateName: T,
  props: TemplateProps[T]
): Promise<string> {
  switch (templateName) {
    case "webinar":
      return render(createElement(WebinarInvite, props as WebinarProps));
    case "newsletter":
      return render(createElement(Newsletter, props as NewsletterProps));
    case "performance":
      return render(
        createElement(PerformanceReport, props as PerformanceProps)
      );
    default:
      throw new Error(`Unknown template: ${templateName}`);
  }
}

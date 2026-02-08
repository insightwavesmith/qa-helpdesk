import {
  newsletterTemplate,
  webinarTemplate,
  performanceTemplate,
} from "@/lib/email-templates";

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
      return webinarTemplate(props as WebinarProps);
    case "newsletter":
      return newsletterTemplate(props as NewsletterProps);
    case "performance":
      return performanceTemplate(props as PerformanceProps);
    default:
      throw new Error(`Unknown template: ${templateName}`);
  }
}

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ASSESSMENT_FORM_URL?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type AssessmentCtaEventDetail = {
  readonly name: "assessment-form";
  readonly source: "service-assessment";
  readonly destination: "external-form";
};

interface WindowEventMap {
  readonly "jev:cta-open": CustomEvent<AssessmentCtaEventDetail>;
}

declare module 'mjml' {
  export interface Mjml2HtmlResult {
    html: string;
    errors: { message: string }[];
  }
  export default function mjml2html(mjml: string, options?: Record<string, unknown>): Mjml2HtmlResult;
}

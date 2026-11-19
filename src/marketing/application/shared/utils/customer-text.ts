import { Transform } from 'class-transformer';

/**
 * Customers never see how marketing media is produced (render provider, GPUs, notebooks, model names). Progress and
 * error text written by the render pipeline is rewritten into neutral wording before it leaves the API; admins
 * (serialized with the `admin` group) get the original text.
 */
export const MARKETING_ADMIN_GROUP = 'admin';

/** Words that reveal the render infrastructure or the models behind it. */
const INFRA_TERMS =
  /\b(kaggle|gpus?|t4|tesla|nvidia|cuda|vram|notebooks?|kernels?|qwen[\w.-]*|realvis\w*|sdxl|flux[\w.-]*|wan\s?2(?:\.\d)?|ti2v[\w-]*|birefnet|comfy\s?ui|hugging\s?face|hf_?\w*|ffmpeg|diffusers?|torch|lora|checkpoints?|model cache|warm (?:gpu )?worker|workers?|sessions?|quota|dataset|inpaint\w*|klein)\b/i;

/** "2/4 done" style prefix the batch status adds; kept, as it carries no infrastructure detail. */
const COUNT_PREFIX = /^\s*(\d+\s*\/\s*\d+\s+done)\s*(?:·|-|:)?\s*/i;
/** "scene 2 of 5", "3/5" — kept so customers still see how far along it is. */
const COUNT_IN_TEXT = /\b(?:(scene|shot|clip|image|photo)s?\s+)?(\d+)\s*(?:of|\/)\s*(\d+)\b/i;

function hasInfra(text: string): boolean {
  return INFRA_TERMS.test(text);
}

/** Neutral wording for a progress message. */
function neutralStage(text: string): string {
  const t = text.toLowerCase();
  if (/(waiting|queued|queue|no .* free|in line)/.test(t)) return 'Waiting in queue';
  if (/(continu|resum|new session|time limit|restart|retry|moved)/.test(t)) return 'Resuming your render';
  if (/(stopped responding|never reported|ended before|cancel|could not start|interrupted)/.test(t)) {
    return 'Taking a little longer — retrying';
  }
  if (/(boot|starting|start up|warm|setting up|set up|loading|download|prepar)/.test(t)) return 'Getting ready';
  if (/(analy[sz]|plan|understand|caption|describ|judge|review|scor)/.test(t)) return 'Planning your scenes';
  if (/(video|clip|reel|film|merg|animat|motion|frames?)/.test(t)) return 'Creating your video';
  if (/(upload|saving|finali[sz])/.test(t)) return 'Finishing up';
  if (/(image|photo|scene|shot|paint|cut-?out|background|render|generat)/.test(t)) return 'Creating your images';
  return 'Working on it';
}

/** Progress text safe to show customers. */
export function customerStageMessage(text: string | null | undefined): string | null | undefined {
  if (!text || !hasInfra(text)) return text;
  const prefix = COUNT_PREFIX.exec(text)?.[1];
  const rest = prefix ? text.replace(COUNT_PREFIX, '') : text;
  const count = COUNT_IN_TEXT.exec(rest);
  const base = neutralStage(rest);
  const countText = count ? ` (${count[2]} of ${count[3]})` : '';
  return [prefix, `${base}${countText}`].filter(Boolean).join(' · ');
}

/** Error text safe to show customers. */
export function customerErrorMessage(text: string | null | undefined): string | null | undefined {
  if (!text || !hasInfra(text)) return text;
  const t = text.toLowerCase();
  if (/(stopped responding|never reported|ended before|cancel|time limit|interrupted|session)/.test(t)) {
    return 'Generation was interrupted. Please try again.';
  }
  if (/(queued|no .* free|quota|capacity|busy)/.test(t))
    return 'We are busy right now. Please try again in a few minutes.';
  return 'Generation failed. Please try again.';
}

interface TransformOpts {
  value: unknown;
  options?: { groups?: string[] };
}
const isAdmin = (params: TransformOpts) => !!params.options?.groups?.includes(MARKETING_ADMIN_GROUP);

/** Response-model decorator: neutral progress text for customers, raw text for admins. */
export const CustomerStageText = (): PropertyDecorator =>
  Transform((params: TransformOpts) =>
    isAdmin(params) || typeof params.value !== 'string' ? params.value : customerStageMessage(params.value),
  );

/** Response-model decorator: neutral error text for customers, raw text for admins. */
export const CustomerErrorText = (): PropertyDecorator =>
  Transform((params: TransformOpts) =>
    isAdmin(params) || typeof params.value !== 'string' ? params.value : customerErrorMessage(params.value),
  );

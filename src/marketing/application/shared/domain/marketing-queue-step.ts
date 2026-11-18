/**
 * Queue steps:
 *  - plan:     prompts (text model) + scene images (image model) for a campaign, then queue the render
 *  - image:    regenerate one scene image (optionally re-render its video)
 *  - logo:     generate the brand logo image (and queue the logo video render)
 *  - dispatch: sync Kaggle accounts (setting up new ones) and hand waiting render jobs to free accounts
 *  - watch:    watchdog for a running render job: restarts it in a new session when the Kaggle session expired,
 *              crashed or hung
 *  - photoshoot: generate an AI photoshoot's photos (or one photo again)
 */
export type MarketingQueueStep = 'plan' | 'image' | 'logo' | 'dispatch' | 'watch' | 'photoshoot';

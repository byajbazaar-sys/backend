export const TRY_ON_ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Hex (#RGB / #RRGGBB) or a short color name used by the frontend catalog. */
export const TRY_ON_COLOR_PATTERN = /^(#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?|[A-Za-z][A-Za-z0-9 \-]{1,30})$/;

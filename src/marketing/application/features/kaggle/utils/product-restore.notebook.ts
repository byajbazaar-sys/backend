/**
 * Python helpers shared by the image and video notebooks: find the jeweller's real piece in a generated picture
 * (SIFT + MAGSAC homography) and rebuild it from the real photo — fine detail and colour from the photo, soft light
 * from the scene, generated pixels kept wherever the two disagree (fingers over the piece, a wrist hiding the back of
 * a bangle). CPU only (numpy + OpenCV), so it runs while the GPUs paint. Unit-tested locally on real frames.
 */
export const PRODUCT_RESTORE_PY = String.raw`
# ---- Product restore: the jeweller's real pixels are the source of truth --------------------------------------------
# The image model invents the scene, the light and the pose; these helpers put the real product photo back on top of
# what it drew. They find the drawn piece by feature matching (SIFT + MAGSAC homography), then rebuild it from the
# real photo: fine detail (bells, enamel edges, engraving) and colour come from the photo, only the soft large-scale
# light comes from the generated scene. A local agreement map keeps the generated pixels wherever the views disagree
# (fingers over the piece, the back of a bangle hidden by the wrist), so nothing is pasted over a hand. CPU only
# (numpy + OpenCV), so it runs while the GPUs paint.
import numpy as np
import cv2


def _to_float(rgb):
    return np.asarray(rgb, dtype=np.float32) / 255.0


def _blur(x, sigma):
    return cv2.GaussianBlur(x, (0, 0), sigmaX=float(sigma), sigmaY=float(sigma), borderType=cv2.BORDER_REFLECT)


def _masked_blur(x, weight, sigma):
    """Gaussian blur that ignores pixels outside the weight (no background bleeding into the piece)."""
    return _blur(x * weight, sigma) / (_blur(weight, sigma) + 1e-4)


def refine_foreground(rgb, alpha, radii=(90, 6)):
    """Fast foreground colour estimation (blur fusion, as in BiRefNet's refine_foreground): removes the old
    background colour left in the soft edge pixels, so a pasted piece has no halo. rgb uint8 HxWx3, alpha float 0-1."""
    image = _to_float(rgb)
    a = np.clip(np.asarray(alpha, dtype=np.float32), 0, 1)[..., None]
    fg, bg = image, image
    for r in radii:
        k = (int(r), int(r))
        blurred_a = cv2.blur(a[..., 0], k)[..., None]
        blurred_fa = cv2.blur(fg * a, k) / (blurred_a + 1e-5)
        blurred_b1a = cv2.blur(bg * (1 - a), k) / ((1 - blurred_a) + 1e-5)
        fg = np.clip(blurred_fa + a * (image - a * blurred_fa - (1 - a) * blurred_b1a), 0, 1)
        bg = blurred_b1a
    return (fg * 255 + 0.5).astype(np.uint8)


def _scaled(img, long_side):
    h, w = img.shape[:2]
    s = min(1.0, float(long_side) / max(h, w))
    if s < 1.0:
        img = cv2.resize(img, (max(1, int(round(w * s))), max(1, int(round(h * s)))), interpolation=cv2.INTER_AREA)
    return img, s


import threading as _threading
_SIFT = _threading.local()  # one detector per thread: video frames are matched side by side


def _sift():
    if getattr(_SIFT, "detector", None) is None:
        _SIFT.detector = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.015, edgeThreshold=12)
    return _SIFT.detector


def product_features(rgb, alpha, long_side=1024):
    """SIFT features of the real product (computed once, reused for every take / video frame)."""
    img, s = _scaled(np.asarray(rgb), long_side)
    a, _ = _scaled(np.asarray(alpha, dtype=np.float32), long_side)
    mask = (cv2.dilate((a > 0.3).astype(np.uint8), np.ones((5, 5), np.uint8)) * 255).astype(np.uint8)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    kp, desc = _sift().detectAndCompute(gray, mask)
    pts = np.float32([k.pt for k in kp]) / s if kp else np.zeros((0, 2), np.float32)
    h, w = np.asarray(alpha).shape[:2]
    return {"pts": pts, "desc": desc, "size": (w, h), "alpha": np.asarray(alpha, dtype=np.float32)}


def match_product(feats, target_rgb, long_side=1600, region=None):
    """Homography taking product-photo pixels to target pixels, or None when the piece is not found reliably.
    region = optional (x1, y1, x2, y2) in target pixels to search in."""
    stats = {"matches": 0, "inliers": 0, "ratio": 0.0, "reason": ""}
    if feats["desc"] is None or len(feats["pts"]) < 12:
        stats["reason"] = "too few features on the product"
        return None, stats
    target = np.asarray(target_rgb)
    full_h, full_w = target.shape[:2]
    ox = oy = 0
    if region is not None:
        x1, y1, x2, y2 = [int(v) for v in region]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(target.shape[1], x2), min(target.shape[0], y2)
        if x2 - x1 > 32 and y2 - y1 > 32:
            target, ox, oy = target[y1:y2, x1:x2], x1, y1
    img, s = _scaled(target, long_side)
    kp, desc = _sift().detectAndCompute(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), None)
    if desc is None or len(kp) < 12:
        stats["reason"] = "too few features in the image"
        return None, stats
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(feats["desc"], desc, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.78 * n.distance]
    stats["matches"] = len(good)
    if len(good) < 12:
        stats["reason"] = "the piece was not found"
        return None, stats
    src = np.float32([feats["pts"][m.queryIdx] for m in good])
    dst = np.float32([kp[m.trainIdx].pt for m in good]) / s + np.float32([ox, oy])
    method = getattr(cv2, "USAC_MAGSAC", cv2.RANSAC)
    H, inl = cv2.findHomography(src, dst, method, 5.0 / max(s, 1e-3) * 0.6, maxIters=20000, confidence=0.999)
    if H is None or inl is None:
        stats["reason"] = "no consistent geometry"
        return None, stats
    n_in = int(inl.sum())
    stats["inliers"], stats["ratio"] = n_in, n_in / max(1, len(good))
    if n_in < 15 or stats["ratio"] < 0.2:
        stats["reason"] = "too few consistent matches"
        return None, stats
    w, h = feats["size"]
    corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
    quad = cv2.perspectiveTransform(corners, H).reshape(-1, 2)
    area = abs(cv2.contourArea(quad))  # in target pixels: a ring 200 px tall in a worn shot is fine
    if not cv2.isContourConvex(quad.astype(np.float32).reshape(-1, 1, 2)) or not 1600 <= area <= 2.0 * full_w * full_h:
        stats["reason"] = "implausible placement"
        return None, stats
    sv = np.linalg.svd(H[:2, :2] / H[2, 2], compute_uv=False)
    if sv[1] < 1e-6 or sv[0] / sv[1] > 3.0:
        stats["reason"] = "too much distortion"
        return None, stats
    return H, stats


def lab(rgb_float):
    return cv2.cvtColor(np.ascontiguousarray(rgb_float, dtype=np.float32), cv2.COLOR_RGB2LAB)


def metal_tone(rgb, mask):
    """Median a*, b* and chroma of the metal (speculars, deep shadow and saturated enamel left out)."""
    l = lab(_to_float(rgb))
    m = np.asarray(mask) > 0.5
    chroma = np.hypot(l[..., 1], l[..., 2])
    sel = m & (l[..., 0] > 15) & (l[..., 0] < 92) & (chroma < 40)
    if sel.sum() < 50:
        sel = m
    if sel.sum() < 10:
        return None
    a, b, c = l[..., 1][sel], l[..., 2][sel], chroma[sel]
    return {"a": float(np.median(a)), "b": float(np.median(b)), "chroma": float(np.median(c))}


def restore_product(target_rgb, product_rgb, product_alpha, H, min_coverage=0.45, trust=False):
    """Rebuilds the drawn piece from the real photo where the two agree. Returns (image, mask, stats); image is None
    when too little of the piece agrees (then keep the generated take as it is). trust = H was verified by tracking
    the very pixels being restored (a video frame against its own still): fine detail that disagrees is the frame's
    melting texture, so it is replaced too — only something in front of the piece (a colour or shading jump) is kept."""
    target = np.asarray(target_rgb)
    th, tw = target.shape[:2]
    product_rgb = np.asarray(product_rgb)
    product_alpha = np.asarray(product_alpha, dtype=np.float32)
    scale = float(np.sqrt(abs(np.linalg.det(H[:2, :2] / H[2, 2]))))
    if scale < 0.9:  # drawn smaller than photographed: shrink with an area filter first, or the detail aliases
        ph, pw = product_rgb.shape[:2]
        nw, nh = max(8, int(round(pw * scale))), max(8, int(round(ph * scale)))
        product_rgb = cv2.resize(product_rgb, (nw, nh), interpolation=cv2.INTER_AREA)
        product_alpha = cv2.resize(product_alpha, (nw, nh), interpolation=cv2.INTER_AREA)
        H = H @ np.diag([pw / float(nw), ph / float(nh), 1.0])
    warped = cv2.warpPerspective(product_rgb, H, (tw, th), flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    alpha = cv2.warpPerspective(product_alpha, H, (tw, th), flags=cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    alpha = np.clip(alpha, 0, 1)
    core = alpha > 0.5
    stats = {"coverage": 0.0, "used": False}
    if core.sum() < 200:
        stats["reason"] = "the piece is too small in the image"
        return None, None, stats
    ys, xs = np.where(alpha > 0.02)
    size = float(np.sqrt(core.sum()))
    pad = int(size * 0.15) + 8
    y1, y2 = max(0, ys.min() - pad), min(th, ys.max() + pad + 1)
    x1, x2 = max(0, xs.min() - pad), min(tw, xs.max() + pad + 1)
    gen = _to_float(target[y1:y2, x1:x2])
    src = _to_float(warped[y1:y2, x1:x2])
    a = alpha[y1:y2, x1:x2]
    lg, ls = lab(gen), lab(src)
    sigma = max(1.5, 0.012 * size)
    w = (a > 0.5).astype(np.float32)
    low_g = _masked_blur(lg[..., 0], w, sigma)
    low_s = _masked_blur(ls[..., 0], w, sigma)
    hp_s = ls[..., 0] - low_s
    hp_g = lg[..., 0] - low_g
    # Local structural agreement (normalised cross-correlation of the fine detail), then spread over a larger area so
    # flat metal between bells and motifs follows its textured neighbours.
    sn = sigma * 2.5
    num = _blur(hp_s * hp_g, sn)
    den = np.sqrt(_blur(hp_s * hp_s, sn) * _blur(hp_g * hp_g, sn)) + 1e-3
    ncc = num / den
    energy_s, energy_g = _blur(hp_s * hp_s, sn), _blur(hp_g * hp_g, sn)
    texture = (energy_s > 0.8).astype(np.float32) * w
    agree = (ncc > 0.3).astype(np.float32) * texture
    big = max(sigma * 6, size * 0.06)
    tex_density = _blur(texture, big)
    local = _blur(agree, big) / (tex_density + 1e-4)
    overall = float(agree.sum() / max(1.0, texture.sum())) if texture.sum() > 0.02 * w.sum() else 1.0
    local = np.where(tex_density > 0.05, local, overall)
    keep = np.clip((local - 0.35) / 0.3, 0, 1)
    # Local veto the wide spread above cannot outvote — anything in front of the piece keeps its generated pixels:
    # (1) detail in the photo that the drawing contradicts; (2) edges in the drawing where the photo is plain metal
    # (a finger's outline); (3) a colour that differs from the piece's own overall shift (skin over silver), measured
    # against the unclamped median so a piece drawn in the wrong metal is still restored.
    core_sel = w > 0
    da_raw = float(np.median(lg[..., 1][core_sel] - ls[..., 1][core_sel]))
    db_raw = float(np.median(lg[..., 2][core_sel] - ls[..., 2][core_sel]))
    ca = _masked_blur(lg[..., 1] - ls[..., 1], w, sigma) - da_raw
    cb = _masked_blur(lg[..., 2] - ls[..., 2], w, sigma) - db_raw
    shade = (low_g + 1.0) / (low_s + 1.0)
    colour_jump = np.hypot(ca, cb) > 16
    if trust:
        keep = np.ones_like(keep)
        # A colour jump where the fine detail still lines up is the frame's colour drifting (green kundan stones gone
        # blue for a second), not something in front of the piece: it is restored. A finger or hand over the piece
        # breaks the detail too, so it still keeps its own pixels — as does a flat area, where detail cannot tell.
        drifted = (texture > 0) & (ncc > 0.3)
        disagree = (colour_jump & ~drifted) | (shade < 0.45) | (shade > 2.2)
    else:
        disagree = (((texture > 0) & (ncc < 0.1)) | ((energy_g > 0.8) & (energy_s < 0.25)) | colour_jump
                    | (shade < 0.45) | (shade > 2.2))
    disagree = cv2.dilate(disagree.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32) * w
    keep = keep * (1 - np.clip(_blur(disagree, sigma) * 2.5, 0, 1))
    # Light: the generated scene's large-scale brightness, within limits; detail: the real photo.
    gain = np.clip((low_g + 1.0) / (low_s + 1.0), 0.6, 1.5)
    out_l = np.clip(low_s * gain + hp_s, 0, 100)
    # Colour: the real photo's, allowing only a small global white-balance shift towards the scene.
    sel = (w > 0) & (keep > 0.5)
    if sel.sum() < 50:
        sel = w > 0
    chroma = float(np.median(np.hypot(ls[..., 1], ls[..., 2])[sel]))
    limit = 1.5 + 0.1 * chroma
    da = float(np.clip(np.median(lg[..., 1][sel] - ls[..., 1][sel]), -limit, limit))
    db = float(np.clip(np.median(lg[..., 2][sel] - ls[..., 2][sel]), -limit, limit))
    restored = np.dstack([out_l, ls[..., 1] + da, ls[..., 2] + db]).astype(np.float32)
    restored = np.clip(cv2.cvtColor(restored, cv2.COLOR_LAB2RGB), 0, 1)
    edge = cv2.erode(a, np.ones((3, 3), np.uint8))
    edge = _blur(edge, 0.8)
    m = np.clip(edge * keep, 0, 1)
    coverage = float((m * w).sum() / max(1.0, w.sum()))
    stats.update(coverage=coverage, sigma=sigma, agreement=overall, white_balance=(da, db))
    # Tones on the SAME pixels of drawing and photo (a two-tone piece must not look 'changed' because the halves
    # differ): the agreeing part, and the part left as drawn — that one decides whether a partial restore still
    # shows a wrong metal.
    gen_crop, src_crop = target[y1:y2, x1:x2], warped[y1:y2, x1:x2]
    agreeing = w * (keep > 0.5)
    sel = agreeing if agreeing.sum() > 0.1 * w.sum() else w
    stats["tone_generated"], stats["tone_product"] = metal_tone(gen_crop, sel), metal_tone(src_crop, sel)
    if coverage < min_coverage:
        stats["reason"] = f"only {coverage * 100:.0f}% of the piece agrees with the photo"
        return None, None, stats
    stats["_rest"] = w * (m <= 0.5)
    out = gen * (1 - m[..., None]) + restored * m[..., None]
    # The part of the piece left as drawn (structure too different to restore) still gets the photo's metal colour:
    # its drawn colour drift is removed, but only where it is the piece's own metal — not skin or anything else that
    # differs from the piece's overall shift.
    occluder = _blur(cv2.dilate(colour_jump.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), sigma)
    recolour = w * (1 - m) * (1 - np.clip(occluder * 2.5, 0, 1))
    if recolour.sum() > 0.02 * w.sum() and np.hypot(da_raw - da, db_raw - db) > 2:
        lo = lab(np.clip(out, 0, 1))
        lo[..., 1] -= (da_raw - da) * recolour
        lo[..., 2] -= (db_raw - db) * recolour
        out = np.clip(cv2.cvtColor(lo.astype(np.float32), cv2.COLOR_LAB2RGB), 0, 1)
    full = target.copy()
    full[y1:y2, x1:x2] = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
    rest = stats.pop("_rest")
    if rest.sum() > 0.05 * w.sum():  # what the delivered still shows where the photo could not be restored
        stats["tone_rest_generated"] = metal_tone(full[y1:y2, x1:x2], rest)
        stats["tone_rest_product"] = metal_tone(src_crop, rest)
    mask = np.zeros((th, tw), np.float32)
    mask[y1:y2, x1:x2] = m
    stats["used"] = True
    return full, mask, stats


def metal_changed(tone_product, tone_generated):
    """True when a white metal (silver, platinum) came out yellow, or a yellow gold came out white."""
    if not tone_product or not tone_generated:
        return False
    white = tone_product["chroma"] < 12
    if white:  # warm scene light alone shifts silver by ~10-20 b*; gold reads b* 25+ with a yellow hue
        hue = float(np.degrees(np.arctan2(tone_generated["b"], tone_generated["a"])))
        return (tone_generated["b"] - tone_product["b"] > 14 and tone_generated["chroma"] > 22 and 60 <= hue <= 100)
    yellow = tone_product["b"] > 15
    return yellow and tone_generated["b"] < tone_product["b"] - 12
`;

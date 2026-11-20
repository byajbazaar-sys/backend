/**
 * Python shared by the notebooks that may run on Colab Enterprise: the heavy working folders on the VM's largest disk,
 * and Cloud Storage access (the model cache) as the run's own service account. Harmless on Kaggle, where nothing
 * calls the GCS helpers and /tmp is already the big disk.
 */
export const COLAB_RUNTIME_PY = `
import os, sys, shutil, subprocess, time

# Folders the notebooks create under /tmp that hold tens of GB (ComfyUI and its models, cache staging).
HEAVY_TMP = ("ComfyUI", "comfy-b", "bb-hf", "bb-hf-stage", "bb-model-cache", "bb-gcs")
_GCS = {}


def free_gb(path):
    try:
        return shutil.disk_usage(path).free / 1e9
    except OSError:
        return 0.0


def big_disk():
    """Free GB where the heavy folders live. On Colab Enterprise the VM's large disk need not be /tmp: the heavy folders
    are pointed (symlinks) at the mounted disk with the most room, before anything creates them."""
    roots = [p for p in ("/tmp", "/content", "/home", "/root", "/var/tmp", "/opt", "/") if os.path.isdir(p)]
    best = max(roots, key=free_gb)
    if best != "/tmp" and free_gb(best) > free_gb("/tmp") + 20:
        base = os.path.join(best, "bb-work")
        for name in HEAVY_TMP:
            link = os.path.join("/tmp", name)
            if os.path.lexists(link):
                continue
            os.makedirs(os.path.join(base, name), exist_ok=True)
            os.symlink(os.path.join(base, name), link)
        print(f"Working folders on {best}: {free_gb(best):.0f} GB free (/tmp has {free_gb('/tmp'):.0f} GB)", flush=True)
    return free_gb(best)


def gcs():
    """Cloud Storage as the run's service account (application default credentials on the VM)."""
    if "client" not in _GCS:
        try:
            from google.cloud import storage
        except ImportError:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "google-cloud-storage"], check=True)
            from google.cloud import storage
        _GCS["client"] = storage.Client()
    return _GCS["client"]


def gcs_blob(uri):
    bucket, _, name = uri[len("gs://"):].partition("/")
    return gcs().bucket(bucket).blob(name)


def gcs_exists(uri):
    return gcs_blob(uri).exists()


def gcs_download(uri, dst):
    """To dst via dst.staging: a job never sees a half-written file. Big files in parallel chunks."""
    blob = gcs_blob(uri)
    blob.reload()
    tmp = dst + ".staging"
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    try:
        from google.cloud.storage import transfer_manager
        if (blob.size or 0) > 256e6:
            transfer_manager.download_chunks_concurrently(blob, tmp, chunk_size=64 * 1024 * 1024, max_workers=8,
                                                          worker_type=transfer_manager.THREAD)
        else:
            blob.download_to_filename(tmp)
    except ImportError:
        blob.download_to_filename(tmp)
    os.replace(tmp, dst)


def gcs_upload(path, uri):
    blob = gcs_blob(uri)
    blob.chunk_size = 64 * 1024 * 1024  # resumable upload in 64 MB parts
    blob.upload_from_filename(path, timeout=3600)
`;

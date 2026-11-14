import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

type StoredReviewScreenshot = {
  screenshotUrl: string | null;
  screenshotCloudinaryPublicId: string | null;
  screenshotLocalFileName: string | null;
};

export async function removeReviewScreenshot(image: StoredReviewScreenshot) {
  if (image.screenshotCloudinaryPublicId) {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const key = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;
    if (cloud && key && secret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHash('sha1').update(`public_id=${image.screenshotCloudinaryPublicId}&timestamp=${timestamp}${secret}`).digest('hex');
      const body = new URLSearchParams({ public_id: image.screenshotCloudinaryPublicId, timestamp, api_key: key, signature });
      try {
        await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`, { method: 'POST', body });
      } catch {
        // The database reference is still cleared; a provider outage may leave an unlinked file to clean up later.
      }
    }
  }
  if (image.screenshotLocalFileName) {
    const filename = path.basename(image.screenshotLocalFileName);
    try {
      await unlink(path.join(process.cwd(), 'public', 'uploads', 'reviews', filename));
    } catch {
      // The file may already have been removed.
    }
  }
}

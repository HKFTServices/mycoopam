import marketing1 from "@/assets/marketing images/Marketing_image_1.png";
import marketing2 from "@/assets/marketing images/Marketing_image_2.png";
import marketing3 from "@/assets/marketing images/Marketing_image_3.png";
import marketing4 from "@/assets/marketing images/Marketing_image_4.png";
import marketing5 from "@/assets/marketing images/Marketing_image_5.png";

const STORAGE_KEY = "lastMarketingImage";

export const MARKETING_IMAGES = [
  marketing1,
  marketing2,
  marketing3,
  marketing4,
  marketing5,
] as const;

export function getRandomImage(previous?: string): string {
  const last = previous ?? localStorage.getItem(STORAGE_KEY) ?? undefined;
  const options =
    last && MARKETING_IMAGES.length > 1
      ? MARKETING_IMAGES.filter((src) => src !== last)
      : [...MARKETING_IMAGES];

  const next = options[Math.floor(Math.random() * options.length)];
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}

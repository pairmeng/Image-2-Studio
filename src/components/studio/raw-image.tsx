import type { ImgHTMLAttributes } from "react";

export function RawImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  // Authenticated image routes, object URLs, and user-provided logos should bypass Next image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img decoding="async" {...props} />;
}

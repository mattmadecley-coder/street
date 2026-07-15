const blurSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ebe9e3"/>
      <stop offset="0.55" stop-color="#d8d5ce"/>
      <stop offset="1" stop-color="#c9c6bf"/>
    </linearGradient>
  </defs>
  <rect width="32" height="40" fill="url(#g)"/>
</svg>`;

export const MEDIA_BLUR_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(blurSvg)}`;

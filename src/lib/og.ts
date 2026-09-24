import satori from 'satori';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTH = 1200;
const HEIGHT = 630;
const SITE_LABEL = 'masafumi330.com';
const AUTHOR = 'Masafumi Misawa';

// Google Fonts から、描画する文字だけを含むサブセットの TTF を取得する。
// satori は woff2 を扱えないため、UA を指定せずに TTF を返してもらう。
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!match) {
    throw new Error(`Failed to load font: ${family} ${weight}`);
  }
  const res = await fetch(match[1]);
  if (!res.ok) {
    throw new Error(`Failed to download font: ${family} ${weight} (${res.status})`);
  }
  return res.arrayBuffer();
}

let avatarDataUri: Promise<string> | undefined;
function loadAvatar(): Promise<string> {
  avatarDataUri ??= fs
    .readFile(path.join(process.cwd(), 'public/avatar.png'))
    .then((buf) => sharp(buf).resize(96, 96).png().toBuffer())
    .then((buf) => `data:image/png;base64,${buf.toString('base64')}`);
  return avatarDataUri;
}

type OgOptions = {
  title: string;
  date?: string;
};

export async function renderOgImage({ title, date = '' }: OgOptions): Promise<Buffer> {
  const text = `${title}${date}${SITE_LABEL}${AUTHOR}`;
  const [boldFont, regularFont, avatar] = await Promise.all([
    loadGoogleFont('Noto Sans JP', 700, text),
    loadGoogleFont('Noto Sans JP', 400, text),
    loadAvatar(),
  ]);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0f0f0f',
          color: '#e8e8e8',
          fontFamily: 'Noto Sans JP',
          borderLeft: '16px solid #c8f5a0',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: '24px' },
              children: [
                date && {
                  type: 'div',
                  props: {
                    style: { fontSize: 28, color: '#888' },
                    children: date,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: title.length > 40 ? 52 : 64,
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1.35,
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    },
                    children: title,
                  },
                },
              ].filter(Boolean),
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '20px' },
                    children: [
                      {
                        type: 'img',
                        props: {
                          src: avatar,
                          width: 72,
                          height: 72,
                          style: { borderRadius: '9999px' },
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: 32, color: '#e8e8e8' },
                          children: AUTHOR,
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontSize: 28, color: '#c8f5a0' },
                    children: SITE_LABEL,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Noto Sans JP', data: regularFont, weight: 400, style: 'normal' },
        { name: 'Noto Sans JP', data: boldFont, weight: 700, style: 'normal' },
      ],
    },
  );

  return sharp(Buffer.from(svg)).png().toBuffer();
}

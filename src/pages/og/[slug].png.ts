import type { APIRoute, GetStaticPaths } from 'astro';
import { getPublishedArticles, type Article } from '../../lib/notion';
import { renderOgImage } from '../../lib/og';

export const getStaticPaths = (async () => {
  const articles = await getPublishedArticles();
  return articles.map((article) => ({
    params: { slug: article.slug },
    props: { article },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { article } = props as { article: Article };
  const png = await renderOgImage({ title: article.title, date: article.date });
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png' },
  });
};

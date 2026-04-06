import { Client } from '@notionhq/client';
import type {
  PageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';

const notion = new Client({ auth: import.meta.env.NOTION_TOKEN });
const DATABASE_ID = import.meta.env.NOTION_DATABASE_ID;

export type Article = {
  id: string;
  title: string;
  slug: string;
  date: string;
  categories: string[];
  status: string;
};

export async function getArticles(): Promise<Article[]> {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: 'status',
      status: { equals: 'published' },
    },
    sorts: [{ property: 'date', direction: 'descending' }],
  });

  return response.results
    .filter((page): page is PageObjectResponse => 'properties' in page)
    .map(pageToArticle);
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: 'slug', rich_text: { equals: slug } },
        { property: 'status', status: { equals: 'published' } },
      ],
    },
  });

  const page = response.results.find(
    (p): p is PageObjectResponse => 'properties' in p,
  );
  return page ? pageToArticle(page) : null;
}

export async function getArticleBlocks(pageId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(
      ...response.results.filter(
        (b): b is BlockObjectResponse => 'type' in b,
      ),
    );
    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return blocks;
}

type RichTextItem = {
  plain_text: string;
  href: string | null;
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
  };
};

function richTextToHtml(items: RichTextItem[]): string {
  return items
    .map((item) => {
      let text = item.plain_text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (item.annotations.bold) text = `<strong>${text}</strong>`;
      if (item.annotations.italic) text = `<em>${text}</em>`;
      if (item.annotations.strikethrough) text = `<del>${text}</del>`;
      if (item.annotations.underline) text = `<u>${text}</u>`;
      if (item.annotations.code) text = `<code>${text}</code>`;
      if (item.href) text = `<a href="${item.href}">${text}</a>`;

      return text;
    })
    .join('');
}

export function blocksToHtml(blocks: BlockObjectResponse[]): string {
  const html: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i] as BlockObjectResponse & Record<string, unknown>;
    const type = block.type as string;

    // Bulleted list: wrap consecutive items in <ul>
    if (type === 'bulleted_list_item') {
      const items: string[] = [];
      while (i < blocks.length && (blocks[i] as typeof block).type === 'bulleted_list_item') {
        const b = blocks[i] as typeof block;
        const rt = (b['bulleted_list_item'] as { rich_text: RichTextItem[] }).rich_text;
        items.push(`<li>${richTextToHtml(rt)}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Numbered list: wrap consecutive items in <ol>
    if (type === 'numbered_list_item') {
      const items: string[] = [];
      while (i < blocks.length && (blocks[i] as typeof block).type === 'numbered_list_item') {
        const b = blocks[i] as typeof block;
        const rt = (b['numbered_list_item'] as { rich_text: RichTextItem[] }).rich_text;
        items.push(`<li>${richTextToHtml(rt)}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    switch (type) {
      case 'paragraph': {
        const rt = (block['paragraph'] as { rich_text: RichTextItem[] }).rich_text;
        const text = richTextToHtml(rt);
        html.push(text ? `<p>${text}</p>` : '<br>');
        break;
      }
      case 'heading_1': {
        const rt = (block['heading_1'] as { rich_text: RichTextItem[] }).rich_text;
        html.push(`<h1>${richTextToHtml(rt)}</h1>`);
        break;
      }
      case 'heading_2': {
        const rt = (block['heading_2'] as { rich_text: RichTextItem[] }).rich_text;
        html.push(`<h2>${richTextToHtml(rt)}</h2>`);
        break;
      }
      case 'heading_3': {
        const rt = (block['heading_3'] as { rich_text: RichTextItem[] }).rich_text;
        html.push(`<h3>${richTextToHtml(rt)}</h3>`);
        break;
      }
      case 'code': {
        const codeBlock = block['code'] as { rich_text: RichTextItem[]; language: string };
        const code = codeBlock.rich_text.map((t) => t.plain_text).join('');
        const lang = codeBlock.language ?? '';
        html.push(`<pre><code class="language-${lang}">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
        break;
      }
      case 'quote': {
        const rt = (block['quote'] as { rich_text: RichTextItem[] }).rich_text;
        html.push(`<blockquote>${richTextToHtml(rt)}</blockquote>`);
        break;
      }
      case 'image': {
        const img = block['image'] as { type: string; file?: { url: string }; external?: { url: string }; caption?: RichTextItem[] };
        const url = img.type === 'file' ? img.file?.url : img.external?.url;
        const caption = img.caption ? richTextToHtml(img.caption) : '';
        if (url) {
          html.push(caption
            ? `<figure><img src="${url}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`
            : `<img src="${url}" alt="" loading="lazy">`
          );
        }
        break;
      }
      case 'divider': {
        html.push('<hr>');
        break;
      }
    }

    i++;
  }

  return html.join('\n');
}

function pageToArticle(page: PageObjectResponse): Article {
  const props = page.properties;

  const titleProp = props['title'];
  const title =
    titleProp?.type === 'title'
      ? titleProp.title.map((t) => t.plain_text).join('')
      : '';

  const slugProp = props['slug'];
  const slug =
    slugProp?.type === 'rich_text'
      ? slugProp.rich_text.map((t) => t.plain_text).join('')
      : page.id;

  const dateProp = props['date'];
  const date =
    dateProp?.type === 'date' ? (dateProp.date?.start ?? '') : '';

  const categoriesProp = props['categories'];
  const categories =
    categoriesProp?.type === 'multi_select'
      ? categoriesProp.multi_select.map((c) => c.name)
      : [];

  const statusProp = props['status'];
  const status =
    statusProp?.type === 'status' ? (statusProp.status?.name ?? '') : '';

  return { id: page.id, title, slug, date, categories, status };
}

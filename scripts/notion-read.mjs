import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read from .env if it exists
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.trim().match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

async function fetchBlockChildren(blockId, apiKey) {
  const results = [];
  let cursor = undefined;
  
  do {
    let url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`;
    if (cursor) {
      url += `&start_cursor=${cursor}`;
    }
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch blocks for ${blockId}: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}

function parseRichText(richTextArray) {
  if (!richTextArray) return '';
  return richTextArray.map(t => {
    let text = t.plain_text || '';
    if (t.annotations) {
      if (t.annotations.bold) text = `**${text}**`;
      if (t.annotations.italic) text = `*${text}*`;
      if (t.annotations.strikethrough) text = `~~${text}~~`;
      if (t.annotations.code) text = `\`${text}\``;
    }
    if (t.href) {
      text = `[${text}](${t.href})`;
    }
    return text;
  }).join('');
}

async function blockToMarkdown(block, apiKey, indent = '') {
  const type = block.type;
  const data = block[type];
  if (!data) return '';

  let text = '';
  if (data.rich_text) {
    text = parseRichText(data.rich_text);
  }

  let md = '';
  switch (type) {
    case 'paragraph':
      md = `${indent}${text}\n\n`;
      break;
    case 'heading_1':
      md = `${indent}# ${text}\n\n`;
      break;
    case 'heading_2':
      md = `${indent}## ${text}\n\n`;
      break;
    case 'heading_3':
      md = `${indent}### ${text}\n\n`;
      break;
    case 'bulleted_list_item':
      md = `${indent}- ${text}\n`;
      break;
    case 'numbered_list_item':
      md = `${indent}1. ${text}\n`;
      break;
    case 'to_do':
      const checked = data.checked ? '[x]' : '[ ]';
      md = `${indent}- ${checked} ${text}\n`;
      break;
    case 'code':
      md = `${indent}\`\`\`${data.language || ''}\n${text}\n\`\`\`\n\n`;
      break;
    case 'quote':
      md = `${indent}> ${text}\n\n`;
      break;
    case 'divider':
      md = `${indent}---\n\n`;
      break;
    case 'callout':
      md = `${indent}> [!NOTE]\n${indent}> ${text}\n\n`;
      break;
    case 'image':
      const imgUrl = data.type === 'external' ? data.external.url : data.file.url;
      md = `${indent}![Image](${imgUrl})\n\n`;
      break;
    case 'bookmark':
      md = `${indent}[Bookmark](${data.url})\n\n`;
      break;
    case 'link_to_page':
      md = `${indent}[Link to Page](${data.page_id})\n\n`;
      break;
    case 'child_page':
      md = `${indent}*Child Page: ${data.title} (${block.id})*\n\n`;
      break;
    case 'child_database':
      md = `${indent}*Child Database: ${data.title} (${block.id})*\n\n`;
      break;
    default:
      md = `${indent}*[Unsupported block type: ${type}]*\n\n`;
      break;
  }

  // Handle nested children if block has children
  if (block.has_children) {
    try {
      const children = await fetchBlockChildren(block.id, apiKey);
      let childrenMd = '';
      for (const child of children) {
        childrenMd += await blockToMarkdown(child, apiKey, indent + '  ');
      }
      md += childrenMd;
    } catch (e) {
      md += `${indent}*Failed to load children: ${e.message}*\n\n`;
    }
  }

  return md;
}

async function main() {
  loadEnv();
  
  const args = process.argv.slice(2);
  let apiKey = process.env.NOTION_API_KEY;
  let pageId = process.env.NOTION_PAGE_ID;
  let dbId = process.env.NOTION_DATABASE_ID;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && i + 1 < args.length) {
      apiKey = args[++i];
    } else if (args[i] === '--page' && i + 1 < args.length) {
      pageId = args[++i];
    } else if (args[i] === '--database' && i + 1 < args.length) {
      dbId = args[++i];
    }
  }

  // Clean IDs (Notion IDs are 32-char hex)
  const cleanId = (id) => {
    if (!id) return '';
    const match = id.match(/([a-f0-9]{32})/i);
    if (match) return match[1];
    return id.replace(/-/g, '').trim();
  };

  const resolvedPageId = cleanId(pageId);
  const resolvedDbId = cleanId(dbId);

  if (!apiKey) {
    console.error('Error: NOTION_API_KEY is required. Pass via --key or add to .env file.');
    process.exit(1);
  }

  if (!resolvedPageId && !resolvedDbId) {
    console.error('Error: Either --page or --database ID is required.');
    process.exit(1);
  }

  if (resolvedPageId) {
    console.log(`[Notion CLI] Fetching page content for ${resolvedPageId}...`);
    try {
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${resolvedPageId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28'
        }
      });
      let title = 'Untitled';
      if (pageRes.ok) {
        const pageData = await pageRes.json();
        const titleProp = Object.values(pageData.properties || {}).find(p => p.type === 'title');
        if (titleProp && titleProp.title) {
          title = parseRichText(titleProp.title);
        }
      }

      const blocks = await fetchBlockChildren(resolvedPageId, apiKey);
      
      let markdown = `# ${title}\n\n`;
      for (const block of blocks) {
        markdown += await blockToMarkdown(block, apiKey);
      }

      console.log('\n--- Notion Page Content (Markdown) ---');
      console.log(markdown);
      console.log('--------------------------------------');

      // Save to scratch directory
      const scratchDir = path.resolve(__dirname, '../scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      const safeTitle = title.replace(/[^a-zA-Z0-9가-힣]/g, '_').substring(0, 30);
      const savePath = path.join(scratchDir, `notion_${resolvedPageId}_${safeTitle}.md`);
      fs.writeFileSync(savePath, markdown, 'utf8');
      console.log(`\nSaved content to: file:///${savePath.replace(/\\/g, '/')}`);

    } catch (err) {
      console.error('Error fetching page:', err.message);
      process.exit(1);
    }
  } else if (resolvedDbId) {
    console.log(`[Notion CLI] Querying database ${resolvedDbId}...`);
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${resolvedDbId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Status ${res.status} - ${errText}`);
      }
      const data = await res.json();
      console.log(`\nFound ${data.results?.length || 0} items in database:`);
      
      for (const page of data.results || []) {
        const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
        const titleText = titleProp ? parseRichText(titleProp.title) : 'Untitled';
        console.log(`- [${page.id}] ${titleText}`);
      }
    } catch (err) {
      console.error('Error querying database:', err.message);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

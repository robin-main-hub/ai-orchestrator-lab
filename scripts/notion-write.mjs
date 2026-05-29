import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.trim().match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

// Convert markdown text to rich_text array (supports bold, code, link)
function textToRichText(text) {
  if (!text) return [];
  
  // Regex to split on bold (**bold**), code (`code`), or markdown link ([label](url))
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);
  
  return parts.filter(p => p !== '').map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return {
        type: 'text',
        text: { content: part.slice(2, -2) },
        annotations: { bold: true }
      };
    } else if (part.startsWith('`') && part.endsWith('`')) {
      return {
        type: 'text',
        text: { content: part.slice(1, -1) },
        annotations: { code: true }
      };
    } else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const urlIdx = part.indexOf('](');
      const label = part.slice(1, urlIdx);
      const url = part.slice(urlIdx + 2, -1);
      return {
        type: 'text',
        text: { 
          content: label,
          link: { url } 
        }
      };
    }
    return {
      type: 'text',
      text: { content: part }
    };
  });
}

function parseMarkdownToNotionBlocks(mdContent) {
  const lines = mdContent.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // Skip closing ```
      
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{ type: 'text', text: { content: codeLines.join('\n') } }],
          language: lang || 'javascript'
        }
      });
      continue;
    }

    // Table block
    if (trimmed.startsWith('|')) {
      const tableRows = [];
      let colCount = 0;
      
      // Parse consecutive table rows
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowTrimmed = lines[i].trim();
        
        // Skip separator line (e.g. | :--- | :--- |)
        if (rowTrimmed.includes('---') || rowTrimmed.includes('-:')) {
          i++;
          continue;
        }

        // Split columns, remove empty ends
        const cols = rowTrimmed.split('|').map(c => c.trim());
        if (cols.length > 2) {
          const cells = cols.slice(1, -1); // exclude empty columns at edges
          colCount = Math.max(colCount, cells.length);
          tableRows.push({
            type: 'table_row',
            table_row: {
              cells: cells.map(cellText => textToRichText(cellText))
            }
          });
        }
        i++;
      }

      if (tableRows.length > 0) {
        blocks.push({
          object: 'block',
          type: 'table',
          table: {
            table_width: colCount,
            has_column_header: true,
            children: tableRows
          }
        });
      }
      continue;
    }

    // Headers
    if (trimmed.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: textToRichText(trimmed.slice(2))
        }
      });
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: textToRichText(trimmed.slice(3))
        }
      });
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: textToRichText(trimmed.slice(4))
        }
      });
      i++;
      continue;
    }

    // Divider
    if (trimmed === '---') {
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });
      i++;
      continue;
    }

    // Quote
    if (trimmed.startsWith('> ')) {
      // Handle GFM Alert styles like > [!NOTE] or > [!IMPORTANT]
      let quoteText = trimmed.slice(2);
      if (quoteText.startsWith('[!')) {
        const endBracket = quoteText.indexOf(']');
        if (endBracket !== -1) {
          const alertType = quoteText.slice(2, endBracket);
          quoteText = `[${alertType}] ` + quoteText.slice(endBracket + 1).trim();
        }
      }
      
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: textToRichText(quoteText)
        }
      });
      i++;
      continue;
    }

    // Bullet list item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: textToRichText(trimmed.slice(2))
        }
      });
      i++;
      continue;
    }

    // Numbered list item
    const numMatch = trimmed.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: textToRichText(numMatch[2])
        }
      });
      i++;
      continue;
    }

    // Paragraph
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: textToRichText(trimmed)
      }
    });
    i++;
  }

  return blocks;
}

async function appendBlocks(pageId, apiKey, blocks) {
  // Notion API limit: max 100 blocks per request. We batch them into size of 50.
  const chunkSize = 50;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    console.log(`[Notion Exporter] Uploading blocks ${i + 1} to ${Math.min(i + chunkSize, blocks.length)}...`);
    
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ children: chunk })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to append blocks: ${res.status} - ${errText}`);
    }
    
    console.log(`[Notion Exporter] Successfully uploaded chunk.`);
  }
}

async function main() {
  loadEnv();
  
  const args = process.argv.slice(2);
  let apiKey = process.env.NOTION_API_KEY;
  let pageId = process.env.NOTION_PAGE_ID;
  let manualPath = args[0] || '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && i + 1 < args.length) {
      apiKey = args[++i];
    } else if (args[i] === '--page' && i + 1 < args.length) {
      pageId = args[++i];
    } else if (args[i] === '--file' && i + 1 < args.length) {
      manualPath = args[++i];
    }
  }

  if (!apiKey) {
    console.error('Error: NOTION_API_KEY is required. Pass via --key or add to .env file.');
    process.exit(1);
  }
  if (!pageId) {
    console.error('Error: NOTION_PAGE_ID is required. Pass via --page or add to .env file.');
    process.exit(1);
  }

  // Clean IDs (32-char hex format)
  const cleanId = (id) => {
    if (!id) return '';
    const match = id.match(/([a-f0-9]{32})/i);
    if (match) return match[1];
    return id.replace(/-/g, '').trim();
  };

  const resolvedPageId = cleanId(pageId);

  // If manualPath is empty, default to the artifact path
  if (!manualPath) {
    // Attempt to locate pipeline_manual.md inside AppData/brain/conversationId
    const brainDir = path.resolve(process.env.APPDATA || '', '.gemini/antigravity/brain/58b739b3-10f4-4970-a802-38a117067044');
    manualPath = path.join(brainDir, 'pipeline_manual.md');
    if (!fs.existsSync(manualPath)) {
      // Fallback to project root if it exists
      manualPath = path.resolve(__dirname, '../pipeline_manual.md');
    }
  }

  if (!fs.existsSync(manualPath)) {
    console.error(`Error: Manual file not found at ${manualPath}`);
    process.exit(1);
  }

  console.log(`[Notion Exporter] Reading manual from: ${manualPath}`);
  const mdContent = fs.readFileSync(manualPath, 'utf8');

  console.log('[Notion Exporter] Parsing Markdown into Notion Blocks...');
  const blocks = parseMarkdownToNotionBlocks(mdContent);
  console.log(`[Notion Exporter] Parsed ${blocks.length} blocks.`);

  console.log(`[Notion Exporter] Appending blocks to page ${resolvedPageId}...`);
  await appendBlocks(resolvedPageId, apiKey, blocks);
  console.log(`[Notion Exporter] Done! Manual has been successfully written to Notion.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

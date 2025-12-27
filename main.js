import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { username, password, maxArticles = 50 } = input;

const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
await page.setViewport({ width: 1920, height: 1080 });

const delay = ms => new Promise(r => setTimeout(r, ms));
let articlesScraped = 0;

try {
    // 1. LOGIN
    console.log('🔐 Logging in...');
    await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', { waitUntil: 'networkidle2' });
    
    await page.type('#ContentPlaceHolder1_txtUserName', username);
    await page.type('#ContentPlaceHolder1_txtUserPass', password);
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#ContentPlaceHolder1_cmdLogin')
    ]);
    await delay(2000);
    console.log('✅ Login done\n');
    
    // 2. GET ARTICLE LIST
    console.log('📋 Getting article list...');
    await page.goto('https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx', { waitUntil: 'networkidle2' });
    await delay(2000);
    
    const articles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/Content/') && a.href.endsWith('.aspx'))
            .map(a => ({ url: a.href, title: a.textContent.trim() }))
            .filter(a => a.title.length > 20)
            .filter((a, i, arr) => arr.findIndex(x => x.url === a.url) === i);
    });
    
    console.log(`Found ${articles.length} articles\n`);
    
    // 3. SCRAPE EACH ARTICLE
    const toScrape = articles.slice(0, maxArticles);
    
    for (let i = 0; i < toScrape.length; i++) {
        const article = toScrape[i];
        console.log(`📄 [${i + 1}/${toScrape.length}] ${article.title.slice(0, 50)}...`);
        
        await page.goto(article.url, { waitUntil: 'networkidle2' });
        await delay(2000);
        
        // Content is in Frame 1 (the iframe with EMS_Viewer)
        const frames = page.frames();
        const contentFrame = frames.find(f => f.url().includes('EMS_Viewer'));
        
        if (!contentFrame) {
            console.log('   ❌ Content frame not found');
            continue;
        }
        
        // Extract and format content from the iframe
        const data = await contentFrame.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // Check if blocked
            if (bodyText.includes('Log in to view full article')) {
                return { blocked: true };
            }
            
            // Get title
            const h1 = document.querySelector('h1');
            const title = h1 ? h1.innerText.trim() : '';
            
            // Get metadata
            const wordMatch = bodyText.match(/Word Count:\s*(\d+)/);
            const dateMatch = bodyText.match(/Article Date:\s*([A-Za-z]+\s+\d{4})/);
            
            // --- EXTRACT ARTICLE CONTENT AS MARKDOWN ---
            
            // Find the main content container (try various selectors)
            const contentContainer = document.querySelector('#ContentPlaceHolder1') ||
                                    document.querySelector('.article-content') ||
                                    document.querySelector('article') ||
                                    document.body;
            
            // Clone to avoid modifying the page
            const clone = contentContainer.cloneNode(true);
            
            // Remove navigation and unwanted elements
            const removeSelectors = [
                'nav', 'header', 'footer', 'aside',
                '.menu', '.nav', '.sidebar', '.search',
                '[class*="menu"]', '[class*="nav"]',
                'script', 'style', 'noscript',
                'form', 'input', 'button',
                '[id*="Search"]', '[class*="Search"]'
            ];
            removeSelectors.forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            });
            
            // Convert HTML to Markdown
            function htmlToMarkdown(element) {
                let markdown = '';
                
                function processNode(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.textContent;
                    }
                    
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        return '';
                    }
                    
                    const tag = node.tagName.toLowerCase();
                    let content = '';
                    
                    // Process children first
                    for (const child of node.childNodes) {
                        content += processNode(child);
                    }
                    
                    // Apply formatting based on tag
                    switch (tag) {
                        case 'h1':
                            return `\n# ${content.trim()}\n\n`;
                        case 'h2':
                            return `\n## ${content.trim()}\n\n`;
                        case 'h3':
                            return `\n### ${content.trim()}\n\n`;
                        case 'h4':
                            return `\n#### ${content.trim()}\n\n`;
                        case 'p':
                            return `${content.trim()}\n\n`;
                        case 'br':
                            return '\n';
                        case 'strong':
                        case 'b':
                            return `**${content.trim()}**`;
                        case 'em':
                        case 'i':
                            return `*${content.trim()}*`;
                        case 'ul':
                            return `\n${content}\n`;
                        case 'ol':
                            return `\n${content}\n`;
                        case 'li':
                            return `- ${content.trim()}\n`;
                        case 'a':
                            const href = node.getAttribute('href');
                            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                                return `[${content.trim()}](${href})`;
                            }
                            return content;
                        case 'blockquote':
                            return `\n> ${content.trim().replace(/\n/g, '\n> ')}\n\n`;
                        case 'code':
                            return `\`${content}\``;
                        case 'pre':
                            return `\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
                        case 'table':
                            return `\n${content}\n`;
                        case 'tr':
                            return `|${content}\n`;
                        case 'td':
                        case 'th':
                            return ` ${content.trim()} |`;
                        case 'div':
                        case 'span':
                        case 'section':
                            return content;
                        default:
                            return content;
                    }
                }
                
                markdown = processNode(element);
                
                // Clean up the markdown
                markdown = markdown
                    // Remove navigation items
                    .replace(/^(Home|Logout|Welcome.*|Subscriber.*|Contact|SEARCH|Help|RESOURCES|Articles|Business Owner.*|Tax Professional.*|Tax Planning.*|Tax Saver.*|Helpful IRS.*)\n/gm, '')
                    // Remove metadata lines at start
                    .replace(/^Article Date:.*\n/gm, '')
                    .replace(/^Word Count:.*\n/gm, '')
                    // Remove share buttons text
                    .replace(/Share\s*(Facebook|Twitter|LinkedIn|Email)?\s*/g, '')
                    .replace(/\[ CLICK HERE TO PRINT \]/g, '')
                    // Clean multiple newlines
                    .replace(/\n{3,}/g, '\n\n')
                    // Clean multiple spaces
                    .replace(/[ \t]+/g, ' ')
                    // Trim lines
                    .split('\n').map(line => line.trim()).join('\n')
                    // Final trim
                    .trim();
                
                return markdown;
            }
            
            const markdownContent = htmlToMarkdown(clone);
            
            return {
                blocked: false,
                title,
                content: markdownContent,
                contentLength: markdownContent.length,
                wordCount: wordMatch ? parseInt(wordMatch[1]) : null,
                articleDate: dateMatch ? dateMatch[1] : null,
                url: window.location.href
            };
        });
        
        if (data.blocked) {
            console.log('   ❌ Blocked');
            continue;
        }
        
        console.log(`   ✅ ${data.contentLength} chars`);
        
        await Actor.pushData({
            ...data,
            originalUrl: article.url,
            scrapedAt: new Date().toISOString(),
            articleNumber: i + 1
        });
        
        articlesScraped++;
        await delay(1500);
    }
    
} catch (err) {
    console.error('Error:', err.message);
} finally {
    await browser.close();
}

console.log(`\n✅ Done! Scraped ${articlesScraped} articles`);
await Actor.exit();

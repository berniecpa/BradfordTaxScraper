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
        
        // Extract content from the iframe
        const data = await contentFrame.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // Check if blocked
            if (bodyText.includes('Log in to view full article')) {
                return { blocked: true };
            }
            
            // Get title from H1
            const h1 = document.querySelector('h1');
            const title = h1 ? h1.innerText.trim() : '';
            
            // Get metadata
            const wordMatch = bodyText.match(/Word Count:\s*(\d+)/);
            const dateMatch = bodyText.match(/Article Date:\s*([A-Za-z]+\s+\d{4})/);
            
            // ========== EXTRACT CLEAN ARTICLE CONTENT ==========
            
            // Get the raw text
            let rawText = bodyText;
            
            // STEP 1: Find where article starts (the title)
            const titleIndex = rawText.indexOf(title);
            if (titleIndex > 0) {
                // Keep a small amount before title (for date line)
                const startSearch = Math.max(0, titleIndex - 100);
                const beforeTitle = rawText.slice(startSearch, titleIndex);
                
                // Look for date pattern like "December 2025"
                const dateLineMatch = beforeTitle.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/);
                if (dateLineMatch) {
                    const datePos = beforeTitle.lastIndexOf(dateLineMatch[0]);
                    rawText = rawText.slice(startSearch + datePos);
                } else {
                    rawText = rawText.slice(titleIndex);
                }
            }
            
            // STEP 2: Find where article ends (before footer navigation)
            const endPatterns = [
                /\n\s*Home\s*\n\s*Logout/,
                /\n\s*-\s*\[Home\]/,
                /\n\s*Welcome New Users/,
                /\nSubscriber Services\s*\n/,
                /\n\s*Why Subscribe\?/,
                /Share this entire article/i,
            ];
            
            for (const pattern of endPatterns) {
                const match = rawText.match(pattern);
                if (match) {
                    rawText = rawText.slice(0, match.index);
                    break;
                }
            }
            
            // STEP 3: Clean up the text
            let content = rawText
                // Remove print/share buttons text
                .replace(/\[\s*CLICK HERE TO PRINT\s*\]/gi, '')
                .replace(/Share\s*(Facebook|Twitter|LinkedIn|Email)?\s*/gi, '')
                // Remove Word Count and Article Date lines
                .replace(/Word Count:\s*\d+\s*/g, '')
                .replace(/Article Date:\s*[A-Za-z]+\s+\d{4}\s*/g, '')
                // Clean multiple newlines
                .replace(/\n{3,}/g, '\n\n')
                // Clean multiple spaces
                .replace(/[ \t]+/g, ' ')
                // Trim each line
                .split('\n').map(line => line.trim()).join('\n')
                .trim();
            
            return {
                blocked: false,
                title,
                content,
                contentLength: content.length,
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

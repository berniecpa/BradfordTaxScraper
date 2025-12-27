import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { 
    username, 
    password, 
    maxArticles = 50,
    startUrl = 'https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx'
} = input;

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
    
    // Verify login
    const loggedIn = await page.evaluate(() => document.body.innerText.includes('Logout'));
    if (!loggedIn) {
        throw new Error('Login failed');
    }
    console.log('✅ Login successful\n');
    
    // 2. GO TO ARTICLE LIST
    console.log('📋 Getting article list...');
    await page.goto(startUrl, { waitUntil: 'networkidle2' });
    await delay(1500);
    
    // Get article links
    const articles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/Content/') && a.href.endsWith('.aspx'))
            .map(a => ({ url: a.href, title: a.textContent.trim() }))
            .filter(a => a.title.length > 15)
            .filter((a, i, arr) => arr.findIndex(x => x.url === a.url) === i); // dedupe
    });
    
    console.log(`Found ${articles.length} articles\n`);
    
    if (articles.length === 0) {
        throw new Error('No articles found');
    }
    
    // 3. SCRAPE EACH ARTICLE
    const toScrape = articles.slice(0, maxArticles);
    
    for (let i = 0; i < toScrape.length; i++) {
        const article = toScrape[i];
        console.log(`📄 [${i + 1}/${toScrape.length}] ${article.title.slice(0, 55)}...`);
        
        try {
            await page.goto(article.url, { waitUntil: 'networkidle2' });
            await delay(1500);
            
            // Extract content
            const data = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                
                // Check if blocked
                if (bodyText.includes('Log in to view full article')) {
                    return { blocked: true };
                }
                
                // Get title
                const h1 = document.querySelector('h1');
                const title = h1 ? h1.innerText.trim() : document.title;
                
                // Get content - try ContentPlaceHolder1 first, then clean body
                let content = '';
                const placeholder = document.querySelector('#ContentPlaceHolder1');
                if (placeholder) {
                    content = placeholder.innerText.trim();
                } else {
                    const clone = document.body.cloneNode(true);
                    clone.querySelectorAll('nav, header, footer, script, style, aside').forEach(el => el.remove());
                    content = clone.innerText.trim();
                }
                
                // Get metadata
                const wordMatch = bodyText.match(/Word Count:\s*(\d+)/);
                const dateMatch = bodyText.match(/Article Date:\s*([A-Za-z]+\s+\d{4})/);
                
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
                console.log('   ❌ Blocked - session lost');
                continue;
            }
            
            console.log(`   ✅ ${data.contentLength} chars`);
            
            await Actor.pushData({
                ...data,
                scrapedAt: new Date().toISOString(),
                articleNumber: i + 1
            });
            
            articlesScraped++;
            await delay(1500);
            
        } catch (err) {
            console.log(`   ❌ Error: ${err.message}`);
        }
    }
    
} catch (err) {
    console.error('Fatal error:', err.message);
} finally {
    await browser.close();
}

console.log(`\n✅ Done! Scraped ${articlesScraped} articles`);
await Actor.exit();

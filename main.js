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
    
    // 2. GO TO ARTICLE LIST
    console.log('📋 Getting article list...');
    await page.goto('https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx', { waitUntil: 'networkidle2' });
    await delay(2000);
    
    // Get article URLs
    const articles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/Content/') && a.href.endsWith('.aspx'))
            .map(a => ({ url: a.href, title: a.textContent.trim() }))
            .filter(a => a.title.length > 20)
            .filter((a, i, arr) => arr.findIndex(x => x.url === a.url) === i);
    });
    
    console.log(`Found ${articles.length} articles\n`);
    
    // 3. SCRAPE EACH ARTICLE BY CLICKING LINKS
    const toScrape = articles.slice(0, maxArticles);
    
    for (let i = 0; i < toScrape.length; i++) {
        const article = toScrape[i];
        console.log(`📄 [${i + 1}/${toScrape.length}] ${article.title.slice(0, 50)}...`);
        
        // Go back to list page first
        await page.goto('https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx', { waitUntil: 'networkidle2' });
        await delay(1000);
        
        // Click the article link (not goto)
        const clicked = await page.evaluate((url) => {
            const link = document.querySelector(`a[href="${url.replace('https://bradfordtaxinstitute.com', '')}"]`) ||
                         document.querySelector(`a[href="${url}"]`);
            if (link) {
                link.click();
                return true;
            }
            return false;
        }, article.url);
        
        if (!clicked) {
            console.log('   ❌ Could not find link');
            continue;
        }
        
        await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
        await delay(2000);
        
        // Check if blocked
        const isBlocked = await page.evaluate(() => 
            document.body.innerText.includes('Log in to view full article')
        );
        
        if (isBlocked) {
            console.log('   ❌ Blocked');
            continue;
        }
        
        // Extract content
        const data = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            const title = h1 ? h1.innerText.trim() : document.title;
            
            const placeholder = document.querySelector('#ContentPlaceHolder1');
            const content = placeholder ? placeholder.innerText.trim() : document.body.innerText;
            
            const wordMatch = document.body.innerText.match(/Word Count:\s*(\d+)/);
            const dateMatch = document.body.innerText.match(/Article Date:\s*([A-Za-z]+\s+\d{4})/);
            
            return {
                title,
                content,
                contentLength: content.length,
                wordCount: wordMatch ? parseInt(wordMatch[1]) : null,
                articleDate: dateMatch ? dateMatch[1] : null,
                url: window.location.href
            };
        });
        
        console.log(`   ✅ ${data.contentLength} chars`);
        
        await Actor.pushData({
            ...data,
            scrapedAt: new Date().toISOString(),
            articleNumber: i + 1
        });
        
        articlesScraped++;
    }
    
} catch (err) {
    console.error('Error:', err.message);
} finally {
    await browser.close();
}

console.log(`\n✅ Done! Scraped ${articlesScraped} articles`);
await Actor.exit();

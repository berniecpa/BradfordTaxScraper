import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { username, password, maxArticles = 3 } = input;

const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
await page.setViewport({ width: 1920, height: 1080 });

const delay = ms => new Promise(r => setTimeout(r, ms));

async function debug(name) {
    const screenshot = await page.screenshot({ fullPage: true });
    await Actor.setValue(`${name}.png`, screenshot, { contentType: 'image/png' });
    console.log(`📸 Saved: ${name}.png`);
}

try {
    // 1. LOGIN
    console.log('\n=== STEP 1: LOGIN ===');
    await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', { waitUntil: 'networkidle2' });
    
    await page.type('#ContentPlaceHolder1_txtUserName', username);
    await page.type('#ContentPlaceHolder1_txtUserPass', password);
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#ContentPlaceHolder1_cmdLogin')
    ]);
    await delay(2000);
    console.log('Login done, URL:', page.url());
    
    // 2. GO TO ARTICLE LIST
    console.log('\n=== STEP 2: ARTICLE LIST ===');
    await page.goto('https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx', { waitUntil: 'networkidle2' });
    await delay(2000);
    
    // Get articles
    const articles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/Content/') && a.href.endsWith('.aspx'))
            .map(a => ({ url: a.href, title: a.textContent.trim() }))
            .filter(a => a.title.length > 20)
            .slice(0, 10);
    });
    
    console.log(`Found ${articles.length} articles`);
    
    // 3. SCRAPE ARTICLES - DEBUG EACH ONE
    console.log('\n=== STEP 3: SCRAPING ===');
    
    const toScrape = articles.slice(0, maxArticles);
    
    for (let i = 0; i < toScrape.length; i++) {
        const article = toScrape[i];
        console.log(`\n--- Article ${i + 1}: ${article.title.slice(0, 40)}... ---`);
        console.log('URL:', article.url);
        
        // Navigate using goto (session works per your screenshot)
        await page.goto(article.url, { waitUntil: 'networkidle2' });
        await delay(2000);
        
        // Screenshot EVERY article
        await debug(`article-${i + 1}`);
        
        // Debug: Check what content is available in different selectors
        const debugInfo = await page.evaluate(() => {
            const selectors = [
                '#ContentPlaceHolder1',
                '#ContentPlaceHolder1_lblArticle',
                '#ContentPlaceHolder1_pnlArticle',
                'article',
                '.article-content',
                'main',
                'body'
            ];
            
            const results = {};
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    results[sel] = {
                        exists: true,
                        textLength: el.innerText.trim().length,
                        preview: el.innerText.trim().slice(0, 100)
                    };
                } else {
                    results[sel] = { exists: false };
                }
            }
            
            // Also get all element IDs on the page
            const allIds = Array.from(document.querySelectorAll('[id]'))
                .map(el => el.id)
                .filter(id => id.toLowerCase().includes('content') || id.toLowerCase().includes('article'))
                .slice(0, 20);
            
            return { selectors: results, relevantIds: allIds };
        });
        
        console.log('\nSelector debug:');
        for (const [sel, info] of Object.entries(debugInfo.selectors)) {
            if (info.exists) {
                console.log(`  ${sel}: ${info.textLength} chars - "${info.preview.slice(0, 50)}..."`);
            } else {
                console.log(`  ${sel}: NOT FOUND`);
            }
        }
        
        console.log('\nRelevant IDs on page:', debugInfo.relevantIds.join(', '));
        
        // Check if blocked
        const isBlocked = await page.evaluate(() => 
            document.body.innerText.includes('Log in to view full article')
        );
        console.log('Blocked:', isBlocked);
    }
    
    console.log('\n=== DONE ===');
    console.log('Check the screenshots in Key-Value Store to see what content is available');
    
} catch (err) {
    console.error('Error:', err.message);
    await debug('error');
} finally {
    await browser.close();
}

await Actor.exit();

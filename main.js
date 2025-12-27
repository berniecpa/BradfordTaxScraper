import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { username, password, maxArticles = 10 } = input;

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
    const html = await page.content();
    await Actor.setValue(`${name}.html`, html, { contentType: 'text/html' });
    console.log(`📸 Saved: ${name}`);
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
    
    console.log('URL after login:', page.url());
    await debug('01-after-login');
    
    // Check cookies
    const cookies = await page.cookies();
    console.log('Cookies:', cookies.map(c => `${c.name}=${c.value.slice(0,15)}... [path:${c.path}]`).join('\n         '));
    
    // 2. GO TO ARTICLE LIST
    console.log('\n=== STEP 2: ARTICLE LIST ===');
    await page.goto('https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx', { waitUntil: 'networkidle2' });
    await delay(2000);
    
    console.log('URL:', page.url());
    await debug('02-article-list');
    
    // Get article links
    const articles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/Content/') && a.href.endsWith('.aspx'))
            .map(a => ({ url: a.href, title: a.textContent.trim() }))
            .filter(a => a.title.length > 20)
            .slice(0, 10);
    });
    
    console.log(`Found ${articles.length} articles:`);
    articles.forEach((a, i) => console.log(`  ${i+1}. ${a.title.slice(0,50)}`));
    
    if (articles.length === 0) {
        throw new Error('No articles found');
    }
    
    // 3. SCRAPE ARTICLES
    console.log('\n=== STEP 3: SCRAPING ARTICLES ===');
    
    const toScrape = articles.slice(0, maxArticles);
    let articlesScraped = 0;
    
    for (let i = 0; i < toScrape.length; i++) {
        const article = toScrape[i];
        console.log(`\n📄 [${i + 1}/${toScrape.length}] ${article.title.slice(0, 50)}...`);
        console.log('Target:', article.url);
        
        // Go back to article list first
        await page.goto('https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx', { waitUntil: 'networkidle2' });
        await delay(1000);
        
        // Try clicking the link instead of navigating
        const clicked = await page.evaluate((url) => {
            const link = document.querySelector(`a[href="${url.replace('https://bradfordtaxinstitute.com', '')}"]`) ||
                         document.querySelector(`a[href="${url}"]`);
            if (link) {
                link.click();
                return true;
            }
            return false;
        }, article.url);
        
        if (clicked) {
            console.log('Clicked link, waiting for navigation...');
            await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
        } else {
            console.log('Could not find link to click, using goto...');
            await page.goto(article.url, { waitUntil: 'networkidle2' });
        }
        
        await delay(2000);
        console.log('URL:', page.url());
        
        if (i === 0) {
            await debug('03-first-article');
        }
        
        // Check if blocked
        const pageText = await page.evaluate(() => document.body.innerText);
        const isBlocked = pageText.includes('Log in to view full article');
        console.log('Blocked:', isBlocked);
        
        if (isBlocked) {
            console.log('❌ SESSION NOT PERSISTING TO ARTICLE PAGE');
            if (i === 0) {
                const articleCookies = await page.cookies();
                console.log('Cookies on article page:');
                console.log(articleCookies.map(c => `${c.name}=${c.value.slice(0,15)}... [path:${c.path}]`).join('\n'));
            }
            continue;
        }
        
        // Extract content
        const data = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            const title = h1 ? h1.innerText.trim() : document.title;
            
            const el = document.querySelector('#ContentPlaceHolder1') || document.body;
            const content = el.innerText.trim();
            
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
        
        console.log(`✅ ${data.contentLength} chars`);
        
        await Actor.pushData({
            ...data,
            scrapedAt: new Date().toISOString(),
            articleNumber: i + 1
        });
        
        articlesScraped++;
    }
    
    console.log(`\n✅ Done! Scraped ${articlesScraped} articles`);
    
} catch (err) {
    console.error('Error:', err.message);
    await debug('error');
} finally {
    await browser.close();
}

await Actor.exit();

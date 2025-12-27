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
    
    // 3. CLICK FIRST ARTICLE (not navigate - click the actual link)
    console.log('\n=== STEP 3: FIRST ARTICLE ===');
    const firstArticleUrl = articles[0].url;
    console.log('Target:', firstArticleUrl);
    
    // Try clicking the link instead of navigating
    const clicked = await page.evaluate((url) => {
        const link = document.querySelector(`a[href="${url.replace('https://bradfordtaxinstitute.com', '')}"]`) ||
                     document.querySelector(`a[href="${url}"]`);
        if (link) {
            link.click();
            return true;
        }
        return false;
    }, firstArticleUrl);
    
    if (clicked) {
        console.log('Clicked link, waiting for navigation...');
        await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    } else {
        console.log('Could not find link to click, using goto...');
        await page.goto(firstArticleUrl, { waitUntil: 'networkidle2' });
    }
    
    await delay(2000);
    console.log('URL:', page.url());
    await debug('03-first-article');
    
    // Check if blocked
    const pageText = await page.evaluate(() => document.body.innerText);
    const isBlocked = pageText.includes('Log in to view full article');
    console.log('Blocked:', isBlocked);
    
    if (isBlocked) {
        console.log('\n❌ SESSION NOT PERSISTING TO ARTICLE PAGE');
        console.log('Cookies on article page:');
        const articleCookies = await page.cookies();
        console.log(articleCookies.map(c => `${c.name}=${c.value.slice(0,15)}... [path:${c.path}]`).join('\n'));
    } else {
        console.log('\n✅ SESSION WORKING - Can see full article');
        
        // Extract content
        const content = await page.evaluate(() => {
            const el = document.querySelector('#ContentPlaceHolder1') || document.body;
            return el.innerText.slice(0, 500);
        });
        console.log('Content preview:', content.slice(0, 300));
    }
    
} catch (err) {
    console.error('Error:', err.message);
    await debug('error');
} finally {
    await browser.close();
}

await Actor.exit();

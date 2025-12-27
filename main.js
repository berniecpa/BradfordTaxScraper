import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { 
    username, 
    password, 
    maxArticles = 50,
    startUrl = 'https://bradfordtaxinstitute.com/Readers/Issue-12-01-2025.aspx',
    debug = true
} = input;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('🚀 Starting Bradford Tax Institute Scraper');
console.log(`📊 Target: ${maxArticles} articles max`);

let articlesScraped = 0;

const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
    ]
});

const page = await browser.newPage();

await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
await page.setViewport({ width: 1920, height: 1080 });

async function saveDebug(name) {
    if (!debug) return;
    try {
        const screenshot = await page.screenshot({ fullPage: true });
        await Actor.setValue(`debug-${name}-screenshot`, screenshot, { contentType: 'image/png' });
        const html = await page.content();
        await Actor.setValue(`debug-${name}-html`, html, { contentType: 'text/html' });
        console.log(`   📸 Debug saved: ${name}`);
    } catch (e) {
        console.log(`   ⚠️ Debug save failed: ${e.message}`);
    }
}

try {
    // ========================================
    // STEP 1: LOGIN
    // ========================================
    console.log('\n🔐 Step 1: Logging in...');
    
    await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });
    
    await page.waitForSelector('#ContentPlaceHolder1_txtUserName', { timeout: 10000 });
    
    const usernameField = await page.$('#ContentPlaceHolder1_txtUserName');
    const passwordField = await page.$('#ContentPlaceHolder1_txtUserPass');
    
    await usernameField.click({ clickCount: 3 });
    await usernameField.type(username, { delay: 50 });
    await passwordField.click({ clickCount: 3 });
    await passwordField.type(password, { delay: 50 });
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        page.click('#ContentPlaceHolder1_cmdLogin')
    ]);
    
    await delay(3000);
    
    const stillOnLogin = await page.$('#ContentPlaceHolder1_txtUserName');
    if (stillOnLogin) {
        await saveDebug('login-failed');
        throw new Error('Login failed - check credentials');
    }
    
    console.log('✅ Login successful!\n');
    
    // ========================================
    // STEP 2: NAVIGATE TO ARTICLE LIST
    // ========================================
    console.log(`📋 Step 2: Navigating to article list...`);
    console.log(`   URL: ${startUrl}`);
    
    await page.goto(startUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
    });
    
    await delay(2000);
    await saveDebug('article-list');
    
    // ========================================
    // STEP 3: EXTRACT ARTICLE LINKS
    // The key pattern is: /Content/*.aspx
    // ========================================
    console.log(`\n🔍 Step 3: Finding article links...`);
    
    const articleLinks = await page.evaluate(() => {
        const links = [];
        const allLinks = document.querySelectorAll('a');
        
        for (const link of allLinks) {
            const href = link.href;
            const text = link.textContent.trim();
            
            // THE KEY FIX: Only match /Content/ URLs (actual articles)
            // Pattern: https://bradfordtaxinstitute.com/Content/Article-Name.aspx
            if (href && href.includes('/Content/') && href.endsWith('.aspx')) {
                // Skip if it's not an actual article (very short title)
                if (text.length < 15) continue;
                
                links.push({
                    url: href,
                    title: text.replace(/\s+/g, ' ').trim()
                });
            }
        }
        
        // Remove duplicates
        const unique = [];
        const seen = new Set();
        for (const link of links) {
            if (!seen.has(link.url)) {
                seen.add(link.url);
                unique.push(link);
            }
        }
        
        return unique;
    });
    
    console.log(`   Found ${articleLinks.length} articles in /Content/`);
    
    if (articleLinks.length === 0) {
        console.log('\n   ⚠️ No /Content/ articles found on this page.');
        console.log('   This might be a list page. Looking for issue links...\n');
        
        // Maybe we're on a month list page - find issue links
        const issueLinks = await page.evaluate(() => {
            const links = [];
            const allLinks = document.querySelectorAll('a');
            
            for (const link of allLinks) {
                const href = link.href;
                const text = link.textContent.trim();
                
                // Issue pages are like: /Readers/Issue-MM-DD-YYYY.aspx
                if (href && href.includes('/Readers/Issue-') && href.endsWith('.aspx')) {
                    links.push({
                        url: href,
                        title: text.replace(/\s+/g, ' ').trim()
                    });
                }
            }
            
            return links.filter((item, index, self) => 
                index === self.findIndex(t => t.url === item.url)
            );
        });
        
        if (issueLinks.length > 0) {
            console.log(`   Found ${issueLinks.length} issue pages. Navigating to first issue...`);
            const firstIssue = issueLinks[0];
            console.log(`   Issue: ${firstIssue.url}`);
            
            await page.goto(firstIssue.url, { waitUntil: 'networkidle2', timeout: 30000 });
            await delay(2000);
            
            // Re-extract article links from the issue page
            const issueArticles = await page.evaluate(() => {
                const links = [];
                const allLinks = document.querySelectorAll('a');
                
                for (const link of allLinks) {
                    const href = link.href;
                    const text = link.textContent.trim();
                    
                    if (href && href.includes('/Content/') && href.endsWith('.aspx') && text.length >= 15) {
                        links.push({
                            url: href,
                            title: text.replace(/\s+/g, ' ').trim()
                        });
                    }
                }
                
                return links.filter((item, index, self) => 
                    index === self.findIndex(t => t.url === item.url)
                );
            });
            
            articleLinks.push(...issueArticles);
            console.log(`   Found ${issueArticles.length} articles in this issue`);
        }
    }
    
    if (articleLinks.length === 0) {
        await saveDebug('no-articles');
        throw new Error('No articles found - check debug files');
    }
    
    console.log(`\n   📰 Articles to scrape:`);
    articleLinks.slice(0, 10).forEach((link, i) => {
        console.log(`      ${i + 1}. ${link.title.substring(0, 60)}`);
    });
    if (articleLinks.length > 10) {
        console.log(`      ... and ${articleLinks.length - 10} more`);
    }
    
    // ========================================
    // STEP 4: SCRAPE EACH ARTICLE
    // ========================================
    console.log(`\n📚 Step 4: Scraping articles (max ${maxArticles})...\n`);
    
    const articlesToScrape = articleLinks.slice(0, maxArticles);
    
    for (let i = 0; i < articlesToScrape.length; i++) {
        const article = articlesToScrape[i];
        console.log(`📄 [${i + 1}/${articlesToScrape.length}] ${article.title.substring(0, 55)}...`);
        
        try {
            await page.goto(article.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            await delay(2000);
            
            // Save first article for debugging
            if (i === 0) {
                await saveDebug('first-article');
            }
            
            // Check for access issues
            const pageState = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                return {
                    hasLoginForm: !!document.querySelector('input[type="password"]'),
                    hasAccessDenied: bodyText.toLowerCase().includes('access denied') ||
                                    bodyText.toLowerCase().includes('please log in') ||
                                    bodyText.toLowerCase().includes('subscription required'),
                    bodyLength: bodyText.length
                };
            });
            
            if (pageState.hasLoginForm) {
                console.log(`   🔴 Session expired`);
                continue;
            }
            
            if (pageState.hasAccessDenied) {
                console.log(`   🔴 Access denied`);
                continue;
            }
            
            // Extract article content
            const articleData = await page.evaluate(() => {
                // Bradford Tax Institute uses ContentPlaceHolder1 for main content
                const contentSelectors = [
                    '#ContentPlaceHolder1_lblArticle',
                    '#ContentPlaceHolder1_pnlArticle',
                    '#ContentPlaceHolder1',
                    '.article-content',
                    'article',
                    'main'
                ];
                
                let content = '';
                let contentSource = '';
                
                for (const selector of contentSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.innerText.trim();
                        if (text.length > 300) {
                            content = text;
                            contentSource = selector;
                            break;
                        }
                    }
                }
                
                // Fallback: clean body
                if (content.length < 300) {
                    const clone = document.body.cloneNode(true);
                    clone.querySelectorAll('nav, header, footer, script, style, aside, .sidebar, #menu, .menu').forEach(el => el.remove());
                    content = clone.innerText.trim();
                    contentSource = 'body-cleaned';
                }
                
                // Get title from H1
                const h1 = document.querySelector('h1');
                const title = h1 ? h1.innerText.trim() : document.title.split(' - ')[0].trim();
                
                // Get date from page
                const dateMatch = document.body.innerText.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
                
                // Get description (first paragraph after title)
                const paragraphs = document.querySelectorAll('p');
                let description = '';
                for (const p of paragraphs) {
                    const text = p.innerText.trim();
                    if (text.length > 50 && text.length < 500) {
                        description = text;
                        break;
                    }
                }
                
                return {
                    title,
                    description,
                    content,
                    contentSource,
                    contentLength: content.length,
                    articleDate: dateMatch ? dateMatch[1] : null,
                    url: window.location.href
                };
            });
            
            console.log(`   ✅ ${articleData.contentLength} chars (${articleData.contentSource})`);
            
            await Actor.pushData({
                ...articleData,
                originalTitle: article.title,
                status: articleData.contentLength > 300 ? 'success' : 'short',
                scrapedAt: new Date().toISOString(),
                articleNumber: i + 1
            });
            
            articlesScraped++;
            
            // Respectful delay
            await delay(1500 + Math.random() * 1000);
            
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            continue;
        }
    }
    
} catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    await saveDebug('fatal-error');
    throw error;
} finally {
    await browser.close();
}

console.log('\n📊 ===== COMPLETE =====');
console.log(`✅ Scraped: ${articlesScraped} articles`);
console.log(`🎯 Target: ${maxArticles}`);
console.log('=======================\n');

await Actor.exit();

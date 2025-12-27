import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { 
    username, 
    password, 
    maxArticles = 50,
    startUrl = 'https://bradfordtaxinstitute.com/Readers/tr_MonthList.aspx'
} = input;

console.log('🚀 Starting Bradford Tax Institute Scraper');
console.log(`📊 Target: ${maxArticles} articles max`);

let articlesScraped = 0;

// Launch a single browser instance (keeps cookies throughout)
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

// Set a realistic user agent
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Set viewport
await page.setViewport({ width: 1920, height: 1080 });

try {
    // ========================================
    // STEP 1: LOGIN
    // ========================================
    console.log('\n🔐 Step 1: Logging in...');
    
    await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });
    
    console.log('   Filling credentials...');
    await page.waitForSelector('#ContentPlaceHolder1_txtUserName', { timeout: 10000 });
    await page.type('#ContentPlaceHolder1_txtUserName', username);
    await page.type('#ContentPlaceHolder1_txtUserPass', password);
    
    console.log('   Submitting login...');
    await page.click('#ContentPlaceHolder1_cmdLogin');
    
    // Wait for navigation after login
    await page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 15000 
    }).catch(() => console.log('   (Navigation timeout - may be normal)'));
    
    await page.waitForTimeout(2000);
    
    // Verify login succeeded
    const loginCheck = await page.evaluate(() => {
        const hasLoginForm = !!document.querySelector('#ContentPlaceHolder1_txtUserName');
        const bodyText = document.body.innerText;
        const hasLoggedInIndicator = bodyText.includes('Log Out') || 
                                     bodyText.includes('Logout') ||
                                     bodyText.includes('Welcome') ||
                                     !hasLoginForm;
        return {
            hasLoginForm,
            hasLoggedInIndicator,
            url: window.location.href,
            bodyPreview: bodyText.substring(0, 200)
        };
    });
    
    console.log(`   Current URL: ${loginCheck.url}`);
    console.log(`   Has login form: ${loginCheck.hasLoginForm}`);
    console.log(`   Page preview: ${loginCheck.bodyPreview}...`);
    
    if (loginCheck.hasLoginForm) {
        throw new Error('Login failed - still seeing login form');
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
    
    await page.waitForTimeout(2000);
    
    // Verify we're logged in on this page
    const listPageCheck = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return {
            url: window.location.href,
            title: document.title,
            bodyPreview: bodyText.substring(0, 300),
            hasDirectoryListingMessage: bodyText.includes('Directory Listing'),
            hasLoginPrompt: bodyText.includes('log in') || bodyText.includes('login'),
        };
    });
    
    console.log(`   Page title: ${listPageCheck.title}`);
    console.log(`   Preview: ${listPageCheck.bodyPreview.substring(0, 150)}...`);
    
    if (listPageCheck.hasDirectoryListingMessage) {
        console.log('⚠️  WARNING: Seeing "Directory Listing" message - may not be logged in properly!');
        console.log('   This suggests cookies are not persisting.');
    }
    
    // ========================================
    // STEP 3: EXTRACT ARTICLE LINKS
    // ========================================
    console.log(`\n📝 Step 3: Finding article links...`);
    
    const articleLinks = await page.evaluate(() => {
        const links = [];
        const allLinks = document.querySelectorAll('a');
        
        for (const link of allLinks) {
            const href = link.href;
            const text = link.textContent.trim();
            
            // Look for article links
            if (href && text.length > 15) {
                const isArticle = 
                    href.includes('/Content/') ||
                    href.includes('/Content_Premium/') ||
                    href.includes('Article.aspx') ||
                    text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
                
                if (isArticle) {
                    links.push({
                        url: href,
                        title: text
                    });
                }
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
    
    console.log(`   Found ${articleLinks.length} article links`);
    
    if (articleLinks.length === 0) {
        console.log('❌ No articles found! Check if you can manually access articles when logged in.');
        throw new Error('No articles found - subscription may not have access');
    }
    
    // Show first few articles
    console.log(`   Sample articles:`);
    articleLinks.slice(0, 5).forEach((link, i) => {
        console.log(`     ${i + 1}. ${link.title.substring(0, 60)}...`);
    });
    
    // ========================================
    // STEP 4: SCRAPE EACH ARTICLE
    // ========================================
    console.log(`\n📚 Step 4: Scraping articles (max ${maxArticles})...\n`);
    
    const articlesToScrape = articleLinks.slice(0, maxArticles);
    
    for (let i = 0; i < articlesToScrape.length; i++) {
        const article = articlesToScrape[i];
        console.log(`📄 Article ${i + 1}/${articlesToScrape.length}: ${article.title.substring(0, 50)}...`);
        
        try {
            // Navigate to article (on same page - cookies persist!)
            await page.goto(article.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            await page.waitForTimeout(1500);
            
            // Check if still logged in
            const pageCheck = await page.evaluate(() => ({
                url: window.location.href,
                bodyLength: document.body.innerText.length,
                hasDirectoryMessage: document.body.innerText.includes('Directory Listing')
            }));
            
            if (pageCheck.hasDirectoryMessage) {
                console.log(`   ⚠️  Session lost - seeing Directory Listing message`);
                console.log(`   Skipping article...`);
                continue;
            }
            
            if (pageCheck.bodyLength === 0) {
                console.log(`   ⚠️  Empty page - skipping`);
                continue;
            }
            
            // Extract article content
            const articleData = await page.evaluate(() => {
                const getContent = () => {
                    const selectors = [
                        '#ContentPlaceHolder1',
                        '.article-content',
                        'article',
                        '[id*="Content"]',
                        '.content',
                        'main'
                    ];
                    
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element && element.innerText.length > 100) {
                            return element.innerText;
                        }
                    }
                    
                    // Fallback: clean body text
                    const clonedBody = document.body.cloneNode(true);
                    const toRemove = clonedBody.querySelectorAll('nav, header, footer, script, style');
                    toRemove.forEach(el => el.remove());
                    return clonedBody.innerText;
                };
                
                return {
                    title: document.querySelector('h1')?.innerText || 
                           document.querySelector('title')?.innerText,
                    content: getContent(),
                    url: window.location.href,
                    htmlLength: document.body.innerHTML.length
                };
            });
            
            console.log(`   Content length: ${articleData.content?.length || 0} chars`);
            
            // Save to dataset
            await Actor.pushData({
                ...articleData,
                scrapedAt: new Date().toISOString(),
                articleNumber: i + 1
            });
            
            articlesScraped++;
            console.log(`   ✅ Saved (${articlesScraped}/${maxArticles})\n`);
            
            // Small delay between articles
            await page.waitForTimeout(1000);
            
        } catch (error) {
            console.error(`   ❌ Error scraping article: ${error.message}\n`);
            continue;
        }
    }
    
} catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    throw error;
} finally {
    await browser.close();
}

// Final stats
console.log('\n\n📊 ===== SCRAPING COMPLETE =====');
console.log(`✅ Articles scraped: ${articlesScraped}`);
console.log(`🎯 Target: ${maxArticles}`);
console.log('===============================\n');

await Actor.exit();

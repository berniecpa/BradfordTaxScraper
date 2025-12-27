import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { 
    username, 
    password, 
    maxArticles = 50,
    startUrl = 'https://bradfordtaxinstitute.com/Readers/tr_MonthList.aspx',
    debug = true
} = input;

// Helper function to replace deprecated waitForTimeout
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('🚀 Starting Bradford Tax Institute Scraper');
console.log(`📊 Target: ${maxArticles} articles max`);
console.log(`🔧 Debug mode: ${debug}`);

let articlesScraped = 0;

const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
    ]
});

const page = await browser.newPage();

// Enhanced stealth settings
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
await page.setViewport({ width: 1920, height: 1080 });

// Set extra headers to appear more legitimate
await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
});

// Intercept and log requests for debugging
if (debug) {
    page.on('response', response => {
        const status = response.status();
        if (status >= 400) {
            console.log(`   ⚠️ HTTP ${status}: ${response.url().substring(0, 80)}`);
        }
    });
}

// Helper to save debug screenshot
async function saveDebugScreenshot(name) {
    if (!debug) return;
    try {
        const screenshot = await page.screenshot({ fullPage: true });
        const key = `debug-${name}-${Date.now()}.png`;
        await Actor.setValue(key, screenshot, { contentType: 'image/png' });
        console.log(`   📸 Screenshot saved: ${key}`);
    } catch (e) {
        console.log(`   ⚠️ Could not save screenshot: ${e.message}`);
    }
}

// Helper to save page HTML for debugging
async function saveDebugHtml(name) {
    if (!debug) return;
    try {
        const html = await page.content();
        const key = `debug-${name}-${Date.now()}.html`;
        await Actor.setValue(key, html, { contentType: 'text/html' });
        console.log(`   📄 HTML saved: ${key}`);
    } catch (e) {
        console.log(`   ⚠️ Could not save HTML: ${e.message}`);
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
    
    await saveDebugScreenshot('01-login-page');
    
    // Wait for login form
    try {
        await page.waitForSelector('#ContentPlaceHolder1_txtUserName', { timeout: 10000 });
    } catch (e) {
        console.log('   ⚠️ Login form not found with expected selector');
        await saveDebugHtml('01-login-page-missing-form');
        
        // Try alternative selectors
        const altSelectors = ['input[name*="UserName"]', 'input[type="text"]', '#txtUserName'];
        for (const sel of altSelectors) {
            const found = await page.$(sel);
            if (found) {
                console.log(`   Found alternative selector: ${sel}`);
                break;
            }
        }
    }
    
    console.log('   Filling credentials...');
    
    // Clear fields first, then type slowly (more human-like)
    const usernameField = await page.$('#ContentPlaceHolder1_txtUserName');
    const passwordField = await page.$('#ContentPlaceHolder1_txtUserPass');
    
    if (usernameField && passwordField) {
        await usernameField.click({ clickCount: 3 }); // Select all
        await usernameField.type(username, { delay: 50 });
        
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(password, { delay: 50 });
    } else {
        throw new Error('Could not find username/password fields');
    }
    
    await saveDebugScreenshot('02-credentials-filled');
    
    console.log('   Submitting login...');
    
    // Click login and wait for navigation
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        page.click('#ContentPlaceHolder1_cmdLogin')
    ]);
    
    await delay(3000);
    await saveDebugScreenshot('03-after-login');
    
    // Get all cookies to verify login
    const cookies = await page.cookies();
    console.log(`   Cookies set: ${cookies.length}`);
    if (debug) {
        cookies.forEach(c => console.log(`     - ${c.name}: ${c.value.substring(0, 20)}...`));
    }
    
    // Verify login succeeded
    const loginCheck = await page.evaluate(() => {
        const hasLoginForm = !!document.querySelector('#ContentPlaceHolder1_txtUserName');
        const bodyText = document.body.innerText;
        const hasErrorMessage = bodyText.toLowerCase().includes('invalid') || 
                               bodyText.toLowerCase().includes('incorrect') ||
                               bodyText.toLowerCase().includes('failed');
        return {
            hasLoginForm,
            hasErrorMessage,
            url: window.location.href,
            bodyPreview: bodyText.substring(0, 500)
        };
    });
    
    console.log(`   Current URL: ${loginCheck.url}`);
    
    if (loginCheck.hasLoginForm) {
        console.log(`   ❌ Still on login page!`);
        console.log(`   Page text: ${loginCheck.bodyPreview}`);
        await saveDebugHtml('03-login-failed');
        throw new Error('Login failed - still seeing login form. Check credentials.');
    }
    
    if (loginCheck.hasErrorMessage) {
        console.log(`   ❌ Login error detected`);
        throw new Error('Login failed - error message on page');
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
    await saveDebugScreenshot('04-article-list');
    await saveDebugHtml('04-article-list');
    
    // Check page state
    const listPageCheck = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const links = Array.from(document.querySelectorAll('a')).map(a => ({
            href: a.href,
            text: a.textContent.trim().substring(0, 100)
        }));
        
        return {
            url: window.location.href,
            title: document.title,
            bodyLength: bodyText.length,
            linkCount: links.length,
            sampleLinks: links.slice(0, 20),
            hasAccessDenied: bodyText.toLowerCase().includes('access denied') ||
                            bodyText.toLowerCase().includes('not authorized') ||
                            bodyText.toLowerCase().includes('subscription'),
            bodyPreview: bodyText.substring(0, 1000)
        };
    });
    
    console.log(`   Page title: ${listPageCheck.title}`);
    console.log(`   Total links on page: ${listPageCheck.linkCount}`);
    console.log(`   Body length: ${listPageCheck.bodyLength} chars`);
    
    if (listPageCheck.hasAccessDenied) {
        console.log('   ⚠️ Access denied message detected!');
        console.log(`   Preview: ${listPageCheck.bodyPreview.substring(0, 300)}`);
    }
    
    // Log sample links for debugging
    if (debug) {
        console.log(`   Sample links found:`);
        listPageCheck.sampleLinks.slice(0, 10).forEach((link, i) => {
            console.log(`     ${i + 1}. ${link.text.substring(0, 50)} -> ${link.href.substring(0, 60)}`);
        });
    }
    
    // ========================================
    // STEP 3: EXTRACT ARTICLE LINKS
    // ========================================
    console.log(`\n🔍 Step 3: Finding article links...`);
    
    const articleLinks = await page.evaluate(() => {
        const links = [];
        const allLinks = document.querySelectorAll('a');
        
        for (const link of allLinks) {
            const href = link.href;
            const text = link.textContent.trim();
            
            if (!href || !text || text.length < 10) continue;
            
            // Bradford Tax Institute article patterns
            const isArticle = 
                href.includes('/Content/') ||
                href.includes('/Content_Premium/') ||
                href.includes('/Readers/') ||
                href.includes('Article') ||
                href.includes('.aspx') && (
                    text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) ||  // Date pattern
                    text.includes('Tax') ||
                    text.includes('IRS') ||
                    text.includes('Deduct') ||
                    text.length > 30  // Likely article title
                );
            
            // Exclude navigation links
            const isNavigation = 
                href.includes('Login') ||
                href.includes('logout') ||
                href.includes('Subscribe') ||
                href.includes('Contact') ||
                href.includes('About') ||
                href.includes('javascript:') ||
                href.includes('#') && href.indexOf('#') === href.length - 1;
            
            if (isArticle && !isNavigation) {
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
    
    console.log(`   Found ${articleLinks.length} potential article links`);
    
    if (articleLinks.length === 0) {
        console.log('   ❌ No articles found!');
        console.log('   This could mean:');
        console.log('     1. Session/login not persisting');
        console.log('     2. Subscription does not include this content');
        console.log('     3. Page structure is different than expected');
        console.log('   Check the debug screenshots and HTML in Key-Value Store');
        
        // Save current page state
        await saveDebugHtml('05-no-articles-found');
        await saveDebugScreenshot('05-no-articles-found');
        
        throw new Error('No articles found - check debug files');
    }
    
    console.log(`   First 5 articles:`);
    articleLinks.slice(0, 5).forEach((link, i) => {
        console.log(`     ${i + 1}. ${link.title.substring(0, 60)}`);
        console.log(`        URL: ${link.url}`);
    });
    
    // ========================================
    // STEP 4: SCRAPE EACH ARTICLE
    // ========================================
    console.log(`\n📚 Step 4: Scraping articles (max ${maxArticles})...\n`);
    
    const articlesToScrape = articleLinks.slice(0, maxArticles);
    
    for (let i = 0; i < articlesToScrape.length; i++) {
        const article = articlesToScrape[i];
        console.log(`📄 Article ${i + 1}/${articlesToScrape.length}: ${article.title.substring(0, 50)}...`);
        console.log(`   URL: ${article.url}`);
        
        try {
            await page.goto(article.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            await delay(2000);
            
            // Save first article for debugging
            if (i === 0 && debug) {
                await saveDebugScreenshot('06-first-article');
                await saveDebugHtml('06-first-article');
            }
            
            // Check page state
            const pageState = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                const bodyHtml = document.body.innerHTML;
                
                return {
                    url: window.location.href,
                    title: document.title,
                    bodyLength: bodyText.length,
                    hasLoginForm: !!document.querySelector('input[type="password"]'),
                    hasAccessDenied: bodyText.toLowerCase().includes('access denied') ||
                                    bodyText.toLowerCase().includes('please login') ||
                                    bodyText.toLowerCase().includes('subscription required'),
                    bodyPreview: bodyText.substring(0, 300)
                };
            });
            
            // Check for session issues
            if (pageState.hasLoginForm) {
                console.log(`   🔴 Session expired - login form detected`);
                console.log(`   Attempting to re-login...`);
                
                // TODO: Could implement re-login logic here
                await saveDebugScreenshot(`error-session-expired-${i}`);
                continue;
            }
            
            if (pageState.hasAccessDenied) {
                console.log(`   🔴 Access denied for this article`);
                console.log(`   Preview: ${pageState.bodyPreview}`);
                continue;
            }
            
            if (pageState.bodyLength < 100) {
                console.log(`   🔴 Page appears empty (${pageState.bodyLength} chars)`);
                console.log(`   Preview: ${pageState.bodyPreview}`);
                await saveDebugScreenshot(`error-empty-page-${i}`);
                continue;
            }
            
            // Extract article content with multiple strategies
            const articleData = await page.evaluate(() => {
                // Strategy 1: Look for main content containers
                const contentSelectors = [
                    '#ContentPlaceHolder1_lblArticle',
                    '#ContentPlaceHolder1_pnlArticle',
                    '#ContentPlaceHolder1',
                    '.article-content',
                    '.article-body',
                    '#article-content',
                    '#article',
                    'article',
                    '.content-main',
                    '.main-content',
                    '[class*="article"]',
                    '[id*="article"]',
                    'main'
                ];
                
                let content = '';
                let contentSource = 'fallback';
                
                for (const selector of contentSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.innerText.trim();
                        if (text.length > 200) {
                            content = text;
                            contentSource = selector;
                            break;
                        }
                    }
                }
                
                // Fallback: Get largest text block
                if (content.length < 200) {
                    const allDivs = document.querySelectorAll('div, section, article');
                    let maxLength = 0;
                    
                    for (const div of allDivs) {
                        const text = div.innerText.trim();
                        if (text.length > maxLength && text.length < 50000) {
                            // Avoid getting the entire body
                            const childDivs = div.querySelectorAll('div').length;
                            if (childDivs < 20) { // Not too nested
                                maxLength = text.length;
                                content = text;
                                contentSource = 'largest-block';
                            }
                        }
                    }
                }
                
                // Final fallback: Clean body text
                if (content.length < 200) {
                    const clone = document.body.cloneNode(true);
                    const remove = clone.querySelectorAll('nav, header, footer, script, style, aside, .sidebar, .menu, .nav');
                    remove.forEach(el => el.remove());
                    content = clone.innerText.trim();
                    contentSource = 'cleaned-body';
                }
                
                // Extract title
                const titleSelectors = [
                    'h1',
                    '.article-title',
                    '#ContentPlaceHolder1_lblTitle',
                    '[class*="title"]',
                    'title'
                ];
                
                let title = '';
                for (const sel of titleSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText.trim().length > 5) {
                        title = el.innerText.trim();
                        break;
                    }
                }
                
                // Extract date if present
                const datePatterns = document.body.innerText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
                const articleDate = datePatterns ? datePatterns[0] : null;
                
                return {
                    title: title || document.title,
                    content,
                    contentSource,
                    contentLength: content.length,
                    url: window.location.href,
                    articleDate,
                    pageTitle: document.title
                };
            });
            
            console.log(`   Content extracted: ${articleData.contentLength} chars (via ${articleData.contentSource})`);
            
            if (articleData.contentLength < 100) {
                console.log(`   ⚠️ Very short content - may be blocked or empty`);
                console.log(`   Preview: ${articleData.content.substring(0, 200)}`);
                
                // Save anyway with flag
                await Actor.pushData({
                    ...articleData,
                    status: 'possibly-incomplete',
                    scrapedAt: new Date().toISOString(),
                    articleNumber: i + 1
                });
            } else {
                await Actor.pushData({
                    ...articleData,
                    status: 'success',
                    scrapedAt: new Date().toISOString(),
                    articleNumber: i + 1
                });
                
                articlesScraped++;
                console.log(`   ✅ Saved (${articlesScraped}/${maxArticles})\n`);
            }
            
            // Respectful delay
            await delay(1500 + Math.random() * 1000);
            
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}\n`);
            await saveDebugScreenshot(`error-article-${i}`);
            continue;
        }
    }
    
} catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    await saveDebugScreenshot('fatal-error');
    await saveDebugHtml('fatal-error');
    throw error;
} finally {
    await browser.close();
}

console.log('\n\n📊 ===== SCRAPING COMPLETE =====');
console.log(`✅ Articles scraped: ${articlesScraped}`);
console.log(`🎯 Target: ${maxArticles}`);
console.log(`📁 Check Key-Value Store for debug screenshots/HTML`);
console.log('===============================\n');

await Actor.exit();

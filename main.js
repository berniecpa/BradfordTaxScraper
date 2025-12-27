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
let savedCookies = []; // Store cookies globally

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

// Intercept requests to ensure cookies are sent
await page.setRequestInterception(true);
page.on('request', request => {
    const headers = request.headers();
    // Ensure cookies are included
    if (savedCookies.length > 0) {
        const cookieString = savedCookies.map(c => `${c.name}=${c.value}`).join('; ');
        headers['Cookie'] = cookieString;
    }
    request.continue({ headers });
});

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

// Function to check if we're logged in on current page
async function checkLoginStatus() {
    return await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const hasLogout = bodyText.includes('Logout') || bodyText.includes('Log Out');
        const hasLoginForm = !!document.querySelector('#ContentPlaceHolder1_txtUserName') ||
                            !!document.querySelector('input[id*="txtUserName"]');
        const hasLoginPrompt = bodyText.includes('Log in to view full article') ||
                              bodyText.includes('Already a subscriber?');
        return {
            isLoggedIn: hasLogout && !hasLoginForm,
            hasLoginForm,
            hasLoginPrompt,
            hasLogout
        };
    });
}

// Function to perform login (can be called on any page with login form)
async function performLogin() {
    console.log('   🔐 Performing login...');
    
    // Find the username field (might have different IDs on different pages)
    const usernameSelectors = [
        '#ContentPlaceHolder1_txtUserName',
        'input[id*="txtUserName"]',
        'input[name*="UserName"]',
        'input[type="text"][id*="Email"]'
    ];
    
    const passwordSelectors = [
        '#ContentPlaceHolder1_txtUserPass',
        'input[id*="txtUserPass"]',
        'input[id*="txtPassword"]',
        'input[type="password"]'
    ];
    
    const loginButtonSelectors = [
        '#ContentPlaceHolder1_cmdLogin',
        'input[id*="cmdLogin"]',
        'a[id*="cmdLogin"]',
        'button[type="submit"]'
    ];
    
    let usernameField = null;
    let passwordField = null;
    let loginButton = null;
    
    for (const sel of usernameSelectors) {
        usernameField = await page.$(sel);
        if (usernameField) {
            console.log(`   Found username field: ${sel}`);
            break;
        }
    }
    
    for (const sel of passwordSelectors) {
        passwordField = await page.$(sel);
        if (passwordField) {
            console.log(`   Found password field: ${sel}`);
            break;
        }
    }
    
    for (const sel of loginButtonSelectors) {
        loginButton = await page.$(sel);
        if (loginButton) {
            console.log(`   Found login button: ${sel}`);
            break;
        }
    }
    
    if (!usernameField || !passwordField) {
        console.log('   ❌ Could not find login form fields');
        return false;
    }
    
    // Clear and fill credentials
    await usernameField.click({ clickCount: 3 });
    await usernameField.type(username, { delay: 30 });
    
    await passwordField.click({ clickCount: 3 });
    await passwordField.type(password, { delay: 30 });
    
    // Click login
    if (loginButton) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
            loginButton.click()
        ]);
    } else {
        // Try pressing Enter
        await passwordField.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);
    }
    
    await delay(3000);
    
    // Save cookies after login
    savedCookies = await page.cookies();
    console.log(`   📦 Saved ${savedCookies.length} cookies after login`);
    
    // Log the important auth cookies
    const authCookies = savedCookies.filter(c => 
        c.name.includes('EMS_') || 
        c.name.includes('Auth') || 
        c.name.includes('Session')
    );
    authCookies.forEach(c => {
        console.log(`      ${c.name}: ${c.value.substring(0, 20)}... (domain: ${c.domain}, path: ${c.path})`);
    });
    
    return true;
}

// Function to ensure cookies are set for the domain
async function ensureCookiesSet() {
    if (savedCookies.length === 0) return;
    
    // Set cookies with broader scope
    const broadCookies = savedCookies.map(cookie => ({
        ...cookie,
        domain: '.bradfordtaxinstitute.com', // Ensure domain-wide
        path: '/' // Ensure site-wide
    }));
    
    await page.setCookie(...broadCookies);
}

try {
    // ========================================
    // STEP 1: INITIAL LOGIN
    // ========================================
    console.log('\n🔐 Step 1: Logging in...');
    
    await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });
    
    await page.waitForSelector('#ContentPlaceHolder1_txtUserName', { timeout: 10000 });
    
    await performLogin();
    
    // Verify login worked
    const loginStatus = await checkLoginStatus();
    console.log(`   Login status:`, loginStatus);
    
    if (!loginStatus.isLoggedIn && !loginStatus.hasLogout) {
        await saveDebug('login-failed');
        throw new Error('Login failed - check credentials');
    }
    
    console.log('✅ Login successful!\n');
    
    // ========================================
    // STEP 2: NAVIGATE TO ARTICLE LIST
    // ========================================
    console.log(`📋 Step 2: Navigating to article list...`);
    console.log(`   URL: ${startUrl}`);
    
    // Ensure cookies before navigation
    await ensureCookiesSet();
    
    await page.goto(startUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
    });
    
    await delay(2000);
    await saveDebug('article-list');
    
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
    
    console.log(`   Found ${articleLinks.length} articles`);
    
    if (articleLinks.length === 0) {
        await saveDebug('no-articles');
        throw new Error('No articles found');
    }
    
    articleLinks.slice(0, 5).forEach((link, i) => {
        console.log(`      ${i + 1}. ${link.title.substring(0, 55)}`);
    });
    
    // ========================================
    // STEP 4: SCRAPE EACH ARTICLE
    // ========================================
    console.log(`\n📚 Step 4: Scraping articles (max ${maxArticles})...\n`);
    
    const articlesToScrape = articleLinks.slice(0, maxArticles);
    
    for (let i = 0; i < articlesToScrape.length; i++) {
        const article = articlesToScrape[i];
        console.log(`📄 [${i + 1}/${articlesToScrape.length}] ${article.title.substring(0, 50)}...`);
        
        try {
            // CRITICAL: Ensure cookies are set before each navigation
            await ensureCookiesSet();
            
            await page.goto(article.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            await delay(2000);
            
            // Check if we need to re-login on this page
            const pageStatus = await checkLoginStatus();
            console.log(`   Page status: loggedIn=${pageStatus.isLoggedIn}, hasLoginPrompt=${pageStatus.hasLoginPrompt}`);
            
            if (pageStatus.hasLoginPrompt || pageStatus.hasLoginForm) {
                console.log('   ⚠️ Session lost - re-authenticating on article page...');
                
                if (i === 0) {
                    await saveDebug('article-needs-login');
                }
                
                // Try to login directly on this article page
                const loginSuccess = await performLogin();
                
                if (!loginSuccess) {
                    console.log('   ❌ Re-login failed, skipping article');
                    continue;
                }
                
                // Page should now show full content after login
                await delay(2000);
                
                // Verify we now have access
                const newStatus = await checkLoginStatus();
                if (newStatus.hasLoginPrompt) {
                    console.log('   ❌ Still seeing login prompt after re-auth');
                    await saveDebug(`article-${i}-still-blocked`);
                    continue;
                }
            }
            
            // Save first article for debugging
            if (i === 0) {
                await saveDebug('first-article-content');
            }
            
            // Extract article content
            const articleData = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                
                // Check if we're seeing the paywall
                if (bodyText.includes('Log in to view full article')) {
                    return {
                        blocked: true,
                        preview: bodyText.substring(0, 500)
                    };
                }
                
                // Bradford Tax Institute content selectors
                const contentSelectors = [
                    '#ContentPlaceHolder1_lblArticle',
                    '#ContentPlaceHolder1_pnlArticle',
                    '#ContentPlaceHolder1',
                    '.article-content',
                    'article'
                ];
                
                let content = '';
                let contentSource = '';
                
                for (const selector of contentSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.innerText.trim();
                        // Make sure we're getting more than just the teaser
                        if (text.length > 500 && !text.includes('Log in to view full article')) {
                            content = text;
                            contentSource = selector;
                            break;
                        }
                    }
                }
                
                // Fallback
                if (content.length < 500) {
                    const clone = document.body.cloneNode(true);
                    clone.querySelectorAll('nav, header, footer, script, style, aside').forEach(el => el.remove());
                    const cleanText = clone.innerText.trim();
                    if (!cleanText.includes('Log in to view full article') || cleanText.length > 2000) {
                        content = cleanText;
                        contentSource = 'body-cleaned';
                    }
                }
                
                // Get metadata
                const h1 = document.querySelector('h1');
                const title = h1 ? h1.innerText.trim() : document.title;
                
                // Word count (Bradford shows this)
                const wordCountMatch = bodyText.match(/Word Count:\s*(\d+)/);
                const wordCount = wordCountMatch ? parseInt(wordCountMatch[1]) : null;
                
                // Article date
                const dateMatch = bodyText.match(/Article Date:\s*([A-Za-z]+\s+\d{4})/);
                const articleDate = dateMatch ? dateMatch[1] : null;
                
                return {
                    blocked: false,
                    title,
                    content,
                    contentSource,
                    contentLength: content.length,
                    wordCount,
                    articleDate,
                    url: window.location.href
                };
            });
            
            if (articleData.blocked) {
                console.log('   🔴 BLOCKED - Still seeing paywall');
                console.log(`   Preview: ${articleData.preview.substring(0, 100)}...`);
                await saveDebug(`article-${i}-blocked`);
                continue;
            }
            
            console.log(`   ✅ ${articleData.contentLength} chars | ${articleData.wordCount || '?'} words`);
            
            await Actor.pushData({
                ...articleData,
                originalTitle: article.title,
                status: articleData.contentLength > 500 ? 'success' : 'partial',
                scrapedAt: new Date().toISOString(),
                articleNumber: i + 1
            });
            
            articlesScraped++;
            
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

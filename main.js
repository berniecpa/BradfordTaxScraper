import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

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

// STEP 1: Authenticate and get session
console.log('\n🔐 Step 1: Authenticating...');

const loginResult = await Actor.call('pocesar/login-session', {
    username,
    password,
    website: [{ 
        url: 'https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx' 
    }],
    sessionConfig: {
        storageName: 'bradford-tax-sessions',
        maxAgeSecs: 86400,
        maxUsageCount: 100,
        maxPoolSize: 10
    },
    steps: [{
        username: {
            selector: '#ContentPlaceHolder1_txtUserName',
            timeoutMillis: 10000
        },
        password: {
            selector: '#ContentPlaceHolder1_txtUserPass',
            timeoutMillis: 10000
        },
        submit: {
            selector: '#ContentPlaceHolder1_cmdLogin'
        },
        success: {
            selector: 'body:not(:has(#ContentPlaceHolder1_txtUserName))',
            timeoutMillis: 15000
        },
        failed: {
            selector: '.error, .alert, div[id*="error" i], span[id*="error" i]',
            timeoutMillis: 5000
        },
        waitForMillis: 5000
    }],
    cookieDomains: [
        'https://bradfordtaxinstitute.com',
        'https://tsc.bradfordtaxinstitute.com'
    ],
    proxyConfiguration: { 
        useApifyProxy: true 
    }
});

// Check login success
if (loginResult.output.error) {
    throw new Error(`❌ Login failed: ${loginResult.output.error}`);
}

const { session } = loginResult.output;
console.log('✅ Authentication successful! Session ID:', session.id);

// STEP 2: Load the session pool
console.log('\n📦 Step 2: Loading session pool...');
const sessionPool = await Actor.openSessionPool({
    persistStateKeyValueStoreId: 'bradford-tax-sessions'
});

const authenticatedSession = sessionPool.sessions.find(s => s.id === session.id);
console.log('✅ Session loaded');

// STEP 3: Scrape articles
console.log('\n🕷️  Step 3: Starting article scraping...');

let articlesFound = 0;
let articlesScraped = 0;

const crawler = new PuppeteerCrawler({
    sessionPool,
    
    async requestHandler({ request, page }) {
        const url = request.url;
        
        // Handle article list page
        if (url.includes('tr_MonthList') || url.includes('Issue-')) {
            console.log(`📋 Processing list page: ${url}`);
            
            // Wait for content to load
            await page.waitForTimeout(2000);
            
            // Extract article links
            const articleLinks = await page.evaluate(() => {
                const links = [];
                // Try multiple selectors for article links
                const selectors = [
                    'a[href*="Content"]',
                    'a[href*="aspx"]',
                    '.article-link',
                    'a'
                ];
                
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const link of elements) {
                        const href = link.href;
                        const text = link.textContent.trim();
                        
                        // Filter for article links
                        if (href && 
                            (href.includes('/Content/') || 
                             href.includes('/Content_Premium/')) && 
                            text.length > 10) {
                            links.push({
                                url: href,
                                title: text
                            });
                        }
                    }
                    if (links.length > 0) break;
                }
                return links;
            });
            
            console.log(`   Found ${articleLinks.length} potential article links`);
            articlesFound += articleLinks.length;
            
            // Enqueue articles (limit to maxArticles)
            const linksToEnqueue = articleLinks.slice(0, maxArticles - articlesScraped);
            for (const link of linksToEnqueue) {
                await crawler.requestQueue.addRequest({
                    url: link.url,
                    userData: { 
                        isArticle: true, 
                        title: link.title 
                    }
                });
            }
            
            console.log(`   Enqueued ${linksToEnqueue.length} articles for scraping`);
        }
        
        // Handle individual article page
        if (request.userData.isArticle) {
            console.log(`📄 Scraping article ${articlesScraped + 1}/${maxArticles}: ${url}`);
            
            // Wait for content
            await page.waitForTimeout(1500);
            
            const article = await page.evaluate(() => {
                // Try multiple selectors for different content structures
                const getContent = () => {
                    const selectors = [
                        '.article-content',
                        'article',
                        '[id*="Content"]',
                        '.content',
                        'main',
                        '#ContentPlaceHolder1'
                    ];
                    
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element && element.innerText.length > 100) {
                            return element.innerText;
                        }
                    }
                    return document.body.innerText;
                };
                
                return {
                    title: document.querySelector('h1')?.innerText || 
                           document.querySelector('.title')?.innerText ||
                           document.querySelector('title')?.innerText,
                    author: document.querySelector('.author')?.innerText ||
                            document.querySelector('[class*="author"]')?.innerText,
                    date: document.querySelector('.date')?.innerText ||
                          document.querySelector('[class*="date"]')?.innerText ||
                          document.querySelector('.published')?.innerText,
                    category: document.querySelector('.category')?.innerText ||
                              document.querySelector('[class*="category"]')?.innerText,
                    content: getContent(),
                    url: window.location.href,
                    htmlLength: document.body.innerHTML.length
                };
            });
            
            // Save to dataset
            await Actor.pushData({
                ...article,
                scrapedAt: new Date().toISOString(),
                articleNumber: articlesScraped + 1
            });
            
            articlesScraped++;
            console.log(`   ✅ Saved article ${articlesScraped}/${maxArticles}`);
            
            // Stop if we've reached the max
            if (articlesScraped >= maxArticles) {
                console.log(`\n🎯 Reached maximum articles limit (${maxArticles}). Stopping...`);
                await crawler.autoscaledPool?.abort();
            }
        }
    },
    
    maxRequestsPerCrawl: maxArticles + 50,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 120,
    
    failedRequestHandler: async ({ request }) => {
        console.error(`❌ Request failed: ${request.url}`);
    }
});

// Start crawling from the article list page
await crawler.run([startUrl]);

// Final stats
console.log('\n\n📊 ===== SCRAPING COMPLETE =====');
console.log(`📋 Articles found: ${articlesFound}`);
console.log(`✅ Articles scraped: ${articlesScraped}`);
console.log(`🎯 Target: ${maxArticles}`);
console.log('===============================\n');

await Actor.exit();

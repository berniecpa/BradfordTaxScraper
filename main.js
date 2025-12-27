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

let articlesFound = 0;
let articlesScraped = 0;
let isAuthenticated = false;

const crawler = new PuppeteerCrawler({
    // Use session pool for cookie management
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 1,
        sessionOptions: {
            maxUsageCount: 100,
            maxAgeSecs: 86400, // 24 hours
        }
    },
    
    async requestHandler({ request, page, session }) {
        const url = request.url;
        
        // Handle login if not authenticated
        if (!isAuthenticated) {
            console.log('\n🔐 Logging in to Bradford Tax Institute...');
            
            try {
                // Navigate to login page
                await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                
                console.log('   Filling in credentials...');
                
                // Fill in username
                await page.waitForSelector('#ContentPlaceHolder1_txtUserName', { timeout: 10000 });
                await page.type('#ContentPlaceHolder1_txtUserName', username);
                
                // Fill in password
                await page.waitForSelector('#ContentPlaceHolder1_txtUserPass', { timeout: 10000 });
                await page.type('#ContentPlaceHolder1_txtUserPass', password);
                
                console.log('   Submitting login form...');
                
                // Click login button
                await page.click('#ContentPlaceHolder1_cmdLogin');
                
                // Wait for navigation after login
                await page.waitForNavigation({ 
                    waitUntil: 'networkidle2',
                    timeout: 15000 
                }).catch(() => {
                    console.log('   Navigation timeout (may be normal)');
                });
                
                // Wait a bit for any redirects
                await page.waitForTimeout(3000);
                
                // Check if login was successful
                const loginFormStillVisible = await page.$('#ContentPlaceHolder1_txtUserName');
                
                if (loginFormStillVisible) {
                    // Check for error messages
                    const errorMsg = await page.evaluate(() => {
                        const errorElements = document.querySelectorAll('.error, .alert, [class*="error"]');
                        return errorElements.length > 0 ? errorElements[0].textContent : 'Unknown error';
                    });
                    throw new Error(`Login failed: ${errorMsg}`);
                }
                
                console.log('✅ Login successful!');
                isAuthenticated = true;
                
                // Save cookies to session
                const cookies = await page.cookies();
                session.setCookies(cookies, 'https://bradfordtaxinstitute.com');
                
                // Navigate to start URL
                console.log(`\n📋 Navigating to article list: ${startUrl}`);
                await page.goto(startUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                
            } catch (error) {
                console.error('❌ Login error:', error.message);
                throw error;
            }
        }
        
        // Handle article list page
        if (url.includes('tr_MonthList') || url.includes('Issue-')) {
            console.log(`\n📋 Processing list page: ${url}`);
            
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
            console.log(`\n📄 Scraping article ${articlesScraped + 1}/${maxArticles}: ${url}`);
            
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
    requestHandlerTimeoutSecs: 180,
    
    failedRequestHandler: async ({ request }) => {
        console.error(`❌ Request failed: ${request.url}`);
    }
});

// Start crawling - will login first, then scrape
await crawler.run([startUrl]);

// Final stats
console.log('\n\n📊 ===== SCRAPING COMPLETE =====');
console.log(`📋 Articles found: ${articlesFound}`);
console.log(`✅ Articles scraped: ${articlesScraped}`);
console.log(`🎯 Target: ${maxArticles}`);
console.log('===============================\n');

await Actor.exit();

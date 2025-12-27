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
            
            // Debug: Log the page title and some content
            const pageInfo = await page.evaluate(() => ({
                title: document.title,
                url: window.location.href,
                bodyText: document.body.innerText.substring(0, 500)
            }));
            console.log(`   Page title: ${pageInfo.title}`);
            console.log(`   Page URL: ${pageInfo.url}`);
            console.log(`   Page preview: ${pageInfo.bodyText.substring(0, 200)}...`);
            
            // Debug: Count all links on page
            const allLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return {
                    total: links.length,
                    hrefs: links.slice(0, 10).map(a => ({
                        href: a.href,
                        text: a.textContent.trim().substring(0, 50)
                    }))
                };
            });
            console.log(`   Total links on page: ${allLinks.total}`);
            console.log(`   First 10 links:`, JSON.stringify(allLinks.hrefs, null, 2));
            
            // Extract article links with multiple strategies
            const articleLinks = await page.evaluate(() => {
                const links = [];
                
                // Strategy 1: Look for any links with article-like text
                const allLinks = document.querySelectorAll('a');
                for (const link of allLinks) {
                    const href = link.href;
                    const text = link.textContent.trim();
                    
                    // Look for links that might be articles
                    if (href && text.length > 15) {
                        // Check if it's likely an article
                        const isArticle = 
                            href.includes('/Content/') ||
                            href.includes('/Content_Premium/') ||
                            href.includes('.aspx') ||
                            href.includes('Article') ||
                            href.includes('article') ||
                            text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || // Has a date
                            text.length > 30; // Long text = likely article title
                        
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
            
            console.log(`   Found ${articleLinks.length} potential article links`);
            
            // Debug: Show first few article links found
            if (articleLinks.length > 0) {
                console.log(`   Sample articles found:`);
                articleLinks.slice(0, 3).forEach((link, i) => {
                    console.log(`     ${i + 1}. ${link.title.substring(0, 60)}...`);
                    console.log(`        URL: ${link.url}`);
                });
            } else {
                console.log(`   ⚠️  No article links found. This could mean:`);
                console.log(`      1. Page structure is different than expected`);
                console.log(`      2. Subscription doesn't have access to articles`);
                console.log(`      3. Wrong page loaded`);
                console.log(`   Please check if you can manually access articles when logged in.`);
            }
            
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
            
            // Debug: Show what's on the article page
            const pageDebug = await page.evaluate(() => {
                return {
                    title: document.title,
                    h1: document.querySelector('h1')?.innerText || 'No H1 found',
                    bodyLength: document.body.innerText.length,
                    bodyPreview: document.body.innerText.substring(0, 300),
                    mainSelectors: {
                        hasArticleContent: !!document.querySelector('.article-content'),
                        hasArticle: !!document.querySelector('article'),
                        hasContentId: !!document.querySelector('[id*="Content"]'),
                        hasContent: !!document.querySelector('.content'),
                        hasMain: !!document.querySelector('main'),
                        hasContentPlaceHolder: !!document.querySelector('#ContentPlaceHolder1')
                    }
                };
            });
            
            console.log(`   Page title: ${pageDebug.title}`);
            console.log(`   H1: ${pageDebug.h1}`);
            console.log(`   Body text length: ${pageDebug.bodyLength} chars`);
            console.log(`   Body preview: ${pageDebug.bodyPreview.substring(0, 150)}...`);
            console.log(`   Selector check:`, pageDebug.mainSelectors);
            
            const article = await page.evaluate(() => {
                // Try multiple selectors for different content structures
                const getContent = () => {
                    const selectors = [
                        '.article-content',
                        'article',
                        '[id*="Content"]',
                        '.content',
                        'main',
                        '#ContentPlaceHolder1',
                        '[class*="article"]',
                        '[class*="content"]',
                        'div[id*="article"]',
                        'div[class*="body"]',
                        '.post-content',
                        '.entry-content'
                    ];
                    
                    console.log('Trying content selectors...');
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            const text = element.innerText;
                            console.log(`  ✓ Found with selector: ${selector} (${text.length} chars)`);
                            if (text.length > 100) {
                                return text;
                            }
                        } else {
                            console.log(`  ✗ Not found: ${selector}`);
                        }
                    }
                    
                    // Fallback: Get all text content from body, excluding nav/footer
                    console.log('  Fallback: Using body text');
                    // Remove navigation, headers, footers
                    const clonedBody = document.body.cloneNode(true);
                    const elementsToRemove = clonedBody.querySelectorAll('nav, header, footer, script, style, [role="navigation"], [role="banner"]');
                    elementsToRemove.forEach(el => el.remove());
                    return clonedBody.innerText || document.body.innerText;
                };
                
                return {
                    title: document.querySelector('h1')?.innerText || 
                           document.querySelector('.title')?.innerText ||
                           document.querySelector('title')?.innerText,
                    author: document.querySelector('.author')?.innerText ||
                            document.querySelector('[class*="author"]')?.innerText ||
                            document.querySelector('.byline')?.innerText,
                    date: document.querySelector('.date')?.innerText ||
                          document.querySelector('[class*="date"]')?.innerText ||
                          document.querySelector('.published')?.innerText ||
                          document.querySelector('time')?.innerText,
                    category: document.querySelector('.category')?.innerText ||
                              document.querySelector('[class*="category"]')?.innerText ||
                              document.querySelector('.topic')?.innerText,
                    content: getContent(),
                    url: window.location.href,
                    htmlLength: document.body.innerHTML.length
                };
            });
            
            console.log(`   Extracted content length: ${article.content?.length || 0} chars`);
            if (article.content?.length > 0) {
                console.log(`   Content preview: ${article.content.substring(0, 100)}...`);
            } else {
                console.log(`   ⚠️  WARNING: Content is empty!`);
            }
            
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

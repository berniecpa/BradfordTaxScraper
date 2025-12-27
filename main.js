import { Actor } from 'apify';
import puppeteer from 'puppeteer';

await Actor.init();

const input = await Actor.getInput();
const { username, password } = input;

const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
await page.setViewport({ width: 1920, height: 1080 });

const delay = ms => new Promise(r => setTimeout(r, ms));

try {
    // 1. LOGIN
    console.log('Logging in...');
    await page.goto('https://bradfordtaxinstitute.com/EMS_Utilities/EMS_Login_NoSub.aspx', { waitUntil: 'networkidle2' });
    
    await page.type('#ContentPlaceHolder1_txtUserName', username);
    await page.type('#ContentPlaceHolder1_txtUserPass', password);
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#ContentPlaceHolder1_cmdLogin')
    ]);
    await delay(2000);
    console.log('Login done');
    
    // 2. GO TO ONE ARTICLE
    console.log('\nGoing to article...');
    await page.goto('https://bradfordtaxinstitute.com/Content/Form-1099-DA-Is-Here-How-It-Will-Impact-Your-Crypto-Taxes.aspx', { waitUntil: 'networkidle2' });
    await delay(3000);
    
    // Get the content frame
    const frames = page.frames();
    const contentFrame = frames.find(f => f.url().includes('EMS_Viewer'));
    
    if (!contentFrame) {
        console.log('Content frame not found!');
        await browser.close();
        await Actor.exit();
        return;
    }
    
    console.log('Found content frame:', contentFrame.url());
    
    // Save the full HTML of the iframe
    const iframeHtml = await contentFrame.content();
    await Actor.setValue('iframe-full.html', iframeHtml, { contentType: 'text/html' });
    console.log('Saved full iframe HTML');
    
    // Find all elements with IDs that might contain article content
    const elementInfo = await contentFrame.evaluate(() => {
        const results = [];
        
        // Check elements with IDs
        const elementsWithId = document.querySelectorAll('[id]');
        elementsWithId.forEach(el => {
            const text = el.innerText || '';
            if (text.length > 500) {
                results.push({
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                    textLength: text.length,
                    preview: text.slice(0, 150).replace(/\n/g, ' ')
                });
            }
        });
        
        // Also check common article containers
        const selectors = [
            '#ContentPlaceHolder1',
            '#ContentPlaceHolder1_pnlArticle', 
            '#ContentPlaceHolder1_lblArticle',
            '.article',
            '.article-content',
            '.content',
            'article',
            'main',
            '#main',
            '#content'
        ];
        
        selectors.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) {
                const text = el.innerText || '';
                results.push({
                    selector: sel,
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                    textLength: text.length,
                    preview: text.slice(0, 150).replace(/\n/g, ' ')
                });
            }
        });
        
        return results;
    });
    
    console.log('\n=== Elements with substantial content ===\n');
    elementInfo.forEach(info => {
        console.log(`${info.selector || '#' + info.id}: ${info.textLength} chars`);
        console.log(`  Tag: ${info.tag}, Class: ${info.className}`);
        console.log(`  Preview: ${info.preview.slice(0, 80)}...`);
        console.log('');
    });
    
    // Try to find article-specific content by looking for the H1
    const articleStructure = await contentFrame.evaluate(() => {
        const h1 = document.querySelector('h1');
        if (!h1) return { found: false };
        
        // Walk up from h1 to find the article container
        let container = h1.parentElement;
        const hierarchy = [{ tag: 'h1', id: h1.id, class: h1.className }];
        
        while (container && container !== document.body) {
            hierarchy.push({
                tag: container.tagName,
                id: container.id,
                class: container.className,
                textLength: container.innerText.length
            });
            container = container.parentElement;
        }
        
        return { found: true, hierarchy };
    });
    
    console.log('\n=== H1 hierarchy (walking up from article title) ===\n');
    if (articleStructure.found) {
        articleStructure.hierarchy.forEach((el, i) => {
            console.log(`${'  '.repeat(i)}${el.tag} id="${el.id}" class="${el.class}" ${el.textLength ? `(${el.textLength} chars)` : ''}`);
        });
    } else {
        console.log('H1 not found');
    }
    
} catch (err) {
    console.error('Error:', err.message);
} finally {
    await browser.close();
}

await Actor.exit();

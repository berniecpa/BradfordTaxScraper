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
    
    // Screenshot
    const screenshot = await page.screenshot({ fullPage: true });
    await Actor.setValue('article.png', screenshot, { contentType: 'image/png' });
    console.log('Screenshot saved');
    
    // Try different ways to get content
    console.log('\n--- Testing content extraction ---\n');
    
    // Method 1: page.content()
    const html = await page.content();
    console.log('1. page.content() length:', html.length);
    console.log('   First 200 chars:', html.slice(0, 200));
    
    // Method 2: Simple evaluate
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\n2. document.body.innerText length:', bodyText ? bodyText.length : 'NULL');
    if (bodyText) {
        console.log('   First 200 chars:', bodyText.slice(0, 200));
    }
    
    // Method 3: Check if in iframe
    const frames = page.frames();
    console.log('\n3. Number of frames:', frames.length);
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        console.log(`   Frame ${i}: ${frame.url()}`);
        try {
            const frameContent = await frame.evaluate(() => document.body?.innerText?.slice(0, 100));
            console.log(`   Content: ${frameContent}`);
        } catch (e) {
            console.log(`   Error: ${e.message}`);
        }
    }
    
    // Method 4: $eval
    try {
        const bodyText2 = await page.$eval('body', el => el.innerText);
        console.log('\n4. $eval body length:', bodyText2.length);
        console.log('   First 200 chars:', bodyText2.slice(0, 200));
    } catch (e) {
        console.log('\n4. $eval error:', e.message);
    }
    
    // Method 5: Get all text nodes
    const allText = await page.evaluate(() => {
        return document.documentElement.outerHTML.slice(0, 500);
    });
    console.log('\n5. documentElement HTML (first 500):', allText);
    
} catch (err) {
    console.error('Error:', err.message);
} finally {
    await browser.close();
}

await Actor.exit();

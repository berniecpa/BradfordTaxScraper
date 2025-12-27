# Bradford Tax Institute Article Scraper

Automated scraper for Bradford Tax Institute articles with authentication and session management.

## Features

- ✅ Automatic login with your credentials
- ✅ Session management (reuses authenticated sessions)
- ✅ Scrapes article metadata and full content
- ✅ Configurable article limit
- ✅ Export to JSON, CSV, or Excel

## What Gets Scraped

For each article, the scraper extracts:
- Title
- Author
- Publication date
- Category
- Full article content
- URL
- Timestamp

## Prerequisites

1. **Active Bradford Tax Institute subscription**
2. **Apify account** (free tier works: https://apify.com/sign-up)
3. Your Bradford Tax Institute login credentials

## Quick Start - Deploy to Apify

### Option 1: Deploy via Apify Console (Recommended)

1. **Login to Apify**: https://console.apify.com
2. **Create New Actor**:
   - Go to Actors → Create new
   - Choose "Empty Actor"
   - Name it "bradford-tax-scraper"

3. **Upload Files**:
   - Copy all files from this repo to the actor
   - Make sure structure is:
     ```
     /src/main.js
     /INPUT_SCHEMA.json
     /package.json
     /.actor/actor.json
     ```

4. **Build the Actor**:
   - Click "Build" button
   - Wait for build to complete (~30 seconds)

5. **Run the Actor**:
   - Click "Start" or "Try for free"
   - Enter your credentials:
     - Email: your@email.com
     - Password: your_password
     - Max Articles: 50
   - Click "Start"

### Option 2: Deploy via CLI

```bash
# Install Apify CLI
npm install -g apify-cli

# Login to Apify
apify login

# Navigate to project folder
cd bradford-tax-scraper

# Deploy
apify push
```

## Configuration

### Input Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `username` | ✅ Yes | - | Your Bradford Tax Institute email |
| `password` | ✅ Yes | - | Your Bradford Tax Institute password |
| `maxArticles` | No | 50 | Maximum number of articles to scrape |
| `startUrl` | No | tr_MonthList.aspx | The article list page URL |

### Example Input

```json
{
  "username": "your.email@example.com",
  "password": "your_password_here",
  "maxArticles": 100,
  "startUrl": "https://bradfordtaxinstitute.com/Readers/tr_MonthList.aspx"
}
```

## How It Works

1. **Authentication**:
   - Calls the `pocesar/login-session` actor
   - Logs into Bradford Tax Institute
   - Stores session cookies in Apify's key-value store
   - Reuses session for subsequent runs (within 24 hours)

2. **Article Discovery**:
   - Navigates to the article list page
   - Extracts all article links
   - Filters for valid article URLs

3. **Content Scraping**:
   - Opens each article page (using authenticated session)
   - Extracts title, author, date, category, content
   - Saves to dataset

4. **Data Export**:
   - Results saved to Apify dataset
   - Download as JSON, CSV, XML, or Excel

## Output Example

```json
{
  "title": "Tax Deductions for Home Office in 2024",
  "author": "Murray Bradford",
  "date": "December 2024",
  "category": "Home Office",
  "content": "Full article text here...",
  "url": "https://bradfordtaxinstitute.com/Content/12345.aspx",
  "scrapedAt": "2024-12-26T18:30:00.000Z",
  "articleNumber": 1,
  "htmlLength": 15234
}
```

## Troubleshooting

### Login Failures

If login fails:
1. Verify your credentials are correct
2. Check if Bradford Tax Institute login page has changed
3. Update selectors in `main.js` if needed

### No Articles Found

If no articles are scraped:
1. Check your subscription is active
2. Verify you can access articles when logged in manually
3. Check the `startUrl` is correct

### Session Expired

Sessions expire after 24 hours. The actor will automatically:
- Create a new session on next run
- Store it for reuse

## Advanced Usage

### Schedule Regular Runs

In Apify Console:
1. Go to your actor → Schedules
2. Create new schedule (e.g., daily at 9 AM)
3. Set input parameters
4. Save

### Integrate with Other Tools

Connect via:
- **Zapier**: Auto-export to Google Sheets, Airtable, etc.
- **Make (Integromat)**: Build complex workflows
- **Webhooks**: Get notified when scrape completes
- **API**: Integrate with your own applications

### API Usage

```javascript
const ApifyClient = require('apify-client');

const client = new ApifyClient({
    token: 'YOUR_API_TOKEN',
});

const run = await client.actor('YOUR_ACTOR_ID').call({
    username: 'your.email@example.com',
    password: 'your_password',
    maxArticles: 100
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

## File Structure

```
bradford-tax-scraper/
├── .actor/
│   └── actor.json          # Actor configuration
├── src/
│   └── main.js             # Main scraper logic
├── INPUT_SCHEMA.json       # Input form definition
├── package.json            # Dependencies
└── README.md              # This file
```

## Cost Estimate

Using Apify's free tier ($5/month credit):
- **Login**: ~$0.01 per run
- **Scraping**: ~$0.10 per 100 articles
- **Monthly estimate**: 500 articles = ~$0.50

Easily fits within free tier for moderate use.

## Security Notes

- ✅ Passwords are encrypted in Apify
- ✅ Sessions stored securely in Apify's infrastructure
- ✅ No credentials stored in code
- ⚠️ Don't share your actor publicly if it contains credentials

## Support

Issues? Questions?
1. Check Apify logs for error messages
2. Review troubleshooting section above
3. Contact: contactus@bradfordtaxinstitute.com (for Bradford site issues)

## License

MIT License - Free to use and modify

## Credits

Built using:
- [Apify](https://apify.com) - Web scraping platform
- [Crawlee](https://crawlee.dev) - Web crawling library
- [pocesar/login-session](https://apify.com/pocesar/login-session) - Authentication helper

---

**Ready to scrape?** Deploy to Apify and start extracting Bradford Tax Institute articles! 🚀

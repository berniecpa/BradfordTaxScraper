# 🚀 QUICK START GUIDE

## Deploy in 5 Minutes

### Step 1: Create Apify Account
1. Go to https://apify.com/sign-up
2. Sign up (free tier is perfect)
3. Verify your email

### Step 2: Create New Actor
1. Login to https://console.apify.com
2. Click "Actors" in left sidebar
3. Click "Create new" → "Empty Actor"
4. Name: `bradford-tax-scraper`
5. Click "Create"

### Step 3: Upload Files

**Option A: Via Console (Easy)**
1. In your actor, click "Source" tab
2. Delete the default `main.js`
3. Upload these files:
   - `src/main.js`
   - `INPUT_SCHEMA.json`
   - `package.json`
   - `.actor/actor.json`

**Option B: Via CLI (Advanced)**
```bash
# Install Apify CLI
npm install -g apify-cli

# Login
apify login

# Navigate to this folder
cd bradford-tax-scraper

# Deploy
apify push
```

### Step 4: Build Actor
1. Click "Build" button (top right)
2. Wait ~30 seconds for build to complete
3. You'll see "Build succeeded" ✅

### Step 5: Run It!
1. Click "Start" or "Try for free"
2. Fill in the form:
   ```
   Email Address: your.email@example.com
   Password: ••••••••••
   Maximum Articles: 50
   ```
3. Click "Start" button
4. Watch it run in real-time!

### Step 6: Get Your Data
1. Once complete, click "Dataset" tab
2. Click "Export" dropdown
3. Choose format: JSON, CSV, Excel, etc.
4. Download your articles!

## Credentials You'll Need

- ✅ Bradford Tax Institute email
- ✅ Bradford Tax Institute password
- ✅ Apify account (free)

## What Happens During First Run

1. 🔐 Logs into Bradford (takes ~10 seconds)
2. 💾 Saves session cookies (reused for 24 hours)
3. 📋 Finds articles from list page
4. 📄 Scrapes each article's full content
5. ✅ Saves everything to dataset

## Cost

**Free Tier ($5/month credit):**
- 500 articles/month = ~$0.50
- Plenty of headroom for testing!

## Troubleshooting First Run

### ❌ "Login failed"
- Double-check username/password
- Try logging in manually on Bradford's site first
- Check if your subscription is active

### ❌ "No articles found"
- Verify you have an active subscription
- Check if you can see articles when logged in manually
- The scraper needs access to protected content

### ❌ Build errors
- Make sure all files are uploaded correctly
- Check file structure matches exactly
- Rebuild by clicking "Build" again

## Next Steps

✅ **Schedule Regular Runs:**
- Go to "Schedules" tab
- Create daily/weekly schedule
- Auto-export to Google Sheets via Zapier

✅ **Integrate with Tools:**
- Zapier integration
- Make (Integromat) workflows
- Direct API access

✅ **Monitor Performance:**
- Check "Runs" tab for history
- View logs for debugging
- Track costs in "Billing"

---

**Questions?** Check the full README.md for detailed docs!

**Ready?** Let's deploy! 🚀

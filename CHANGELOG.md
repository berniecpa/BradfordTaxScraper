# 🔧 CHANGELOG - Updates

## Version 1.0.2 - File Structure Fix (Current)

### 🐛 Bug Fix - Correct File Structure for Apify

**Issue:**
- Apify couldn't find main.js
- Error: `Cannot find module '/usr/src/app/src/main.js'`

**Root Cause:**
- main.js was in `src/` folder
- Apify expects it at root level

**Fix Applied:**
1. Moved `main.js` to root level
2. Updated `package.json` to point to `main.js` (not `src/main.js`)
3. Created **FILE_STRUCTURE_FIX.md** with upload instructions

**Correct Structure:**
```
bradford-tax-scraper/
├── main.js           ← ROOT LEVEL (was in src/)
├── package.json      ← ROOT LEVEL
├── INPUT_SCHEMA.json ← ROOT LEVEL
└── .actor/
    └── actor.json
```

### 🎯 Impact
- ✅ Apify will now find main.js correctly
- ✅ Build will succeed
- ✅ Actor will run

---

## Version 1.0.1 - Selector Fix

### 🐛 Bug Fix - Correct Password Selector

**Issue:**
- Initially guessed password field was `#ContentPlaceHolder1_txtPassword`
- Actual field is `#ContentPlaceHolder1_txtUserPass`

**Fix Applied:**
Updated `src/main.js` with correct selectors from actual HTML:

```javascript
// BEFORE (incorrect guess)
password: {
    selector: '#ContentPlaceHolder1_txtPassword'
}

// AFTER (verified from HTML)
password: {
    selector: '#ContentPlaceHolder1_txtUserPass'
}
```

### ✅ Verified Selectors

All selectors now confirmed from actual Bradford Tax Institute HTML:

| Field | Selector | Status |
|-------|----------|--------|
| Username | `#ContentPlaceHolder1_txtUserName` | ✅ Verified |
| Password | `#ContentPlaceHolder1_txtUserPass` | ✅ Fixed |
| Login Button | `#ContentPlaceHolder1_cmdLogin` | ✅ Verified |

### 📄 New File Added

**SELECTORS.md** - Complete selector reference with HTML examples

### 🎯 Impact

- ✅ Login will now work correctly
- ✅ No other changes needed
- ✅ Ready for production deployment

---

## Version 1.0.0 - Initial Release

- ✅ Complete scraper implementation
- ✅ Two-actor authentication architecture
- ✅ Session management
- ✅ Article extraction
- ✅ Full documentation

---

**Current Status:** Production-ready with verified selectors! 🚀

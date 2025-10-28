# 🔐 Password Protection Setup

Your Chaos Bot website is now password protected!

## Default Password

```
chaos2024
```

**⚠️ IMPORTANT: Change this password immediately!**

---

## How to Change Password

1. Open `webapp/auth.js`
2. Find line 2:
   ```javascript
   const AUTH_PASSWORD = 'chaos2024'; // Change this to your secure password
   ```
3. Replace `'chaos2024'` with your own password:
   ```javascript
   const AUTH_PASSWORD = 'your_super_secure_password';
   ```
4. Save the file
5. Commit and push to GitHub:
   ```bash
   git add webapp/auth.js
   git commit -m "Update password"
   git push origin main
   ```
6. Wait for Netlify to redeploy (2-3 minutes)

---

## How It Works

- **First visit:** Login screen appears
- **After login:** 20-minute session starts
- **Refreshing page:** Stays logged in (within 20 minutes)
- **After 20 minutes:** Must login again
- **Session storage:** Uses localStorage
- **Security:** Password is in plain text in code (client-side only)

---

## Security Notes

⚠️ **This is basic client-side protection:**
- Password is visible in source code
- Anyone can read the JavaScript file
- Good for keeping casual visitors out
- **NOT suitable for highly sensitive data**

### For Better Security:
- Use a backend authentication system
- Implement JWT tokens
- Use environment variables for passwords
- Add rate limiting
- Use HTTPS only (Netlify provides this)

---

## Session Duration

Current setting: **20 minutes**

To change this, edit line 3 in `webapp/auth.js`:
```javascript
const SESSION_DURATION = 20 * 60 * 1000; // 20 minutes

// Examples:
// 10 minutes: 10 * 60 * 1000
// 30 minutes: 30 * 60 * 1000
// 1 hour:     60 * 60 * 1000
```

---

## Troubleshooting

**Can't login?**
- Check console for errors (F12)
- Verify password is correct
- Clear localStorage and try again

**Want to force logout?**
Open browser console and run:
```javascript
localStorage.removeItem('chaos_auth');
location.reload();
```

**Session expired too fast?**
- Increase `SESSION_DURATION` in auth.js
- Clear cache after changing

---

## Features

✅ Password protection on all pages  
✅ 20-minute session with auto-logout  
✅ Stays logged in on refresh  
✅ Secure visual design  
✅ Mobile-friendly login screen  
✅ Shake animation on wrong password  
✅ Auto-focus on password input  

---

**Remember to change the default password!** 🔒


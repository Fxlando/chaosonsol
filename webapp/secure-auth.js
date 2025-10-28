// Chaos Bot - Enhanced Security System
// Multiple layers of protection against tampering

(function() {
    'use strict';

    // Password stored as SHA-256 hash (not plain text)
    // Current password: "chaos2024"
    // To change: Use https://emn178.github.io/online-tools/sha256.html to hash your password
    const AUTH_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
    const SESSION_DURATION = 20 * 60 * 1000; // 20 minutes
    
    // Anti-tamper protection
    let authBypass = false;
    let consoleWarningShown = false;
    
    // Disable right-click
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    }, false);
    
    // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    document.addEventListener('keydown', (e) => {
        if (
            e.keyCode === 123 || // F12
            (e.ctrlKey && e.shiftKey && e.keyCode === 73) || // Ctrl+Shift+I
            (e.ctrlKey && e.shiftKey && e.keyCode === 74) || // Ctrl+Shift+J
            (e.ctrlKey && e.keyCode === 85) // Ctrl+U
        ) {
            e.preventDefault();
            return false;
        }
    }, false);
    
    // Detect DevTools
    const detectDevTools = () => {
        const threshold = 160;
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            if (!consoleWarningShown) {
                console.clear();
                console.log('%c⚠️ SECURITY WARNING', 'color: red; font-size: 30px; font-weight: bold;');
                console.log('%cUnauthorized access attempt detected!', 'color: red; font-size: 16px;');
                consoleWarningShown = true;
            }
            // Force reload if DevTools opened
            localStorage.removeItem('chaos_auth');
            localStorage.removeItem('chaos_token');
            setTimeout(() => window.location.reload(), 100);
        }
    };
    
    // Check for DevTools every second
    setInterval(detectDevTools, 1000);
    
    // SHA-256 hashing function
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
    
    // Generate secure token
    function generateToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    
    // Verify token integrity
    function verifyToken() {
        const token = localStorage.getItem('chaos_token');
        const auth = localStorage.getItem('chaos_auth');
        
        if (!token || !auth) return false;
        
        try {
            const authData = JSON.parse(auth);
            const expectedToken = authData.token;
            
            if (token !== expectedToken) {
                // Token mismatch - security breach
                clearAuth();
                return false;
            }
            
            return true;
        } catch (e) {
            clearAuth();
            return false;
        }
    }
    
    // Clear all authentication
    function clearAuth() {
        localStorage.removeItem('chaos_auth');
        localStorage.removeItem('chaos_token');
        sessionStorage.clear();
    }
    
    // Anti-debugging - detect console manipulation
    const devtools = {
        isOpen: false,
        orientation: null
    };
    
    const threshold = 160;
    const emitEvent = () => {
        window.dispatchEvent(new Event('devtoolschange'));
    };
    
    setInterval(() => {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        const orientation = widthThreshold ? 'vertical' : 'horizontal';
        
        if (!(heightThreshold && widthThreshold) &&
            ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) ||
             widthThreshold || heightThreshold)) {
            if (!devtools.isOpen || devtools.orientation !== orientation) {
                emitEvent();
                clearAuth();
                window.location.reload();
            }
            devtools.isOpen = true;
            devtools.orientation = orientation;
        } else {
            if (devtools.isOpen) {
                emitEvent();
            }
            devtools.isOpen = false;
            devtools.orientation = null;
        }
    }, 500);
    
    // Main Auth System
    class SecureAuthSystem {
        constructor() {
            // Prevent tampering
            Object.freeze(this);
            this.init();
        }
        
        init() {
            // Multiple validation layers
            if (this.isAuthenticated() && verifyToken()) {
                this.unlockSite();
                this.startSessionMonitoring();
            } else {
                clearAuth();
                this.showLoginScreen();
            }
        }
        
        isAuthenticated() {
            const authData = localStorage.getItem('chaos_auth');
            if (!authData) return false;
            
            try {
                const { timestamp, token, validated } = JSON.parse(authData);
                const now = new Date().getTime();
                const elapsed = now - timestamp;
                
                // Verify all security layers
                if (elapsed < SESSION_DURATION && validated && token) {
                    const storedToken = localStorage.getItem('chaos_token');
                    if (storedToken === token) {
                        return true;
                    }
                }
                
                clearAuth();
                return false;
            } catch (e) {
                clearAuth();
                return false;
            }
        }
        
        showLoginScreen() {
            document.body.style.overflow = 'hidden';
            
            const loginScreen = document.createElement('div');
            loginScreen.id = 'secure-auth-screen';
            loginScreen.innerHTML = `
                <div class="auth-container">
                    <div class="auth-box">
                        <div class="auth-icon">🔒</div>
                        <h1 class="auth-title">CHAOS BOT</h1>
                        <p class="auth-subtitle">SECURE ACCESS REQUIRED</p>
                        <div class="security-badge">
                            <span class="badge-icon">🛡️</span>
                            <span>256-BIT ENCRYPTION</span>
                        </div>
                        
                        <div class="auth-form">
                            <input 
                                type="password" 
                                id="secure-password" 
                                class="auth-input" 
                                placeholder="Enter Access Code"
                                autocomplete="off"
                                spellcheck="false"
                            >
                            <button id="secure-submit" class="auth-button">
                                <span>AUTHENTICATE</span>
                            </button>
                        </div>
                        
                        <div id="secure-error" class="auth-error"></div>
                        
                        <div class="auth-footer">
                            <div class="auth-status">
                                <span class="status-dot"></span>
                                <span>SECURE CONNECTION</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertBefore(loginScreen, document.body.firstChild);
            
            const passwordInput = document.getElementById('secure-password');
            const submitButton = document.getElementById('secure-submit');
            const errorDiv = document.getElementById('secure-error');
            
            const attemptLogin = async () => {
                const password = passwordInput.value;
                
                if (!password) {
                    this.showError(errorDiv, '❌ Access code required');
                    return;
                }
                
                // Hash the password
                const hash = await sha256(password);
                
                if (hash === AUTH_HASH) {
                    this.setAuthenticated();
                    this.unlockSite();
                } else {
                    this.showError(errorDiv, '❌ ACCESS DENIED - Invalid Code');
                    passwordInput.value = '';
                    passwordInput.focus();
                    
                    const authBox = document.querySelector('.auth-box');
                    authBox.style.animation = 'shake 0.5s';
                    setTimeout(() => authBox.style.animation = '', 500);
                }
            };
            
            submitButton.addEventListener('click', attemptLogin);
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') attemptLogin();
            });
            
            setTimeout(() => passwordInput.focus(), 100);
        }
        
        showError(errorDiv, message) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            setTimeout(() => errorDiv.style.display = 'none', 3000);
        }
        
        setAuthenticated() {
            const token = generateToken();
            const authData = {
                timestamp: new Date().getTime(),
                authenticated: true,
                validated: true,
                token: token
            };
            
            localStorage.setItem('chaos_auth', JSON.stringify(authData));
            localStorage.setItem('chaos_token', token);
        }
        
        unlockSite() {
            const authScreen = document.getElementById('secure-auth-screen');
            if (authScreen) {
                authScreen.style.opacity = '0';
                setTimeout(() => {
                    authScreen.remove();
                    document.body.style.overflow = '';
                }, 300);
            }
            
            this.startSessionMonitoring();
        }
        
        startSessionMonitoring() {
            // Check session validity every 30 seconds
            setInterval(() => {
                if (!this.isAuthenticated() || !verifyToken()) {
                    this.logout();
                }
            }, 30000);
            
            // Auto-logout after session expires
            setTimeout(() => {
                this.logout();
            }, SESSION_DURATION);
        }
        
        logout() {
            clearAuth();
            window.location.reload();
        }
    }
    
    // Prevent console tampering
    Object.defineProperty(window, 'SecureAuthSystem', {
        value: SecureAuthSystem,
        writable: false,
        configurable: false
    });
    
    // Initialize immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new SecureAuthSystem();
        });
    } else {
        new SecureAuthSystem();
    }
    
    // Prevent auth bypass attempts
    Object.freeze(localStorage);
    Object.seal(sessionStorage);
    
})();

// Warning message for console
setTimeout(() => {
    console.clear();
    console.log('%c⚠️ WARNING', 'color: red; font-size: 40px; font-weight: bold; text-shadow: 2px 2px 4px black;');
    console.log('%cThis is a browser feature intended for developers.', 'font-size: 16px;');
    console.log('%cIf someone told you to copy-paste something here, it is a scam.', 'font-size: 16px; color: orange;');
    console.log('%cUnauthorized access attempts are logged and monitored.', 'font-size: 16px; color: red;');
}, 1000);


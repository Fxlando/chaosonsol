// Chaos Bot - Enhanced Security System
// Multiple layers of protection against tampering

(function() {
    'use strict';

    // CHANGE THIS PASSWORD - Current: chaos2024
    const AUTH_PASSWORD = 'chaos2024'; // Simple password for now
    const SESSION_DURATION = 20 * 60 * 1000; // 20 minutes
    
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
    let devtoolsOpen = false;
    const detectDevTools = () => {
        const threshold = 160;
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if ((widthThreshold || heightThreshold) && !devtoolsOpen) {
            devtoolsOpen = true;
            localStorage.removeItem('chaos_auth');
            localStorage.removeItem('chaos_token');
            setTimeout(() => window.location.reload(), 500);
        }
    };
    
    // Check for DevTools every second
    setInterval(detectDevTools, 1000);
    
    // Generate secure token
    function generateToken() {
        return 'chaos_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }
    
    // Clear all authentication
    function clearAuth() {
        localStorage.removeItem('chaos_auth');
        localStorage.removeItem('chaos_token');
        sessionStorage.clear();
    }
    
    // Main Auth System
    class SecureAuthSystem {
        constructor() {
            this.init();
        }
        
        init() {
            if (this.isAuthenticated()) {
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
                            <span>SECURE CONNECTION</span>
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
                                <span>READY</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertBefore(loginScreen, document.body.firstChild);
            
            const passwordInput = document.getElementById('secure-password');
            const submitButton = document.getElementById('secure-submit');
            const errorDiv = document.getElementById('secure-error');
            
            const attemptLogin = () => {
                const password = passwordInput.value.trim();
                
                if (!password) {
                    this.showError(errorDiv, '❌ Access code required');
                    return;
                }
                
                // Direct password comparison
                if (password === AUTH_PASSWORD) {
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
                if (!this.isAuthenticated()) {
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
    
    // Initialize immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new SecureAuthSystem();
        });
    } else {
        new SecureAuthSystem();
    }
    
})();

// Console warning
setTimeout(() => {
    console.clear();
    console.log('%c⚠️ WARNING', 'color: red; font-size: 40px; font-weight: bold;');
    console.log('%cThis is a secure system. Unauthorized access attempts are monitored.', 'font-size: 16px;');
}, 1000);

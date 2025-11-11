// Chaos Bot - Authentication System
const AUTH_PASSWORD = 'chaos2024'; // Change this to your secure password
const SESSION_DURATION = 20 * 60 * 1000; // 20 minutes in milliseconds

class AuthSystem {
    constructor() {
        this.init();
    }

    init() {
        // Check if already authenticated
        if (this.isAuthenticated()) {
            this.unlockSite();
        } else {
            this.showLoginScreen();
        }
    }

    isAuthenticated() {
        const authData = localStorage.getItem('chaos_auth');
        if (!authData) return false;

        try {
            const { timestamp } = JSON.parse(authData);
            const now = new Date().getTime();
            const elapsed = now - timestamp;

            // Check if session is still valid (within 20 minutes)
            if (elapsed < SESSION_DURATION) {
                return true;
            } else {
                // Session expired, clear it
                localStorage.removeItem('chaos_auth');
                return false;
            }
        } catch (e) {
            localStorage.removeItem('chaos_auth');
            return false;
        }
    }

    showLoginScreen() {
        // Hide main app
        document.body.style.overflow = 'hidden';
        
        // Create login screen
        const loginScreen = document.createElement('div');
        loginScreen.id = 'auth-screen';
        loginScreen.innerHTML = `
            <div class="auth-container">
                <div class="auth-box">
                    <div class="auth-icon">⚡</div>
                    <h1 class="auth-title">CHAOS BOT</h1>
                    <p class="auth-subtitle">SECURE ACCESS REQUIRED</p>
                    
                    <div class="auth-form">
                        <input 
                            type="password" 
                            id="auth-password" 
                            class="auth-input" 
                            placeholder="Enter Access Code"
                            autocomplete="off"
                        >
                        <button id="auth-submit" class="auth-button">
                            <span>AUTHENTICATE</span>
                        </button>
                    </div>
                    
                    <div id="auth-error" class="auth-error"></div>
                    
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
        
        // Add event listeners
        const passwordInput = document.getElementById('auth-password');
        const submitButton = document.getElementById('auth-submit');
        const errorDiv = document.getElementById('auth-error');
        
        const attemptLogin = () => {
            const password = passwordInput.value;
            
            if (password === AUTH_PASSWORD) {
                this.setAuthenticated();
                this.unlockSite();
            } else {
                errorDiv.textContent = '❌ ACCESS DENIED - Invalid Code';
                errorDiv.style.display = 'block';
                passwordInput.value = '';
                passwordInput.focus();
                
                // Shake animation
                const authBox = document.querySelector('.auth-box');
                authBox.style.animation = 'shake 0.5s';
                setTimeout(() => {
                    authBox.style.animation = '';
                }, 500);
                
                setTimeout(() => {
                    errorDiv.style.display = 'none';
                }, 3000);
            }
        };
        
        submitButton.addEventListener('click', attemptLogin);
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') attemptLogin();
        });
        
        // Focus input
        setTimeout(() => passwordInput.focus(), 100);
    }

    setAuthenticated() {
        const authData = {
            timestamp: new Date().getTime(),
            authenticated: true
        };
        localStorage.setItem('chaos_auth', JSON.stringify(authData));
    }

    unlockSite() {
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) {
            // Fade out animation
            authScreen.style.opacity = '0';
            setTimeout(() => {
                authScreen.remove();
                document.body.style.overflow = '';
            }, 300);
        }
        
        // Set timeout to auto-logout after 20 minutes
        setTimeout(() => {
            this.logout();
        }, SESSION_DURATION);
    }

    logout() {
        localStorage.removeItem('chaos_auth');
        window.location.reload();
    }
}

// Initialize auth system immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AuthSystem();
    });
} else {
    new AuthSystem();
}

